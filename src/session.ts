import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type OpenAI from "openai";
import { logger } from "./logger.js";

export class Session {
  private filePath: string;
  private messages: OpenAI.ChatCompletionMessageParam[] = [];

  constructor(filePath: string) {
    this.filePath = filePath;
    this.load();
  }

  /** 取得歷史 messages（不含 system prompt，那個每次重建） */
  getMessages(): OpenAI.ChatCompletionMessageParam[] {
    return this.messages;
  }

  /** 加一筆 message 並存檔 */
  append(message: OpenAI.ChatCompletionMessageParam): void {
    this.messages.push(message);
    this.save();
  }

  /** 加多筆 messages 並存檔 */
  appendAll(msgs: OpenAI.ChatCompletionMessageParam[]): void {
    this.messages.push(...msgs);
    this.save();
  }

  /** 清空對話歷史 */
  clear(): void {
    this.messages = [];
    this.save();
    logger.info({ file: this.filePath }, "session cleared");
  }

  /** 取得對話筆數 */
  get length(): number {
    return this.messages.length;
  }

  private load(): void {
    try {
      const data = JSON.parse(readFileSync(this.filePath, "utf-8"));
      this.messages = data.messages ?? [];
      logger.info({ file: this.filePath, count: this.messages.length }, "session loaded");
    } catch {
      this.messages = [];
    }
  }

  private save(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, JSON.stringify({ messages: this.messages }, null, 2));
    } catch (err) {
      logger.error({ err }, "session save failed");
    }
  }
}
