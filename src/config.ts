import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import "dotenv/config";

export interface FuretConfig {
  llm: {
    api_key: string;
    base_url: string;
    model: string;
  };
  web_search: {
    provider: "google" | "duckduckgo" | "searxng";
    google_api_key: string;
    searxng_url: string;
  };
}

const DEFAULTS: FuretConfig = {
  llm: {
    api_key: "",
    base_url: "",
    model: "claude-sonnet-4-20250514",
  },
  web_search: {
    provider: "duckduckgo",
    google_api_key: "",
    searxng_url: "",
  },
};

/**
 * 解析 ${VAR} 變數，從 process.env 讀取
 */
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

  const configPath = resolve(import.meta.dirname ?? process.cwd(), "..", "config.yaml");

  let raw: Record<string, unknown> = {};
  try {
    const content = readFileSync(configPath, "utf-8");
    raw = (parse(content) as Record<string, unknown>) ?? {};
  } catch {
    // config.yaml 不存在就用預設值
  }

  const resolved = resolveEnvVars(raw) as Record<string, unknown>;

  cached = {
    llm: { ...DEFAULTS.llm, ...(resolved.llm as Record<string, unknown>) } as FuretConfig["llm"],
    web_search: { ...DEFAULTS.web_search, ...(resolved.web_search as Record<string, unknown>) } as FuretConfig["web_search"],
  };

  return cached;
}
