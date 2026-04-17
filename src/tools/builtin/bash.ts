import { exec } from "node:child_process";
import { logger } from "../../logger.js";
import type { Tool } from "../../types.js";

export const bash: Tool = {
  name: "bash",
  description: "Execute a shell command and return stdout/stderr.",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "The shell command to execute" },
    },
    required: ["command"],
  },
  execute: async (args) => {
    const { command } = args as { command: string };
    logger.info({ command }, "bash exec");
    return new Promise((resolve) => {
      exec(command, { timeout: 30000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
        const output = [stdout, stderr].filter(Boolean).join("\n").trim();
        if (err && !output) {
          resolve(`Error: ${err.message}`);
        } else {
          resolve(output || "(no output)");
        }
      });
    });
  },
};
