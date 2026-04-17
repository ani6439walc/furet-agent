import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { logger } from "../../logger.js";
import { MEMORY_DIR, MEMORY_INDEX } from "../../paths.js";
import { addVector, searchVectors } from "../../embedding.js";
import type { Tool } from "../../types.js";

function today(): string {
  return new Date().toISOString().split("T")[0];
}

export const memorySave: Tool = {
  name: "memory_save",
  description: "Save a memory. Appends to today's memory file (workspace/memory/yyyy-MM-dd.md). Use this to remember user preferences, facts, decisions, or anything worth recalling in future conversations.",
  parameters: {
    type: "object",
    properties: {
      content: { type: "string", description: "The memory content to save" },
    },
    required: ["content"],
  },
  execute: async (args) => {
    const { content } = args as { content: string };
    const date = today();
    const filePath = resolve(MEMORY_DIR, `${date}.md`);
    logger.info({ date, content: content.slice(0, 100) }, "memory save");

    try {
      mkdirSync(MEMORY_DIR, { recursive: true });
      let existing = "";
      try { existing = readFileSync(filePath, "utf-8"); } catch { /* new file */ }

      const timestamp = new Date().toLocaleTimeString("zh-TW", { hour12: false });
      const entry = `\n- [${timestamp}] ${content}`;
      writeFileSync(filePath, existing + entry + "\n");

      // 同時存向量索引（背景執行，不阻塞回應）
      addVector(content, `${date}.md`).catch(() => {});

      return `Memory saved to ${date}.md`;
    } catch (err) {
      logger.error({ err }, "memory save failed");
      return `Error: ${(err as Error).message}`;
    }
  },
};

export const memorySearch: Tool = {
  name: "memory_search",
  description: "Search across all memory files using semantic search. Use this when the user asks about something that might have been mentioned before, or when you need context from past conversations.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query (supports semantic/meaning-based search)" },
    },
    required: ["query"],
  },
  execute: async (args) => {
    const { query } = args as { query: string };
    logger.info({ query }, "memory search");

    try {
      const results: string[] = [];

      // 語意搜尋（向量）
      const vectorResults = await searchVectors(query);
      if (vectorResults.length > 0) {
        results.push("## Semantic matches\n" + vectorResults.map(r =>
          `- [${r.file}] (score: ${r.score.toFixed(2)}) ${r.text}`
        ).join("\n"));
      }

      // 關鍵字搜尋（fallback + 補充）
      mkdirSync(MEMORY_DIR, { recursive: true });
      const files = readdirSync(MEMORY_DIR).filter(f => f.endsWith(".md")).sort().reverse();
      const q = query.toLowerCase();
      const keywordResults: string[] = [];

      try {
        const index = readFileSync(MEMORY_INDEX, "utf-8");
        const lines = index.split("\n").filter(l => l.toLowerCase().includes(q));
        if (lines.length > 0) keywordResults.push(`[MEMORY.md]\n${lines.join("\n")}`);
      } catch { /* no index yet */ }

      for (const file of files.slice(0, 30)) {
        const content = readFileSync(resolve(MEMORY_DIR, file), "utf-8");
        const lines = content.split("\n").filter(l => l.toLowerCase().includes(q));
        if (lines.length > 0) keywordResults.push(`[${file}]\n${lines.join("\n")}`);
      }

      if (keywordResults.length > 0) {
        results.push("## Keyword matches\n" + keywordResults.join("\n\n"));
      }

      return results.length > 0 ? results.join("\n\n") : "No matching memories found.";
    } catch (err) {
      logger.error({ err }, "memory search failed");
      return `Error: ${(err as Error).message}`;
    }
  },
};

export const memoryList: Tool = {
  name: "memory_list",
  description: "List all memory files with dates.",
  parameters: { type: "object", properties: {} },
  execute: async () => {
    try {
      mkdirSync(MEMORY_DIR, { recursive: true });
      const files = readdirSync(MEMORY_DIR).filter(f => f.endsWith(".md")).sort().reverse();

      let indexExists = false;
      try { readFileSync(MEMORY_INDEX); indexExists = true; } catch { /* */ }

      const lines = [];
      if (indexExists) lines.push("- MEMORY.md (long-term index)");
      for (const f of files) lines.push(`- memory/${f}`);
      return lines.length > 0 ? lines.join("\n") : "No memories yet.";
    } catch (err) {
      return `Error: ${(err as Error).message}`;
    }
  },
};

export const memoryUpdateIndex: Tool = {
  name: "memory_update_index",
  description: "Update the long-term memory index (MEMORY.md). This file is loaded into every conversation. Use this to maintain a summary of the most important, persistent facts about the user. Keep it concise.",
  parameters: {
    type: "object",
    properties: {
      content: { type: "string", description: "The full content to write to MEMORY.md" },
    },
    required: ["content"],
  },
  execute: async (args) => {
    const { content } = args as { content: string };
    logger.info({ content: content.slice(0, 100) }, "memory update index");
    try {
      writeFileSync(MEMORY_INDEX, content);
      return "MEMORY.md updated.";
    } catch (err) {
      logger.error({ err }, "memory update index failed");
      return `Error: ${(err as Error).message}`;
    }
  },
};
