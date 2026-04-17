import type { Client } from "discord.js";
import { logger } from "../../logger.js";
import type { Tool } from "../../types.js";

let discordClient: Client | null = null;

export function setDiscordClient(client: Client): void {
  discordClient = client;
}

export function getDiscordClient(): Client | null {
  return discordClient;
}

export const discordFetchMessage: Tool = {
  name: "discord_fetch_message",
  description: "Fetch a Discord message by channel and message ID. Use this when you see [msg:ID] reference in the conversation but can't find its content in the session history (e.g. too old, or a reply to a message outside the session).",
  parameters: {
    type: "object",
    properties: {
      channel_id: { type: "string", description: "The Discord channel ID" },
      message_id: { type: "string", description: "The message ID to fetch" },
    },
    required: ["channel_id", "message_id"],
  },
  execute: async (args) => {
    const { channel_id, message_id } = args as { channel_id: string; message_id: string };
    if (!discordClient) return "Error: Discord client not initialized (bot not running)";
    logger.info({ channel_id, message_id }, "discord fetch message");
    try {
      const channel = await discordClient.channels.fetch(channel_id);
      if (!channel || !channel.isTextBased()) return `Error: channel ${channel_id} not found or not text-based`;
      const msg = await channel.messages.fetch(message_id);
      const authorName = msg.member?.displayName ?? msg.author.username;
      return JSON.stringify({
        messageId: msg.id,
        channelId: msg.channelId,
        author: { id: msg.author.id, name: authorName },
        content: msg.content,
        timestamp: new Date(msg.createdTimestamp).toISOString(),
        attachments: msg.attachments.map(a => a.url),
        replyToMessageId: msg.reference?.messageId,
      }, null, 2);
    } catch (err) {
      logger.error({ err: (err as Error).message }, "discord fetch message failed");
      return `Error: ${(err as Error).message}`;
    }
  },
};
