import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { logger } from "../../logger.js";

const CRONS_FILE = resolve(import.meta.dirname ?? process.cwd(), "../../..", "workspace", "crons.json");

export interface CronJob {
  id: string;
  name: string;
  schedule: string;    // cron expression
  prompt: string;      // what to ask the agent when triggered
  enabled: boolean;
  createdAt: string;
}

// --- Persistence ---

export function loadCrons(): CronJob[] {
  try {
    return JSON.parse(readFileSync(CRONS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function saveCrons(crons: CronJob[]): void {
  mkdirSync(resolve(CRONS_FILE, ".."), { recursive: true });
  writeFileSync(CRONS_FILE, JSON.stringify(crons, null, 2));
}

// --- Tool Definitions ---

export const cronCreateDefinition = {
  type: "function" as const,
  function: {
    name: "cron_create",
    description: "Create a scheduled task. The prompt will be executed by the agent on the given cron schedule.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Short name for this task" },
        schedule: { type: "string", description: "Cron expression (e.g. '0 9 * * *' for daily 9am, '*/30 * * * *' for every 30 min)" },
        prompt: { type: "string", description: "The prompt to execute when triggered" },
      },
      required: ["name", "schedule", "prompt"],
    },
  },
};

export const cronListDefinition = {
  type: "function" as const,
  function: {
    name: "cron_list",
    description: "List all scheduled tasks.",
    parameters: { type: "object", properties: {} },
  },
};

export const cronDeleteDefinition = {
  type: "function" as const,
  function: {
    name: "cron_delete",
    description: "Delete a scheduled task by ID.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "The cron job ID to delete" },
      },
      required: ["id"],
    },
  },
};

export const cronToggleDefinition = {
  type: "function" as const,
  function: {
    name: "cron_toggle",
    description: "Enable or disable a scheduled task.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "The cron job ID" },
        enabled: { type: "boolean", description: "true to enable, false to disable" },
      },
      required: ["id", "enabled"],
    },
  },
};

// --- Executors ---

export async function executeCronCreate(args: { name: string; schedule: string; prompt: string }): Promise<string> {
  const crons = loadCrons();
  const job: CronJob = {
    id: randomUUID().slice(0, 8),
    name: args.name,
    schedule: args.schedule,
    prompt: args.prompt,
    enabled: true,
    createdAt: new Date().toISOString(),
  };
  crons.push(job);
  saveCrons(crons);
  logger.info({ id: job.id, name: job.name, schedule: job.schedule }, "cron created");
  return `Created cron "${job.name}" (${job.id}), schedule: ${job.schedule}`;
}

export async function executeCronList(): Promise<string> {
  const crons = loadCrons();
  if (crons.length === 0) return "No scheduled tasks.";
  return crons.map(c =>
    `[${c.enabled ? "ON" : "OFF"}] ${c.id} | ${c.name} | ${c.schedule} | "${c.prompt.slice(0, 50)}"`
  ).join("\n");
}

export async function executeCronDelete(args: { id: string }): Promise<string> {
  const crons = loadCrons();
  const idx = crons.findIndex(c => c.id === args.id);
  if (idx === -1) return `Cron job "${args.id}" not found.`;
  const removed = crons.splice(idx, 1)[0];
  saveCrons(crons);
  logger.info({ id: removed.id, name: removed.name }, "cron deleted");
  return `Deleted cron "${removed.name}" (${removed.id})`;
}

export async function executeCronToggle(args: { id: string; enabled: boolean }): Promise<string> {
  const crons = loadCrons();
  const job = crons.find(c => c.id === args.id);
  if (!job) return `Cron job "${args.id}" not found.`;
  job.enabled = args.enabled;
  saveCrons(crons);
  logger.info({ id: job.id, enabled: job.enabled }, "cron toggled");
  return `Cron "${job.name}" is now ${job.enabled ? "enabled" : "disabled"}`;
}
