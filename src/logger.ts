import pino from "pino";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { LOGS_DIR } from "./paths.js";

mkdirSync(LOGS_DIR, { recursive: true });

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "debug",
  transport: {
    target: "pino/file",
    options: { destination: resolve(LOGS_DIR, "furet.log"), mkdir: true },
  },
});
