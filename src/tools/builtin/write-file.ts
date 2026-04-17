import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { logger } from "../../logger.js";
import type { Tool } from "../../types.js";

export const writeFileTool: Tool = {
  name: "write_file",
  description: "Write content to a file. Creates parent directories if needed.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Absolute or relative file path" },
      content: { type: "string", description: "The content to write" },
    },
    required: ["path", "content"],
  },
  execute: async (args) => {
    const { path, content } = args as { path: string; content: string };
    logger.info({ path }, "write_file");
    try {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, "utf-8");
      return `File written: ${path}`;
    } catch (err) {
      return `Error writing file: ${(err as Error).message}`;
    }
  },
};
