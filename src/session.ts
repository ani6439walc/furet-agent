import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { logger } from "./logger.js";
import { SESSIONS_DIR, ARCHIVE_DIR } from "./paths.js";
import type { Message } from "./types.js";

export class Session {
  readonly id: string;
  private filePath: string;
  private messages: Message[] = [];

  constructor(id: string) {
    this.id = id;
    this.filePath = resolve(SESSIONS_DIR, `${id}.json`);
    this.load();
  }

  getMessages(): Message[] {
    return this.messages;
  }

  append(message: Message): void {
    this.messages.push(message);
    this.save();
  }

  prependToLastAssistantContent(prefix: string): void {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const m = this.messages[i];
      if (m.role === "assistant" && typeof m.content === "string") {
        m.content = prefix + m.content;
        this.save();
        return;
      }
    }
  }

  clear(): void {
    this.messages = [];
    this.save();
    logger.info({ sessionId: this.id }, "session cleared");
  }

  archive(): string | null {
    if (this.messages.length === 0) {
      logger.info({ sessionId: this.id }, "session archive skipped (empty)");
      this.clear();
      return null;
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const archivePath = resolve(ARCHIVE_DIR, `${this.id}-${timestamp}.json`);
    try {
      mkdirSync(ARCHIVE_DIR, { recursive: true });
      writeFileSync(archivePath, JSON.stringify({
        sessionId: this.id,
        archivedAt: new Date().toISOString(),
        messages: this.messages,
      }, null, 2));
      logger.info({ sessionId: this.id, archivePath, count: this.messages.length }, "session archived");
    } catch (err) {
      logger.error({ err, sessionId: this.id }, "session archive failed");
    }
    this.clear();
    return archivePath;
  }

  get length(): number {
    return this.messages.length;
  }

  private load(): void {
    try {
      const data = JSON.parse(readFileSync(this.filePath, "utf-8"));
      this.messages = data.messages ?? [];
      this.migrateOldFormat();
      logger.info({ sessionId: this.id, count: this.messages.length }, "session loaded");
    } catch {
      this.messages = [];
    }
  }

  /** 遷移舊格式：過濾掉含 tool_use/tool_result 的 messages */
  private migrateOldFormat(): void {
    const before = this.messages.length;
    this.messages = this.messages.filter(m => {
      if (typeof m.content === "string") return true;
      if (!Array.isArray(m.content)) return false;
      // 保留只有 text blocks 的，過濾含 tool blocks 的
      const blocks = m.content as Array<{ type: string }>;
      return blocks.length > 0 && blocks.every(b => b.type === "text");
    });
    if (this.messages.length < before) {
      logger.info({ sessionId: this.id, before, after: this.messages.length }, "migrated old session format");
      this.save();
    }
  }

  private save(): void {
    try {
      mkdirSync(SESSIONS_DIR, { recursive: true });
      writeFileSync(this.filePath, JSON.stringify({ messages: this.messages }, null, 2));
    } catch (err) {
      logger.error({ err, sessionId: this.id }, "session save failed");
    }
  }
}
