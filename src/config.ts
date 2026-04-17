import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { CONFIG_PATH } from "./paths.js";
import "dotenv/config";

export interface FuretConfig {
  llm: {
    api_key: string;
    base_url: string;
    model: string;
  };
  discord: {
    enabled: boolean;
    token: string;
    allowed_channels: string[];
    allowed_guilds: string[];
    owner_id: string;
  };
  journal: {
    enabled: boolean;
    hour: number;
    minute: number;
  };
  skills: string[];
}

const DEFAULTS: FuretConfig = {
  llm: {
    api_key: "",
    base_url: "",
    model: "claude-sonnet-4-20250514",
  },
  discord: {
    enabled: false,
    token: "",
    allowed_channels: [],
    allowed_guilds: [],
    owner_id: "",
  },
  journal: {
    enabled: false,
    hour: 22,
    minute: 0,
  },
  skills: [],
};

function resolveEnvVars(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] ?? "");
  }
  if (Array.isArray(value)) {
    return value.map(resolveEnvVars);
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = resolveEnvVars(v);
    }
    return result;
  }
  return value;
}

let cached: FuretConfig | null = null;

export function loadConfig(): FuretConfig {
  if (cached) return cached;

  let raw: Record<string, unknown> = {};
  try {
    const content = readFileSync(CONFIG_PATH, "utf-8");
    raw = (parse(content) as Record<string, unknown>) ?? {};
  } catch {
    // config.yaml 不存在就用預設值
  }

  const resolved = resolveEnvVars(raw) as Record<string, unknown>;

  cached = {
    llm: { ...DEFAULTS.llm, ...(resolved.llm as Record<string, unknown>) } as FuretConfig["llm"],
    discord: { ...DEFAULTS.discord, ...(resolved.discord as Record<string, unknown>) } as FuretConfig["discord"],
    journal: { ...DEFAULTS.journal, ...(resolved.journal as Record<string, unknown>) } as FuretConfig["journal"],
    skills: (resolved.skills as string[] | undefined) ?? DEFAULTS.skills,
  };

  return cached!;
}
