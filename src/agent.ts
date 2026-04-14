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
1. Always fulfill the user's request FIRST. Deliver the answer/result before any side-effects.
2. When a tool returns data, ALWAYS include the relevant information in your response.
3. After answering a web search question, include a "Sources:" section with relevant [title](url) links from the search results.
4. Respond in the same language the user uses.

## Using your tools
- Use the RIGHT tool for each job. Do NOT use bash when a dedicated tool exists:
  - To read files: use read_file, NOT cat/head/tail
  - To write files: use write_file, NOT echo/cat with redirection
  - To search file content: use grep, NOT bash grep
- Reserve bash exclusively for shell commands that have no dedicated tool (git, curl, npm, etc.)

## Memory
- You have a memory system. Use it proactively to remember important facts about the user.
- Save memories when you learn: user preferences, personal info, decisions, recurring topics, corrections.
- memory_save: appends to today's file (workspace/memory/yyyy-MM-dd.md). Use for daily observations.
- memory_update_index: overwrites MEMORY.md. Use for persistent, important facts that should be available in every conversation. Keep it concise.
- memory_search: search past memories when context might help.
- Do NOT mention that you're saving a memory unless the user asks. Just do it silently.

## Tone and style
- Be short and concise.
- Only use emojis if the user uses them first.
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
    default: return `Unknown tool: ${name}`;
  }
}

export async function ask(prompt: string, options: AgentOptions = {}): Promise<AgentResponse> {
  const startTime = Date.now();
  const maxTurns = options.maxTurns ?? 10;
  const toolsUsed: ToolActivity[] = [];

  logger.info({ prompt: prompt.slice(0, 200) }, "query start");

  const session = options.session;

  // 組 messages：system prompt + 歷史對話 + 新的 user 訊息
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystemPrompt(options.systemPrompt) },
    ...(session ? session.getMessages() : []),
    { role: "user", content: prompt },
  ];

  // 把 user 訊息存進 session
  session?.append({ role: "user", content: prompt });

  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages,
      tools: TOOLS.length > 0 ? TOOLS : undefined,
    });

    const choice = response.choices[0];
    const message = choice.message;

    // 把 assistant 回覆加進 messages（給下一輪用）
    messages.push(message);

    // 沒有 tool call → 回文字，結束
    if (!message.tool_calls || message.tool_calls.length === 0) {
      session?.append({ role: "assistant", content: message.content ?? "" });
      const durationMs = Date.now() - startTime;
      logger.info({ durationMs, toolsUsed: toolsUsed.map(t => t.tool) }, "query done");
      return {
        text: message.content ?? "",
        toolsUsed,
        durationMs,
      };
    }

    // 有 tool call → 執行每個 tool，結果加回 messages
    // assistant 的 tool_call message 和 tool result 都存進 session
    session?.append(message as OpenAI.ChatCompletionMessageParam);

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
      session?.append(toolResultMsg);
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
