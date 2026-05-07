import "dotenv/config";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  MessageFlags,
  PermissionFlagsBits,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type GuildMember,
  type ModalSubmitInteraction
} from "discord.js";
import { createApiServer } from "./external-api.js";
import { displayName, formatPercent, formatPoint } from "./display.js";
import { recordModal } from "./modals.js";
import { formatPeriodLabel } from "./periods.js";
import { prisma } from "./prisma.js";
import { expectedPlayerCount } from "./scoring.js";
import { aggregateStats, createMatch, deleteMatch, ensureGuildAndUsers, latestMatch, ranking, records } from "./services.js";
import type { MahjongType, Period, PlayerInput } from "./types.js";
import { validatePlayers } from "./validation.js";

const token = process.env.DISCORD_TOKEN;
if (!token) {
  throw new Error("DISCORD_TOKEN is required.");
}

const developerUserIds = new Set(
  (process.env.DEVELOPER_USER_IDS ?? "")
    .split(",")
    .map((userId) => userId.trim())
    .filter(Boolean)
);

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const port = Number(process.env.PORT ?? 8000);
const healthServer = createApiServer(client);

const pendingRecordOptions = new Map<
  string,
  {
    type: MahjongType;
    tournamentName?: string;
    playedAt: Date;
    players: Array<{ userId: string; rank: number }>;
  }
>();

function requireGuildId(interaction: { guildId: string | null }): string {
  if (!interaction.guildId) {
    throw new Error("このコマンドはサーバー内でのみ使用できます。");
  }
  return interaction.guildId;
}

function typeOption(interaction: ChatInputCommandInteraction): MahjongType {
  return (interaction.options.getString("type") ?? "4p") as MahjongType;
}

function periodOption(interaction: ChatInputCommandInteraction): Period {
  return (interaction.options.getString("period") ?? "all") as Period;
}

function rankingPeriodOption(interaction: ChatInputCommandInteraction): Period {
  return (interaction.options.getString("period") ?? "month") as Period;
}

function tournamentOption(interaction: ChatInputCommandInteraction): string | undefined {
  const tournamentName = interaction.options.getString("tournament_name")?.trim();
  return tournamentName || undefined;
}

function parsePlayedAtOption(interaction: ChatInputCommandInteraction): Date {
  const value = interaction.options.getString("date")?.trim();
  if (!value) {
    return new Date();
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error("対局日は YYYY-MM-DD 形式で入力してください。例: 2026-05-07");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error("存在する日付を入力してください。例: 2026-05-07");
  }

  return date;
}

function formatDate(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function typeLabel(type: MahjongType): string {
  return type === "4p" ? "4人半荘" : "3人半荘";
}

async function fetchMember(interaction: { guild: ChatInputCommandInteraction["guild"] }, userId: string): Promise<GuildMember | null> {
  return (await interaction.guild?.members.fetch(userId).catch(() => null)) ?? null;
}

async function assertGuildMember(interaction: { guild: ChatInputCommandInteraction["guild"] }, userId: string): Promise<GuildMember> {
  const member = await fetchMember(interaction, userId);
  if (!member) {
    throw new Error("サーバー内での対戦のみ有効です。");
  }
  return member;
}

function parseScore(value: string, rank: number): number {
  const score = Number(value.trim());
  if (!Number.isInteger(score)) {
    throw new Error(`${rank}位の最終持ち点は整数で入力してください。`);
  }
  return score;
}

async function assertSetNamePermission(interaction: ChatInputCommandInteraction): Promise<string | null> {
  const guildId = requireGuildId(interaction);
  if (!canManageNames(interaction)) {
    await interaction.editReply("この操作はサーバー管理者または開発者のみ実行できます。");
    return null;
  }
  return guildId;
}

function canManageNames(interaction: ChatInputCommandInteraction): boolean {
  const isGuildManager = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
  const isDeveloper = developerUserIds.has(interaction.user.id);
  return isGuildManager || isDeveloper;
}

async function handleRecordCommand(interaction: ChatInputCommandInteraction) {
  requireGuildId(interaction);
  const type = typeOption(interaction);
  const expected = expectedPlayerCount(type);
  const players: Array<{ userId: string; rank: number }> = [];

  for (let rank = 1; rank <= expected; rank += 1) {
    const user = interaction.options.getUser(`player${rank}`, true);
    await assertGuildMember(interaction, user.id);
    players.push({ userId: user.id, rank });
  }

  if (type === "4p" && !interaction.options.getUser("player4")) {
    throw new Error("4人半荘では4位のプレイヤーを指定してください。");
  }
  if (type === "3p" && interaction.options.getUser("player4")) {
    throw new Error("3人半荘では4位のプレイヤーは指定しないでください。");
  }

  const customId = `mjs:add:${interaction.id}`;
  pendingRecordOptions.set(customId, {
    type,
    tournamentName: tournamentOption(interaction),
    playedAt: parsePlayedAtOption(interaction),
    players
  });

  await interaction.showModal(recordModal(type, customId));
}

async function handleRecordModal(interaction: ModalSubmitInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guildId = requireGuildId(interaction);
  const pending = pendingRecordOptions.get(interaction.customId);
  pendingRecordOptions.delete(interaction.customId);

  if (!pending) {
    throw new Error("登録情報の有効期限が切れました。もう一度 /mjs add を実行してください。");
  }

  const players: PlayerInput[] = pending.players.map((player) => ({
    userId: player.userId,
    rank: player.rank,
    rawScore: parseScore(interaction.fields.getTextInputValue(`score_${player.rank}`), player.rank)
  }));

  validatePlayers(pending.type, players);
  const match = await createMatch(guildId, pending.type, players, pending.tournamentName, pending.playedAt);
  const fields = await Promise.all(
    match.results.map(async (result) => {
      const member = await fetchMember(interaction, result.userId);
      return {
        name: `${result.rank}位 ${await displayName(guildId, member, result.userId)}`,
        value: `${result.rawScore}点 / ${formatPoint(result.point)}pt`,
        inline: false
      };
    })
  );

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setTitle("対局を登録しました")
        .setDescription(
          `Match ID: \`${match.matchId}\`\n種別: ${typeLabel(pending.type)}\n対局日: ${formatDate(match.playedAt)}${
            match.tournamentName ? `\n大会名: ${match.tournamentName}` : ""
          }`
        )
        .addFields(fields)
        .setTimestamp(match.createdAt)
    ]
  });
}

async function handleStats(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const guildId = requireGuildId(interaction);
  const user = interaction.options.getUser("user") ?? interaction.user;
  const type = typeOption(interaction);
  const period = periodOption(interaction);
  const tournamentName = tournamentOption(interaction);
  const stats = await aggregateStats(guildId, type, period, user.id, tournamentName);
  const name = await displayName(guildId, await fetchMember(interaction, user.id), user.id);
  const rankFields = [...stats.rankCounts.entries()].map(([rank, count]) => ({
    name: `${rank}位`,
    value: stats.totalGames ? `${count}回 (${formatPercent((count / stats.totalGames) * 100)})` : "0回 (0.0%)",
    inline: true
  }));
  const history = stats.results
    .slice(0, 10)
    .map(
      (result) =>
        `\`${result.match.matchId.slice(0, 8)}\` ${formatDate(result.match.playedAt)} ${result.rank}位 ${result.rawScore}点 ${formatPoint(
          result.point
        )}pt`
    )
    .join("\n");

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setTitle(`${name} の成績`)
        .setDescription(
          `種別: ${typeLabel(type)} / 期間: ${formatPeriodLabel(period)}${tournamentName ? ` / 大会名: ${tournamentName}` : ""}`
        )
        .addFields(
          { name: "総対局数", value: `${stats.totalGames}`, inline: true },
          { name: "合計ポイント", value: `${formatPoint(stats.totalPoint)}pt`, inline: true },
          { name: "平均順位", value: stats.totalGames ? stats.averageRank.toFixed(2) : "-", inline: true },
          { name: "平均ポイント", value: stats.totalGames ? `${formatPoint(stats.averagePoint)}pt` : "-", inline: true },
          ...rankFields,
          { name: "直近対局履歴", value: history || "対局履歴がありません。", inline: false }
        )
    ]
  });
}

async function handleHistory(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const guildId = requireGuildId(interaction);
  const user = interaction.options.getUser("user") ?? interaction.user;
  const type = typeOption(interaction);
  const count = interaction.options.getInteger("count") ?? 10;
  const stats = await aggregateStats(guildId, type, "all", user.id);
  const name = await displayName(guildId, await fetchMember(interaction, user.id), user.id);
  const lines = stats.results.slice(0, count).map((result) => {
    return `\`${result.match.matchId}\` ${formatDate(result.match.playedAt)} ${result.rank}位 ${result.rawScore}点 ${formatPoint(
      result.point
    )}pt`;
  });

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setTitle(`${name} の履歴`)
        .setDescription(`種別: ${typeLabel(type)}\n${lines.join("\n") || "対局履歴がありません。"}`)
    ]
  });
}

async function handleRanking(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const guildId = requireGuildId(interaction);
  const type = typeOption(interaction);
  const period = rankingPeriodOption(interaction);
  const tournamentName = tournamentOption(interaction);
  const entries = await ranking(guildId, type, period, tournamentName);
  const lines = await Promise.all(
    entries.slice(0, 20).map(async (entry, index) => {
      const member = await fetchMember(interaction, entry.userId);
      const name = await displayName(guildId, member, entry.userId);
      return `${index + 1}. ${name} ${formatPoint(entry.totalPoint)}pt (${entry.games}戦 / 平均${formatPoint(
        entry.averagePoint
      )}pt / 平均順位${entry.averageRank.toFixed(2)})`;
    })
  );

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setTitle("ポイントランキング")
        .setDescription(
          `種別: ${typeLabel(type)} / 期間: ${formatPeriodLabel(period)}${tournamentName ? ` / 大会名: ${tournamentName}` : ""}\n${
            lines.join("\n") || "集計対象がありません。"
          }`
        )
    ]
  });
}

async function handleRecords(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const guildId = requireGuildId(interaction);
  const type = typeOption(interaction);
  const period = rankingPeriodOption(interaction);
  const tournamentName = tournamentOption(interaction);
  const currentRecords = await records(guildId, type, period, tournamentName);
  const nameCache = new Map<string, string>();
  const nameFor = async (userId: string) => {
    const cached = nameCache.get(userId);
    if (cached) {
      return cached;
    }
    const name = await displayName(guildId, await fetchMember(interaction, userId), userId);
    nameCache.set(userId, name);
    return name;
  };
  const matchText = (matchId: string, playedAt: Date) => `Match \`${matchId.slice(0, 8)}\` / ${formatDate(playedAt)}`;
  const empty = "対象データがありません";

  const highestRawScore = currentRecords.highestRawScore
    ? `${await nameFor(currentRecords.highestRawScore.userId)} ${currentRecords.highestRawScore.value}点\n${matchText(
        currentRecords.highestRawScore.matchId,
        currentRecords.highestRawScore.playedAt
      )}`
    : empty;
  const highestPoint = currentRecords.highestPoint
    ? `${await nameFor(currentRecords.highestPoint.userId)} ${formatPoint(currentRecords.highestPoint.value)}pt\n${matchText(
        currentRecords.highestPoint.matchId,
        currentRecords.highestPoint.playedAt
      )}`
    : empty;
  const rawScoreMargin = currentRecords.largestRawScoreWinMargin
    ? `${await nameFor(currentRecords.largestRawScoreWinMargin.userId)} +${currentRecords.largestRawScoreWinMargin.value}点 vs ${await nameFor(
        currentRecords.largestRawScoreWinMargin.secondUserId
      )}\n${matchText(currentRecords.largestRawScoreWinMargin.matchId, currentRecords.largestRawScoreWinMargin.playedAt)}`
    : empty;
  const pointMargin = currentRecords.largestPointWinMargin
    ? `${await nameFor(currentRecords.largestPointWinMargin.userId)} +${formatPoint(
        currentRecords.largestPointWinMargin.value
      )}pt vs ${await nameFor(currentRecords.largestPointWinMargin.secondUserId)}\n${matchText(
        currentRecords.largestPointWinMargin.matchId,
        currentRecords.largestPointWinMargin.playedAt
      )}`
    : empty;
  const mostTops = currentRecords.mostTops ? `${await nameFor(currentRecords.mostTops.userId)} ${currentRecords.mostTops.value}回` : empty;
  const bestAverageRank = currentRecords.bestAverageRank
    ? `${await nameFor(currentRecords.bestAverageRank.userId)} ${currentRecords.bestAverageRank.value.toFixed(2)}位`
    : `${currentRecords.qualifiedMinGames}戦以上の対象者がいません`;
  const topStreak = currentRecords.longestTopStreak
    ? `${await nameFor(currentRecords.longestTopStreak.userId)} ${currentRecords.longestTopStreak.value}連続`
    : empty;
  const noLastStreak = currentRecords.longestNoLastStreak
    ? `${await nameFor(currentRecords.longestNoLastStreak.userId)} ${currentRecords.longestNoLastStreak.value}連続`
    : empty;

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setTitle("レコード")
        .setDescription(
          `種別: ${typeLabel(type)} / 期間: ${formatPeriodLabel(period)}${tournamentName ? ` / 大会名: ${tournamentName}` : ""}\n対象対局数: ${
            currentRecords.totalMatches
          }`
        )
        .addFields(
          { name: "最高スコア", value: highestRawScore, inline: false },
          { name: "最高pt", value: highestPoint, inline: false },
          { name: "最大トップ差", value: rawScoreMargin, inline: false },
          { name: "最大pt差", value: pointMargin, inline: false },
          { name: "最多トップ", value: mostTops, inline: true },
          { name: `最高平均順位 (${currentRecords.qualifiedMinGames}戦以上)`, value: bestAverageRank, inline: true },
          { name: "連続トップ", value: topStreak, inline: true },
          { name: "連続ラス回避", value: noLastStreak, inline: true }
        )
    ]
  });
}

function confirmRow(action: "del" | "undo", matchId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`mjs:${action}:confirm:${matchId}`)
      .setLabel("削除する")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`mjs:${action}:cancel:${matchId}`).setLabel("キャンセル").setStyle(ButtonStyle.Secondary)
  );
}

async function handleDeleteCommand(interaction: ChatInputCommandInteraction) {
  const guildId = requireGuildId(interaction);
  const matchId = interaction.options.getString("match_id", true);
  const match = await prisma.match.findFirst({
    where: {
      guildId,
      matchId
    }
  });
  if (!match) {
    await interaction.reply({ content: "指定されたMatchはこのサーバーに存在しません。", flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.reply({
    content: `Match \`${matchId}\` を削除しますか？`,
    components: [confirmRow("del", matchId)],
    flags: MessageFlags.Ephemeral
  });
}

async function handleUndoCommand(interaction: ChatInputCommandInteraction) {
  const guildId = requireGuildId(interaction);
  const match = await latestMatch(guildId);
  if (!match) {
    await interaction.reply({ content: "削除できる対局がありません。", flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.reply({
    content: `最新Match \`${match.matchId}\` (${typeLabel(match.type as MahjongType)}, ${formatDate(match.playedAt)}) を削除しますか？`,
    components: [confirmRow("undo", match.matchId)],
    flags: MessageFlags.Ephemeral
  });
}

async function handleConfirmButton(interaction: ButtonInteraction) {
  const guildId = requireGuildId(interaction);
  const [, action, decision, matchId] = interaction.customId.split(":");

  if (decision === "cancel") {
    await interaction.update({ content: "削除をキャンセルしました。", components: [] });
    return;
  }

  if (action === "undo") {
    const latest = await latestMatch(guildId);
    if (!latest || latest.matchId !== matchId) {
      await interaction.update({ content: "最新Matchが変わったため、削除を中止しました。", components: [] });
      return;
    }
  }

  const deleted = await deleteMatch(guildId, matchId);
  if (deleted.count === 0) {
    await interaction.update({ content: "対象Matchは既に存在しません。", components: [] });
    return;
  }

  await interaction.update({ content: `Match \`${matchId}\` を削除しました。`, components: [] });
}

async function handleSetName(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guildId = await assertSetNamePermission(interaction);
  if (!guildId) {
    return;
  }

  const user = interaction.options.getUser("user", true);
  const vrcName = interaction.options.getString("vrc_name", true).trim();

  if (!vrcName) {
    await interaction.editReply("VRC名を入力してください。");
    return;
  }

  await assertGuildMember(interaction, user.id);
  await ensureGuildAndUsers(guildId, [user.id]);
  await prisma.userProfile.upsert({
    where: {
      guildId_userId: {
        guildId,
        userId: user.id
      }
    },
    create: {
      guildId,
      userId: user.id,
      vrcName
    },
    update: {
      vrcName
    }
  });

  await interaction.editReply(`<@${user.id}> のVRC名を ${vrcName} に設定しました。`);
}

async function handleMembers(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guildId = requireGuildId(interaction);
  const profiles = await prisma.userProfile.findMany({
    where: {
      guildId
    },
    orderBy: {
      vrcName: "asc"
    }
  });

  if (profiles.length === 0) {
    await interaction.editReply("VRC名が登録されているメンバーはいません。");
    return;
  }

  const lines = await Promise.all(
    profiles.map(async (profile, index) => {
      const member = await fetchMember(interaction, profile.userId);
      const discordName = member ? member.displayName : `<@${profile.userId}>`;
      return `${index + 1}. ${profile.vrcName} - ${discordName}`;
    })
  );

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setTitle("登録済みメンバー")
        .setDescription(lines.slice(0, 50).join("\n"))
        .setFooter({ text: `${profiles.length}人登録済み${profiles.length > 50 ? "（先頭50人を表示）" : ""}` })
    ]
  });
}

async function handleHelp(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const canUseName = canManageNames(interaction);
  const lines = [
    "`/mjs add` 対局結果を登録",
    "`/mjs stats` 個人成績を表示",
    "`/mjs rank` ランキングを表示",
    "`/mjs best` レコードを表示",
    "`/mjs log` 対局履歴を表示",
    "`/mjs del` 指定した対局を削除",
    "`/mjs undo` 最新対局を削除",
    "`/mjs members` VRC名の登録メンバーを表示",
    "`/mjs help` このヘルプを表示"
  ];

  if (canUseName) {
    lines.splice(7, 0, "`/mjs name` DiscordユーザーとVRC名を紐づけ");
  }

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setTitle("MJS Help")
        .setDescription(lines.join("\n"))
        .setFooter({ text: canUseName ? "管理者・開発者向けコマンドを含めて表示しています。" : "管理者向けコマンドは非表示です。" })
    ]
  });
}

async function handleChatInput(interaction: ChatInputCommandInteraction) {
  if (interaction.commandName !== "mjs") {
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "add") {
    await handleRecordCommand(interaction);
  } else if (subcommand === "stats") {
    await handleStats(interaction);
  } else if (subcommand === "log") {
    await handleHistory(interaction);
  } else if (subcommand === "rank") {
    await handleRanking(interaction);
  } else if (subcommand === "best") {
    await handleRecords(interaction);
  } else if (subcommand === "del") {
    await handleDeleteCommand(interaction);
  } else if (subcommand === "undo") {
    await handleUndoCommand(interaction);
  } else if (subcommand === "name") {
    await handleSetName(interaction);
  } else if (subcommand === "members") {
    await handleMembers(interaction);
  } else if (subcommand === "help") {
    await handleHelp(interaction);
  }
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleChatInput(interaction);
    } else if (interaction.isModalSubmit() && interaction.customId.startsWith("mjs:add")) {
      await handleRecordModal(interaction);
    } else if (interaction.isButton() && interaction.customId.startsWith("mjs:")) {
      await handleConfirmButton(interaction);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "不明なエラーが発生しました。";
    if (interaction.isRepliable()) {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: message, embeds: [], components: [] }).catch(() => undefined);
      } else {
        await interaction.reply({ content: message, flags: MessageFlags.Ephemeral }).catch(() => undefined);
      }
    }
    console.error(error);
  }
});

healthServer.listen(port, () => {
  console.log(`Health server listening on port ${port}`);
});

process.once("SIGTERM", () => {
  healthServer.close();
  client.destroy();
});

process.once("SIGINT", () => {
  healthServer.close();
  client.destroy();
});

await client.login(token);
