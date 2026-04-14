import * as readline from "node:readline";
import { resolve } from "node:path";
import { ask } from "./agent.js";
import { Session } from "./session.js";
import { fixMarkdownLinks } from "./utils/format.js";

const SESSION_PATH = resolve(import.meta.dirname ?? process.cwd(), "..", "workspace", "sessions", "cli.json");
let session = new Session(SESSION_PATH);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(): void {
  rl.question("\n🐾 > ", async (input) => {
    const trimmed = input.trim();

    if (!trimmed || trimmed === "exit" || trimmed === "quit") {
      console.log("bye!");
      rl.close();
      return;
    }

    if (trimmed === "new") {
      session.clear();
      console.log("new session started");
      prompt();
      return;
    }

    try {
      const response = await ask(trimmed, {
        session,
        onToolUse: (tool, toolInput) => {
          const displayName = prettifyToolName(tool);
          const summary = formatToolSummary(tool, toolInput);
          console.log(`  🔧 ${displayName}${summary}`);
        },
      });

      console.log(`\n${fixMarkdownLinks(response.text)}`);
      const uniqueTools = [...new Set(response.toolsUsed.map(t => prettifyToolName(t.tool)))];
      console.log(`\n--- ${(response.durationMs / 1000).toFixed(1)}s | tools: ${uniqueTools.join(", ") || "none"} ---`);
    } catch (err) {
      console.error("\n🤕 Error:", (err as Error).message);
    }

    prompt();
  });
}

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  bash: "Bash",
  read_file: "Read",
  write_file: "Write",
  edit_file: "Edit",
  grep: "Grep",
  glob: "Glob",
  web_search: "WebSearch",
  web_fetch: "WebFetch",
  get_weather: "Weather",
};

function prettifyToolName(raw: string): string {
  return TOOL_DISPLAY_NAMES[raw] ?? raw;
}

function formatToolSummary(tool: string, input: Record<string, unknown>): string {
  switch (tool) {
    case "bash":
      return ` → ${truncate(String(input.command ?? ""), 60)}`;
    case "read_file":
      return ` → ${input.path}`;
    case "write_file":
      return ` → ${input.path}`;
    case "edit_file":
      return ` → ${input.path}`;
    case "grep":
      return ` → "${input.pattern}"`;
    case "glob":
      return ` → ${input.pattern}`;
    case "web_search":
      return ` → "${input.query}"`;
    case "web_fetch":
      return ` → ${input.url}`;
    case "get_weather":
      return ` → ${input.city}`;
    default:
      return "";
  }
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "..." : str;
}

console.log(`Furet CLI — type 'new' for new session, 'exit' to quit (history: ${session.length} messages)`);
prompt();
