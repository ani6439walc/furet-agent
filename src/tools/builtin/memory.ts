import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { logger } from "../../logger.js";

const WORKSPACE = resolve(import.meta.dirname ?? process.cwd(), "../../..", "workspace");
const MEMORY_DIR = resolve(WORKSPACE, "memory");
const MEMORY_INDEX = resolve(WORKSPACE, "MEMORY.md");

function today(): string {
  return new Date().toISOString().split("T")[0]; // yyyy-MM-dd
}

// --- Tool Definitions ---

export const memorySaveDefinition = {
  type: "function" as const,
  function: {
    name: "memory_save",
    description: "Save a memory. Appends to today's memory file (workspace/memory/yyyy-MM-dd.md). Use this to remember user preferences, facts, decisions, or anything worth recalling in future conversations.",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "The memory content to save" },
      },
      required: ["content"],
    },
  },
};

export const memorySearchDefinition = {
  type: "function" as const,
  function: {
    name: "memory_search",
    description: "Search across all memory files for relevant information. Use this when the user asks about something that might have been mentioned before, or when you need context from past conversations.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query (keyword match)" },
      },
      required: ["query"],
    },
  },
};

export const memoryListDefinition = {
  type: "function" as const,
  function: {
    name: "memory_list",
    description: "List all memory files with dates.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
};

export const memoryUpdateIndexDefinition = {
  type: "function" as const,
  function: {
    name: "memory_update_index",
    description: "Update the long-term memory index (MEMORY.md). This file is loaded into every conversation. Use this to maintain a summary of the most important, persistent facts about the user. Keep it concise.",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "The full content to write to MEMORY.md" },
      },
      required: ["content"],
    },
  },
};

// --- Tool Executors ---

export async function executeMemorySave(args: { content: string }): Promise<string> {
  const date = today();
  const filePath = resolve(MEMORY_DIR, `${date}.md`);
  logger.info({ date, content: args.content.slice(0, 100) }, "memory save");

  try {
    mkdirSync(MEMORY_DIR, { recursive: true });
    let existing = "";
    try { existing = readFileSync(filePath, "utf-8"); } catch { /* new file */ }

    const timestamp = new Date().toLocaleTimeString("zh-TW", { hour12: false });
    const entry = `\n- [${timestamp}] ${args.content}`;
    writeFileSync(filePath, existing + entry + "\n");

    return `Memory saved to ${date}.md`;
  } catch (err) {
    logger.error({ err }, "memory save failed");
    return `Error: ${(err as Error).message}`;
  }
}

export async function executeMemorySearch(args: { query: string }): Promise<string> {
  logger.info({ query: args.query }, "memory search");

  try {
    mkdirSync(MEMORY_DIR, { recursive: true });
    const files = readdirSync(MEMORY_DIR).filter(f => f.endsWith(".md")).sort().reverse();
    const query = args.query.toLowerCase();
    const results: string[] = [];

    // 也搜 MEMORY.md
    try {
      const index = readFileSync(MEMORY_INDEX, "utf-8");
      const lines = index.split("\n").filter(l => l.toLowerCase().includes(query));
      if (lines.length > 0) {
        results.push(`[MEMORY.md]\n${lines.join("\n")}`);
      }
    } catch { /* no index yet */ }

    // 搜日記憶檔
    for (const file of files.slice(0, 30)) { // 最多搜最近 30 天
      const content = readFileSync(resolve(MEMORY_DIR, file), "utf-8");
      const lines = content.split("\n").filter(l => l.toLowerCase().includes(query));
      if (lines.length > 0) {
        results.push(`[${file}]\n${lines.join("\n")}`);
      }
    }

    return results.length > 0 ? results.join("\n\n") : "No matching memories found.";
  } catch (err) {
    logger.error({ err }, "memory search failed");
    return `Error: ${(err as Error).message}`;
  }
}

export async function executeMemoryList(): Promise<string> {
  try {
    mkdirSync(MEMORY_DIR, { recursive: true });
    const files = readdirSync(MEMORY_DIR).filter(f => f.endsWith(".md")).sort().reverse();

    let indexExists = false;
    try { readFileSync(MEMORY_INDEX); indexExists = true; } catch { /* */ }

    const lines = [];
    if (indexExists) lines.push("- MEMORY.md (long-term index)");
    for (const f of files) {
      lines.push(`- memory/${f}`);
    }
    return lines.length > 0 ? lines.join("\n") : "No memories yet.";
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}

export async function executeMemoryUpdateIndex(args: { content: string }): Promise<string> {
  logger.info({ content: args.content.slice(0, 100) }, "memory update index");
  try {
    writeFileSync(MEMORY_INDEX, args.content);
    return "MEMORY.md updated.";
  } catch (err) {
    logger.error({ err }, "memory update index failed");
    return `Error: ${(err as Error).message}`;
  }
}
