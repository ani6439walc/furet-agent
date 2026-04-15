import OpenAI from "openai";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { logger } from "./logger.js";
import { loadConfig } from "./config.js";
import { bashDefinition, executeBash } from "./tools/builtin/bash.js";
import { readFileDefinition, executeReadFile } from "./tools/builtin/read-file.js";
import { writeFileDefinition, executeWriteFile } from "./tools/builtin/write-file.js";
import { webSearchDefinition, executeWebSearch } from "./tools/builtin/web-search.js";
import { weatherDefinition, executeWeather } from "./tools/builtin/weather.js";
import {
  memorySaveDefinition, executeMemorySave,
  memorySearchDefinition, executeMemorySearch,
  memoryListDefinition, executeMemoryList,
  memoryUpdateIndexDefinition, executeMemoryUpdateIndex,
} from "./tools/builtin/memory.js";
import {
  cronCreateDefinition, executeCronCreate,
  cronListDefinition, executeCronList,
  cronDeleteDefinition, executeCronDelete,
  cronToggleDefinition, executeCronToggle,
} from "./tools/builtin/cron.js";
import {
  reminderCreateDefinition, executeReminderCreate,
  reminderListDefinition, executeReminderList,
  reminderDeleteDefinition, executeReminderDelete,
} from "./tools/builtin/reminder.js";
import {
  discordFetchMessageDefinition, executeDiscordFetchMessage,
} from "./tools/builtin/discord.js";

const config = loadConfig();

const client = new OpenAI({
  apiKey: config.llm.api_key,
  baseURL: config.llm.base_url,
});

const MODEL = config.llm.model;

export interface ToolActivity {
  tool: string;
  input: Record<string, unknown>;
}

export interface AgentResponse {
  text: string;
  toolsUsed: ToolActivity[];
  durationMs: number;
}

export interface AgentOptions {
  systemPrompt?: string;
  maxTurns?: number;
  session?: import("./session.js").Session;
  onToolUse?: (tool: string, input: Record<string, unknown>) => void;
}

// System-level instructions — hardcoded, not user-configurable.
const SYSTEM_INSTRUCTIONS = `
You are Furet, a personal assistant agent.

## Execution Rules
1. ALWAYS produce a text response. After all tool calls are done, you MUST output text to reply to the user. Never end with only tool calls and no text.
2. Always fulfill the user's request FIRST. Deliver the answer/result before any side-effects.
3. When a tool returns data, ALWAYS include the relevant information in your response.
4. After answering a web search question, include a "Sources:" section with relevant [title](url) links from the search results.
5. Respond in the same language the user uses.

## Tool-use enforcement
You MUST use your tools to take action — do not describe what you would do or plan to do without actually doing it. When you say you will perform an action (e.g. "I will run the tests", "Let me check the file", "I will create the project"), you MUST immediately make the corresponding tool call in the same response. Never end your turn with a promise of future action — execute it now.
Keep working until the task is actually complete. Do not stop with a summary of what you plan to do next time. If you have tools available that can accomplish the task, use them instead of telling the user what you would do.
Every response should either (a) contain tool calls that make progress, or (b) deliver a final result to the user. Responses that only describe intentions without acting are not acceptable.

## Using your tools
- Use the RIGHT tool for each job. Do NOT use bash when a dedicated tool exists:
  - To read files: use read_file, NOT cat/head/tail
  - To write files: use write_file, NOT echo/cat with redirection
  - To search file content: use grep, NOT bash grep
- Reserve bash exclusively for shell commands that have no dedicated tool (git, curl, npm, etc.)

## Memory
- You have a memory system. Use it sparingly. Most conversations do NOT need memory saved.
- Save ONLY when you learn something genuinely useful for future conversations:
  - User's personal facts (name, location, job, family, etc.)
  - User's strong preferences or habits
  - Important decisions or plans
  - Corrections to your understanding
- Do NOT save:
  - Greetings, casual chat, jokes, emotions
  - Trivial daily events ("user said hi", "user asked time")
  - Information already in MEMORY.md or recent memory files
  - Your own reasoning or observations about the conversation
- MEMORY.md is ALREADY loaded in your system prompt above. Do NOT memory_search for things already visible there.
- memory_save: appends to today's file (workspace/memory/yyyy-MM-dd.md).
- memory_update_index: overwrites MEMORY.md. For persistent important facts loaded every conversation. Keep it concise.
- memory_search: ONLY for searching past daily memory files (not MEMORY.md). Use when the user refers to something from previous days.
- Do NOT mention saving memory unless asked.

`;

function loadFile(name: string): string {
  try {
    return readFileSync(resolve(import.meta.dirname ?? process.cwd(), "..", "workspace", name), "utf-8");
  } catch {
    return "";
  }
}

function buildSystemPrompt(extra?: string): string {
  const date = `Current date: ${new Date().toISOString().split("T")[0]}`;
  const persona = loadFile("FURET.md");
  const memory = loadFile("MEMORY.md");
  const memorySection = memory ? `\n## Long-term Memory\n${memory}` : "";
  return [SYSTEM_INSTRUCTIONS, date, persona, memorySection, extra].filter(Boolean).join("\n");
}

const TOOLS: OpenAI.ChatCompletionTool[] = [
  bashDefinition,
  readFileDefinition,
  writeFileDefinition,
  webSearchDefinition,
  weatherDefinition,
  memorySaveDefinition,
  memorySearchDefinition,
  memoryListDefinition,
  memoryUpdateIndexDefinition,
  cronCreateDefinition,
  cronListDefinition,
  cronDeleteDefinition,
  cronToggleDefinition,
  reminderCreateDefinition,
  reminderListDefinition,
  reminderDeleteDefinition,
  discordFetchMessageDefinition,
];

async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "bash": return executeBash(args as { command: string });
    case "read_file": return executeReadFile(args as { path: string });
    case "write_file": return executeWriteFile(args as { path: string; content: string });
    case "web_search": return executeWebSearch(args as { query: string });
    case "get_weather": return executeWeather(args as { city: string; lang?: string });
    case "memory_save": return executeMemorySave(args as { content: string });
    case "memory_search": return executeMemorySearch(args as { query: string });
    case "memory_list": return executeMemoryList();
    case "memory_update_index": return executeMemoryUpdateIndex(args as { content: string });
    case "cron_create": return executeCronCreate(args as { name: string; schedule: string; prompt: string });
    case "cron_list": return executeCronList();
    case "cron_delete": return executeCronDelete(args as { id: string });
    case "cron_toggle": return executeCronToggle(args as { id: string; enabled: boolean });
    case "reminder_create": return executeReminderCreate(args as { name: string; trigger_at: string; prompt: string });
    case "reminder_list": return executeReminderList();
    case "reminder_delete": return executeReminderDelete(args as { id: string });
    case "discord_fetch_message": return executeDiscordFetchMessage(args as { channel_id: string; message_id: string });
    default: return `Unknown tool: ${name}`;
  }
}

export async function ask(prompt: string | null, options: AgentOptions = {}): Promise<AgentResponse> {
  const startTime = Date.now();
  const maxTurns = options.maxTurns ?? 10;
  const toolsUsed: ToolActivity[] = [];

  logger.info({ prompt: prompt?.slice(0, 200) ?? "(no new prompt, using session tail)" }, "query start");

  const session = options.session;
  const collectedTexts: string[] = [];

  // 若有新 prompt，先 append 進 session；沒有就直接用 session 當前內容
  if (prompt !== null) session?.append({ role: "user", content: prompt });

  const sessionMessages = session?.getMessages() ?? [];
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystemPrompt(options.systemPrompt) },
    ...sessionMessages,
    ...(prompt !== null && !session ? [{ role: "user" as const, content: prompt }] : []),
  ];

  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages,
      tools: TOOLS.length > 0 ? TOOLS : undefined,
    });

    const choice = response.choices[0];
    const message = choice.message;

    logger.info({
      turn,
      finish_reason: choice.finish_reason,
      contentLength: message.content?.length ?? 0,
      contentPreview: message.content?.slice(0, 200),
      toolCallCount: message.tool_calls?.length ?? 0,
    }, "agent turn");

    // 收集每輪的 text content（會跟 tool_calls 並存）
    if (message.content) collectedTexts.push(message.content);

    // 把 assistant 回覆加進 messages（給下一輪用）
    messages.push(message);

    // 沒有 tool call → 結束，回傳所有收集到的文字
    if (!message.tool_calls || message.tool_calls.length === 0) {
      session?.append({ role: "assistant", content: message.content ?? "" });
      const durationMs = Date.now() - startTime;
      const finalText = collectedTexts.join("\n\n");
      logger.info({ durationMs, toolsUsed: toolsUsed.map(t => t.tool), textLength: finalText.length }, "query done");
      return {
        text: finalText,
        toolsUsed,
        durationMs,
      };
    }

    // 有 tool call → 執行每個 tool，結果加回 messages
    // 先執行所有 tool，收集結果，最後一次存進 session（原子性：避免中斷留下孤立 tool_use）
    const toolResultMessages: OpenAI.ChatCompletionMessageParam[] = [];

    for (const toolCall of message.tool_calls) {
      if (toolCall.type !== "function") continue;
      const toolName = toolCall.function.name;
      const toolArgs = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;

      toolsUsed.push({ tool: toolName, input: toolArgs });
      logger.info({ tool: toolName, input: toolArgs }, "tool call");
      options.onToolUse?.(toolName, toolArgs);

      const result = await executeTool(toolName, toolArgs);
      logger.debug({ tool: toolName, result: result.slice(0, 500) }, "tool result");

      const toolResultMsg: OpenAI.ChatCompletionMessageParam = {
        role: "tool",
        tool_call_id: toolCall.id,
        content: result,
      };
      messages.push(toolResultMsg);
      toolResultMessages.push(toolResultMsg);
    }

    // 原子性存入：assistant message（含 tool_use）+ 所有 tool results
    if (session) {
      session.append(message as OpenAI.ChatCompletionMessageParam);
      for (const r of toolResultMessages) session.append(r);
    }
  }

  // max turns 用完
  const durationMs = Date.now() - startTime;
  logger.error({ maxTurns }, "max turns reached");
  return {
    text: "達到最大回合數限制。",
    toolsUsed,
    durationMs,
  };
}
