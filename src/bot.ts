import {
  Client, GatewayIntentBits, Events, REST, Routes,
  SlashCommandBuilder, MessageFlags,
  type Message, type Interaction,
} from "discord.js";
import { ask } from "./agent.js";
import { Session } from "./session.js";
import { logger } from "./logger.js";
import { loadConfig } from "./config.js";
import { fixMarkdownLinks } from "./utils/format.js";

const SLASH_COMMANDS = [
  new SlashCommandBuilder()
    .setName("new")
    .setDescription("開始新對話（清空當前頻道的 session）")
    .toJSON(),
];

async function registerSlashCommands(token: string, clientId: string, guildIds: string[]): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(token);
  try {
    // 先查全域有什麼
    const globalCmds = (await rest.get(Routes.applicationCommands(clientId))) as { name: string }[];
    logger.info({ count: globalCmds.length, names: globalCmds.map(c => c.name) }, "existing global commands");

    // 清掉全域
    await rest.put(Routes.applicationCommands(clientId), { body: [] });
    logger.info("global slash commands cleared");

    // 對每個 guild 註冊（會替換該 guild 的所有指令）
    for (const guildId of guildIds) {
      const existing = (await rest.get(Routes.applicationGuildCommands(clientId, guildId))) as { name: string }[];
      logger.info({ guildId, count: existing.length, names: existing.map(c => c.name) }, "existing guild commands");

      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: SLASH_COMMANDS });
      logger.info({ guildId, count: SLASH_COMMANDS.length }, "slash commands registered to guild");
    }
  } catch (err) {
    logger.error({ err: (err as Error).message }, "slash command registration failed");
  }
}

export async function startBot(token: string): Promise<void> {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
  });

  client.once(Events.ClientReady, async (c) => {
    logger.info({ user: c.user.tag }, "discord bot ready");
    console.log(`Discord bot logged in as ${c.user.tag}`);
    const guildIds = c.guilds.cache.map(g => g.id);
    await registerSlashCommands(token, c.user.id, guildIds);
  });

  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "new") {
      const sessionId = interaction.guild
        ? `discord-channel-${interaction.channelId}`
        : `discord-dm-${interaction.user.id}`;
      const session = new Session(sessionId);
      session.archive();
      logger.info({ sessionId }, "session archived via /new");

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const newSessionPrompt = `使用者 ${interaction.user.username} 剛剛在 Discord 上使用 /new 指令清除了對話歷史，準備開始新的對話。請以 Furet 的身份打招呼，可以根據 MEMORY.md 裡記錄的資訊展現對使用者的記憶。這是一個新new的對話。`;

      try {
        const response = await ask(newSessionPrompt, { session });
        const text = response.text || "（新對話開始）";
        const formatted = fixMarkdownLinks(text);
        const chunks = chunkMessage(formatted, 2000);
        await interaction.editReply(chunks[0]);
        for (let i = 1; i < chunks.length; i++) {
          await interaction.followUp(chunks[i]);
        }
      } catch (err) {
        logger.error({ err: (err as Error).message }, "/new failed");
        await interaction.deleteReply().catch(() => {});
      }
    }
  });

  const config = loadConfig();

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    const isMentioned = client.user ? message.mentions.has(client.user) : false;
    const isDM = !message.guild;

    if (!isMentioned && !isDM) return;

    // DM 只回主人
    if (isDM && config.discord.owner_id && message.author.id !== config.discord.owner_id) {
      logger.info({ userId: message.author.id }, "DM from non-owner rejected");
      return;
    }

    // guild 白名單
    if (message.guild && config.discord.allowed_guilds.length > 0) {
      if (!config.discord.allowed_guilds.includes(message.guild.id)) return;
    }

    // channel 白名單
    if (!isDM && config.discord.allowed_channels.length > 0) {
      if (!config.discord.allowed_channels.includes(message.channelId)) return;
    }

    await handleMessage(message);
  });

  await client.login(token);
}

async function handleMessage(message: Message): Promise<void> {
  // session ID: DM 用 user ID，channel 用 channel ID
  const sessionId = message.guild
    ? `discord-channel-${message.channelId}`
    : `discord-dm-${message.author.id}`;

  const session = new Session(sessionId);

  const content = message.content.trim();
  if (!content) return;

  logger.info({
    sessionId,
    author: message.author.tag,
    content: content.slice(0, 200),
  }, "discord message received");

  // 顯示 typing
  if ("sendTyping" in message.channel) {
    await message.channel.sendTyping().catch(() => {});
  }

  try {
    const response = await ask(content, { session });
    logger.info({
      sessionId,
      textLength: response.text?.length ?? 0,
      textPreview: response.text?.slice(0, 200) ?? "(empty)",
      toolsUsed: response.toolsUsed.map(t => t.tool),
    }, "discord agent response");

    if (!response.text) {
      logger.warn({ sessionId }, "empty response, not replying");
      await message.react("🤔").catch(() => {});
      return;
    }

    const formatted = fixMarkdownLinks(response.text);
    const chunks = chunkMessage(formatted, 2000);
    for (const chunk of chunks) {
      await message.reply(chunk);
    }
    logger.info({ sessionId, chunks: chunks.length }, "discord reply sent");
  } catch (err) {
    logger.error({ err: (err as Error).message, stack: (err as Error).stack }, "discord handle message failed");
    await message.react("🤕").catch(() => {});
  }
}

function chunkMessage(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > maxLength) {
    // 優先在換行斷
    let cutAt = remaining.lastIndexOf("\n", maxLength);
    if (cutAt < maxLength / 2) cutAt = maxLength;
    chunks.push(remaining.slice(0, cutAt));
    remaining = remaining.slice(cutAt).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
