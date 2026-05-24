import "dotenv/config";
import { randomUUID } from "node:crypto";
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
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type GuildMember,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction
} from "discord.js";
import { createApiServer } from "./external-api.js";
import { buildSeasonExportBundle, csvAttachment } from "./export.js";
import type { AwardSummary } from "./awards.js";
import { displayName, formatPercent, formatPoint } from "./display.js";
import { recordModal } from "./modals.js";
import {
  createNanikiruContext,
  createNanikiruQuestionFromHand,
  formatNanikiruContext,
  formatNanikiruHand,
  generateNanikiruQuestion,
  honorTileModeLabels,
  parseHonorTileMode,
  parseShantenFilter,
  shantenFilterLabels,
  tileLabel,
  uniqueDiscardTiles,
  type HonorTileMode,
  type NanikiruContext,
  type NanikiruQuestion,
  type ShantenFilter,
  type Tile
} from "./nanikiru.js";
import { parsePlayedAtInput } from "./date-input.js";
import { currentSeason, formatPeriodLabel, formatSeasonLabel, previousSeason, seasonWindow } from "./periods.js";
import { prisma } from "./prisma.js";
import { calculateRankMovements, movementSymbol } from "./rank-movement.js";
import { expectedPlayerCount, normalizeMahjongType } from "./scoring.js";
import { formatPenaltySuffix, isManager, lockStateForPeriod, lockStateForSeason, latestConcludedSeason } from "./season-lock.js";
import { aggregateHandStats, aggregateStats, buildMvpRankingFromResults, createMatch, deleteMatch, ensureGuildAndUsers, getResultsForDateRange, getResultsForPeriodByTypes, latestMatch, listMatches, ranking, rankingByTypes, rankingForDateRange, rankingForDateRangeByTypes, rankingWithLatestMatchDeltaForDateRangeByTypes, records, recordsForDateRange, resultsWithLatestMatchDeltaForDateRangeByTypes, seasonAwards, type AggregatedHandStats, type MvpRankingEntry, type RankingEntry } from "./services.js";
import type { MatchRecord, PlayerRecord } from "./records.js";
import type { MahjongType, Period, PlayerInput, SeasonCode } from "./types.js";
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
const discordLoginTimeoutMs = Number(process.env.DISCORD_LOGIN_TIMEOUT_MS ?? 30_000);

const pendingRecordOptions = new Map<
  string,
  {
    type: MahjongType;
    tournamentName?: string;
    playedAt: Date;
    players: Array<{ userId: string; rank: number }>;
  }
>();

const nanikiruCloseTimers = new Map<string, NodeJS.Timeout>();

function requireGuildId(interaction: { guildId: string | null }): string {
  if (!interaction.guildId) {
    throw new Error("このコマンドはサーバー内でのみ使用できます。");
  }
  return interaction.guildId;
}

function typeOption(interaction: ChatInputCommandInteraction): MahjongType {
  return normalizeMahjongType(interaction.options.getString("type") ?? "4p");
}

function optionalTypeOption(interaction: ChatInputCommandInteraction): MahjongType | undefined {
  const type = interaction.options.getString("type");
  return type ? normalizeMahjongType(type) : undefined;
}

function periodOption(interaction: ChatInputCommandInteraction): Period {
  return (interaction.options.getString("period") ?? "all") as Period;
}

function rankingPeriodOption(interaction: ChatInputCommandInteraction): Period {
  return (interaction.options.getString("period") ?? "month") as Period;
}

function seasonCodeOption(interaction: ChatInputCommandInteraction): SeasonCode | undefined {
  const season = interaction.options.getString("season");
  return season ? (season as SeasonCode) : undefined;
}

function resolveSeasonOption(interaction: ChatInputCommandInteraction) {
  const code = seasonCodeOption(interaction);
  const seasonYear = interaction.options.getInteger("season_year");
  if ((code && !seasonYear) || (!code && seasonYear)) {
    throw new Error("過去シーズンを指定する場合は season と season_year を両方指定してください。");
  }
  return code && seasonYear ? seasonWindow(code, seasonYear) : currentSeason();
}

function resolveLeaderboardWindow(interaction: ChatInputCommandInteraction) {
  const seasonRequested = Boolean(seasonCodeOption(interaction) || interaction.options.getInteger("season_year"));
  const rawPeriod = interaction.options.getString("period");
  if (seasonRequested && rawPeriod) {
    throw new Error("season 指定時は period を同時に指定できません。");
  }
  if (seasonRequested) {
    return {
      season: resolveSeasonOption(interaction),
      period: null
    };
  }
  if (rawPeriod) {
    const period = rawPeriod as Period;
    if (period === "current_season") {
      return {
        season: currentSeason(),
        period: null
      };
    }
    if (period === "previous_season") {
      return {
        season: previousSeason(),
        period: null
      };
    }
    return {
      season: null,
      period
    };
  }
  return {
    season: currentSeason(),
    period: null
  };
}

function isCurrentSeasonWindow(season: { code: SeasonCode; seasonYear: number } | null): boolean {
  if (!season) {
    return false;
  }
  const current = currentSeason();
  return current.code === season.code && current.seasonYear === season.seasonYear;
}

function isMvpRankingEntry(entry: RankingEntry | MvpRankingEntry): entry is MvpRankingEntry {
  return "rawTotalPoint" in entry;
}

function tournamentOption(interaction: ChatInputCommandInteraction): string | undefined {
  const tournamentName = interaction.options.getString("tournament_name")?.trim();
  return tournamentName || undefined;
}

function parsePlayedAtOption(interaction: ChatInputCommandInteraction): Date {
  return parsePlayedAtInput(interaction.options.getString("date"));
}

function formatDate(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function formatNullableRate(value: number | null): string {
  return value === null ? "-" : formatPercent(value * 100);
}

function formatNullableAverage(value: number | null, digits = 1): string {
  return value === null ? "-" : value.toFixed(digits);
}

function handStatsFields(stats: AggregatedHandStats) {
  if (stats.totalHands === 0) {
    return [];
  }

  return [
    {
      name: "局スタッツ",
      value: [
        `対象局数: ${stats.totalHands}`,
        `和了率: ${formatNullableRate(stats.winRate)}`,
        `放銃率: ${formatNullableRate(stats.dealInRate)}`,
        `立直率: ${formatNullableRate(stats.riichiRate)}`,
        `副露率: ${formatNullableRate(stats.callRate)}`,
        `流局率: ${formatNullableRate(stats.drawRate)}`
      ].join("\n"),
      inline: true
    },
    {
      name: "局詳細",
      value: [
        `自摸率: ${formatNullableRate(stats.tsumoRate)}`,
        `ダマ率: ${formatNullableRate(stats.damaRate)}`,
        `流局聴牌率: ${formatNullableRate(stats.ryukyokuTenpaiRate)}`,
        `平均和了: ${formatNullableAverage(stats.averageWinScore, 0)}点`,
        `平均放銃: ${formatNullableAverage(stats.averageDealInScore, 0)}点`,
        `平均和了順数: ${formatNullableAverage(stats.averageWinOrder, 1)}`,
        `飛び率: ${formatNullableRate(stats.bustRate)}`
      ].join("\n"),
      inline: true
    }
  ];
}

function typeLabel(type: MahjongType): string {
  const normalizedType = normalizeMahjongType(type);
  const labels: Record<MahjongType, string> = {
    "4p": "4人半荘",
    "3p": "3人半荘",
    "4p_east": "4人東風",
    "3p_east": "3人東風"
  };
  return labels[normalizedType];
}

async function summarizeRecordList<T>(
  entries: T[],
  formatEntry: (entry: T) => Promise<string>,
  empty: string,
  hiddenUnit: "名" | "件"
): Promise<string> {
  if (entries.length === 0) {
    return empty;
  }

  const visible = await Promise.all(entries.slice(0, 3).map(formatEntry));
  const hidden = entries.length - visible.length;
  return hidden > 0 ? `${visible.join("\n")}\n他${hidden}${hiddenUnit}` : visible.join("\n");
}

async function summarizeAwardList(
  entries: AwardSummary[],
  formatEntry: (entry: AwardSummary) => Promise<string>,
  empty: string
): Promise<string> {
  return summarizeRecordList(entries, formatEntry, empty, "名");
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

async function getSeasonLockSetting(guildId: string) {
  return prisma.seasonLockSetting.findUnique({
    where: {
      guildId
    }
  });
}

function hasManagerAccess(interaction: ChatInputCommandInteraction): boolean {
  return isManager(
    interaction.user.id,
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false,
    developerUserIds
  );
}

async function ensureSeasonLockAccess(
  interaction: ChatInputCommandInteraction,
  scope: "ranking" | "self_stats_only" | "full_lock",
  options: {
    season?: { code: SeasonCode; seasonYear: number; start: Date; end: Date } | null;
    period?: Period | null;
    selfUserId?: string;
  }
): Promise<boolean> {
  const guildId = requireGuildId(interaction);
  const setting = await getSeasonLockSetting(guildId);
  const lockState = options.season
    ? lockStateForSeason(options.season, setting)
    : lockStateForPeriod(options.period ?? null, setting);

  if (!lockState.locked) {
    return true;
  }

  const isManagerUser = hasManagerAccess(interaction);
  const inAdminChannel = Boolean(setting?.adminChannelId && interaction.channelId === setting.adminChannelId);

  if (isManagerUser && inAdminChannel) {
    return true;
  }

  if (scope === "self_stats_only" && options.selfUserId === interaction.user.id) {
    return true;
  }

  if (isManagerUser && !setting?.adminChannelId) {
    await interaction.editReply("シーズンロック中の運営閲覧チャンネルが未設定です。`/mjs season_lock` で設定してください。");
    return false;
  }

  if (isManagerUser) {
    await interaction.editReply("シーズンロック中のデータは、設定済みの運営閲覧チャンネルでのみ確認できます。");
    return false;
  }

  if (scope === "self_stats_only") {
    await interaction.editReply("シーズン終盤のため、この期間の stats は自分の成績のみ確認できます。");
    return false;
  }

  await interaction.editReply("シーズン終盤のため、この期間のデータは現在ロック中です。");
  return false;
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

  if (expected === 4 && !interaction.options.getUser("player4")) {
    throw new Error(`${typeLabel(type)}では4位のプレイヤーを指定してください。`);
  }
  if (expected === 3 && interaction.options.getUser("player4")) {
    throw new Error(`${typeLabel(type)}では4位のプレイヤーは指定しないでください。`);
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
        .setTitle(`${typeLabel(pending.type)} 対局を登録しました`)
        .setDescription(
          `種別: ${typeLabel(pending.type)}\n対局日: ${formatDate(match.playedAt)}${
            match.tournamentName ? `\n大会名: ${match.tournamentName}` : ""
          }`
        )
        .addFields(fields)
        .setTimestamp(match.createdAt)
    ]
  });
}

async function handleStats(interaction: ChatInputCommandInteraction) {
  const guildId = requireGuildId(interaction);
  const user = interaction.options.getUser("user") ?? interaction.user;
  const type = typeOption(interaction);
  const period = periodOption(interaction);
  const setting = await getSeasonLockSetting(guildId);
  const isLockedSelfView = lockStateForPeriod(period, setting).locked && user.id === interaction.user.id;

  await interaction.deferReply(isLockedSelfView ? { flags: MessageFlags.Ephemeral } : undefined);

  if (!(await ensureSeasonLockAccess(interaction, "self_stats_only", { period, selfUserId: user.id }))) {
    return;
  }
  const tournamentName = tournamentOption(interaction);
  const [stats, handStats] = await Promise.all([
    aggregateStats(guildId, type, period, user.id, tournamentName),
    aggregateHandStats(guildId, type, period, user.id, tournamentName)
  ]);
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
        `${formatDate(result.match.playedAt)} ${result.rank}位 ${result.rawScore}点 ${formatPoint(
          result.point
        )}pt`
    )
    .join("\n");

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setTitle(`${typeLabel(type)} ${name} の成績`)
        .setDescription(
          `種別: ${typeLabel(type)} / 期間: ${formatPeriodLabel(period)}${tournamentName ? ` / 大会名: ${tournamentName}` : ""}`
        )
        .addFields(
          { name: "総対局数", value: `${stats.totalGames}`, inline: true },
          { name: "合計ポイント", value: `${formatPoint(stats.totalPoint)}pt`, inline: true },
          { name: "平均順位", value: stats.totalGames ? stats.averageRank.toFixed(2) : "-", inline: true },
          { name: "平均ポイント", value: stats.totalGames ? `${formatPoint(stats.averagePoint)}pt` : "-", inline: true },
          ...rankFields,
          ...handStatsFields(handStats),
          { name: "直近対局履歴", value: history || "対局履歴がありません。", inline: false }
        )
    ]
  });
}

async function handleHistory(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const guildId = requireGuildId(interaction);
  if (!(await ensureSeasonLockAccess(interaction, "full_lock", { period: "all" }))) {
    return;
  }
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
        .setTitle(`${typeLabel(type)} ${name} の履歴`)
        .setDescription(`種別: ${typeLabel(type)}\n${lines.join("\n") || "対局履歴がありません。"}`)
    ]
  });
}

async function handleMatchList(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const guildId = requireGuildId(interaction);
  if (!(await ensureSeasonLockAccess(interaction, "full_lock", { period: "all" }))) {
    return;
  }
  const type = optionalTypeOption(interaction);
  const count = interaction.options.getInteger("count") ?? 10;
  const tournamentName = tournamentOption(interaction);
  const matches = await listMatches(guildId, count, type, tournamentName);

  if (matches.length === 0) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("対局一覧")
          .setDescription(
            `条件: ${type ? typeLabel(type) : "全種別"}${tournamentName ? ` / 大会名: ${tournamentName}` : ""}\n対象の対局がありません。`
          )
      ]
    });
    return;
  }

  const fields = await Promise.all(
    matches.map(async (match) => {
      const resultLines = await Promise.all(
        match.results.map(async (result) => {
          const member = await fetchMember(interaction, result.userId);
          const name = await displayName(guildId, member, result.userId);
          return `${result.rank}位 ${name} ${result.rawScore}点 ${formatPoint(result.point)}pt`;
        })
      );
      const meta = [
        match.tournamentName ? `大会名: ${match.tournamentName}` : undefined,
        match.externalMatch ? `外部: ${match.externalMatch.externalSource}/${match.externalMatch.externalMatchId}` : undefined
      ].filter(Boolean);
      const value = [...meta, ...resultLines].join("\n");

      return {
        name: `${formatDate(match.playedAt)} ${typeLabel(match.type as MahjongType)} / ${match.matchId}`,
        value: value.length > 1024 ? `${value.slice(0, 1020)}...` : value,
        inline: false
      };
    })
  );

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setTitle("対局一覧")
        .setDescription(
          `条件: ${type ? typeLabel(type) : "全種別"} / 表示件数: ${matches.length}${tournamentName ? ` / 大会名: ${tournamentName}` : ""}\n削除する場合は \`/mjs del match_id\` に対象IDを指定してください。`
        )
        .addFields(fields)
    ]
  });
}

async function handleRanking(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const guildId = requireGuildId(interaction);
  const type = optionalTypeOption(interaction);
  const rankingTypes: MahjongType[] = type ? [type] : ["3p", "4p"];
  const rankingLabel = type ? typeLabel(type) : "MVP";
  const rankingScope = type ? `\u7a2e\u5225: ${typeLabel(type)}` : "\u5bfe\u8c61: 3\u4eba\u534a\u8358 + 4\u4eba\u534a\u8358";
  const { season, period } = resolveLeaderboardWindow(interaction);
  const tournamentName = tournamentOption(interaction);
  if (!(await ensureSeasonLockAccess(interaction, "ranking", { season, period }))) {
    return;
  }
  const showMovement = Boolean(season && isCurrentSeasonWindow(season));
  const showMvpPenalty = !type && (season ? isCurrentSeasonWindow(season) : true);
  let computedRankingData: {
    current: Array<RankingEntry | MvpRankingEntry>;
    previous: Array<RankingEntry | MvpRankingEntry>;
    latestMatchId: string | null;
  };

  if (!type && season) {
    const resultSet = showMovement
      ? await resultsWithLatestMatchDeltaForDateRangeByTypes(guildId, rankingTypes, season.start, season.end, tournamentName)
      : {
          currentResults: await getResultsForDateRange(guildId, rankingTypes, season.start, season.end, undefined, tournamentName),
          previousResults: [],
          latestMatchId: null
        };
    computedRankingData = {
      current: buildMvpRankingFromResults(resultSet.currentResults),
      previous: buildMvpRankingFromResults(resultSet.previousResults),
      latestMatchId: resultSet.latestMatchId
    };
  } else if (season) {
    computedRankingData = showMovement
      ? await rankingWithLatestMatchDeltaForDateRangeByTypes(guildId, rankingTypes, season.start, season.end, tournamentName)
      : {
          current: await rankingForDateRangeByTypes(guildId, rankingTypes, season.start, season.end, tournamentName),
          previous: [],
          latestMatchId: null
        };
  } else {
    computedRankingData = {
      current: type
        ? await ranking(guildId, type, period!, tournamentName)
        : buildMvpRankingFromResults(await getResultsForPeriodByTypes(guildId, rankingTypes, period!, undefined, tournamentName)),
      previous: [],
      latestMatchId: null
    };
  }
  const movements = showMovement ? calculateRankMovements(computedRankingData.current, computedRankingData.previous, true) : new Map();
  const lines = await Promise.all(
    computedRankingData.current.slice(0, 20).map(async (entry, index) => {
      const member = await fetchMember(interaction, entry.userId);
      const name = await displayName(guildId, member, entry.userId);
      const movement = showMovement ? `${movementSymbol(movements.get(entry.userId) ?? "same")} ` : "";
      const displayPoint =
        isMvpRankingEntry(entry)
          ? showMvpPenalty
            ? `${formatPoint(entry.rawTotalPoint)}pt`
            : `${formatPoint(entry.totalPoint)}pt`
          : `${formatPoint(entry.totalPoint)}pt`;
      const detailParts = [`${entry.games}\u6226`, `\u5e73\u5747\u9806\u4f4d ${entry.averageRank.toFixed(2)}`];
      if (isMvpRankingEntry(entry) && showMvpPenalty && entry.penaltyPoint > 0) {
        detailParts.push(`\u501f\u91d1${formatPenaltySuffix(entry.penaltyPoint)}`);
      }
      return `${movement}${index + 1}. ${name} ${displayPoint}\n   ${detailParts.join(" / ")}`;
    })
  );

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setTitle(`${rankingLabel} \u30dd\u30a4\u30f3\u30c8\u30e9\u30f3\u30ad\u30f3\u30b0 ${season ? formatSeasonLabel(season) : formatPeriodLabel(period!)}`)
        .setDescription(
          `${rankingScope} / ${season ? `\u30b7\u30fc\u30ba\u30f3: ${formatSeasonLabel(season)}` : `\u671f\u9593: ${formatPeriodLabel(period!)}`}${
            tournamentName ? ` / \u5927\u4f1a\u540d: ${tournamentName}` : ""
          }
\n${lines.join("\n\n") || "\u5bfe\u8c61\u30c7\u30fc\u30bf\u304c\u3042\u308a\u307e\u305b\u3093"}`
        )
    ]
  });
}

async function handleRecords(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const guildId = requireGuildId(interaction);
  const type = typeOption(interaction);
  const { season, period } = resolveLeaderboardWindow(interaction);
  if (!(await ensureSeasonLockAccess(interaction, "full_lock", { season, period }))) {
    return;
  }
  const tournamentName = tournamentOption(interaction);
  const currentRecords = season
    ? await recordsForDateRange(guildId, type, season.start, season.end, tournamentName)
    : await records(guildId, type, period!, tournamentName);
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
  const matchText = (playedAt: Date) => formatDate(playedAt);
  const empty = "\u8a18\u9332\u306a\u3057";

  const highestRawScore = await summarizeRecordList<MatchRecord>(
    currentRecords.highestRawScore,
    async (record) => `${await nameFor(record.userId)} ${record.value}\u70b9
${matchText(record.playedAt)}` ,
    empty,
    "\u4ef6"
  );
  const mostTops = await summarizeRecordList<PlayerRecord>(
    currentRecords.mostTops,
    async (record) => `${await nameFor(record.userId)} ${record.value}\u56de`,
    empty,
    "\u540d"
  );
  const lowestDealInRate =
    type === "4p"
      ? await summarizeRecordList<PlayerRecord>(
          currentRecords.lowestDealInRate,
          async (record) => `${await nameFor(record.userId)} ${record.value.toFixed(1)}%`,
          `${currentRecords.qualifiedMinGames}戦以上の記録なし`,
          "\u540d"
        )
      : "4人半荘のみ";
  const highestWinRate =
    type === "4p"
      ? await summarizeRecordList<PlayerRecord>(
          currentRecords.highestWinRate,
          async (record) => `${await nameFor(record.userId)} ${record.value.toFixed(1)}%`,
          `${currentRecords.qualifiedMinGames}戦以上の記録なし`,
          "\u540d"
        )
      : "4人半荘のみ";
  const mostYakuman =
    type === "4p"
      ? await summarizeRecordList<PlayerRecord>(
          currentRecords.mostYakuman,
          async (record) => `${await nameFor(record.userId)} ${record.value}回`,
          empty,
          "\u540d"
        )
      : "4人半荘のみ";
  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setTitle(`${typeLabel(type)} \u30ec\u30b3\u30fc\u30c9`)
        .setDescription(
          `\u7a2e\u5225: ${typeLabel(type)} / ${season ? `\u30b7\u30fc\u30ba\u30f3: ${formatSeasonLabel(season)}` : `\u671f\u9593: ${formatPeriodLabel(period!)}`}${
            tournamentName ? ` / \u5927\u4f1a\u540d: ${tournamentName}` : ""
          }
\u5bfe\u8c61\u5bfe\u5c40\u6570: ${currentRecords.totalMatches}`
        )
        .addFields(
          { name: "\u6700\u9ad8\u30b9\u30b3\u30a2", value: highestRawScore, inline: false },
          { name: "\u6700\u591a\u30c8\u30c3\u30d7", value: mostTops, inline: false },
          { name: "\u6700\u4f4e\u653e\u9283\u7387", value: lowestDealInRate, inline: false },
          { name: "\u6700\u9ad8\u548c\u4e86\u7387", value: highestWinRate, inline: false },
          { name: "\u6700\u591a\u5f79\u6e80", value: mostYakuman, inline: false }
        )
    ]
  });
}

async function handleAwards(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const guildId = requireGuildId(interaction);
  const season = resolveSeasonOption(interaction);
  if (!(await ensureSeasonLockAccess(interaction, "full_lock", { season }))) {
    return;
  }
  const awards = await seasonAwards(guildId, season.start, season.end);
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

  const mvp = await summarizeAwardList(
    awards.mvp,
    async (entry) => `${await nameFor(entry.userId)} ${formatPoint(entry.value)}pt`,
    `${awards.minGames}戦以上の記録なし`
  );
  const topPrize = await summarizeAwardList(
    awards.topPrize,
    async (entry) => `${await nameFor(entry.userId)} ${entry.value}回`,
    `${awards.minGames}戦以上の記録なし`
  );
  const stabilityPrize = await summarizeAwardList(
    awards.stabilityPrize,
    async (entry) => `${await nameFor(entry.userId)} ${entry.value.toFixed(2)}位`,
    `${awards.minGames}戦以上の記録なし`
  );
  const highestScorePrize = await summarizeAwardList(
    awards.highestScorePrize,
    async (entry) => `${await nameFor(entry.userId)} ${entry.value}点`,
    `${awards.minGames}戦以上の記録なし`
  );
  const topStreakPrize = await summarizeAwardList(
    awards.topStreakPrize,
    async (entry) => `${await nameFor(entry.userId)} ${entry.value}連続`,
    "2連続以上の記録なし"
  );
  const noLastStreakPrize = await summarizeAwardList(
    awards.noLastStreakPrize,
    async (entry) => `${await nameFor(entry.userId)} ${entry.value}連続`,
    "2連続以上の記録なし"
  );
  const participationPrize = await summarizeAwardList(
    awards.participationPrize,
    async (entry) => `${await nameFor(entry.userId)} ${entry.value}戦`,
    `${awards.minGames}戦以上の記録なし`
  );
  const lowestDealInRatePrize = await summarizeAwardList(
    awards.lowestDealInRatePrize,
    async (entry) => `${await nameFor(entry.userId)} ${entry.value.toFixed(1)}%`,
    `4人半荘${awards.minGames}戦以上の記録なし`
  );
  const mostYakumanPrize = await summarizeAwardList(
    awards.mostYakumanPrize,
    async (entry) => `${await nameFor(entry.userId)} ${entry.value}回`,
    `4人半荘${awards.minGames}戦以上の記録なし`
  );

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setTitle(`白鳳会 シーズン表彰 ${formatSeasonLabel(season)}`)
        .setDescription(`対象: 3人半荘・4人半荘の常設戦 / 参加条件: ${awards.minGames}戦以上 / 放銃率・役満は4人半荘のみ`)
        .addFields(
          { name: "MVP", value: mvp, inline: false },
          { name: "トップ賞", value: topPrize, inline: true },
          { name: "安定賞", value: stabilityPrize, inline: true },
          { name: "最高スコア賞", value: highestScorePrize, inline: true },
          { name: "連続トップ賞", value: topStreakPrize, inline: true },
          { name: "連続ラス回避賞", value: noLastStreakPrize, inline: true },
          { name: "最多対局賞", value: participationPrize, inline: true },
          { name: "最低放銃率賞", value: lowestDealInRatePrize, inline: true },
          { name: "最多役満賞", value: mostYakumanPrize, inline: true }
        )
    ]
  });
}

async function handleExport(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guildId = requireGuildId(interaction);
  const season = resolveSeasonOption(interaction);
  if (!(await ensureSeasonLockAccess(interaction, "full_lock", { season }))) {
    return;
  }
  const exportBundle = await buildSeasonExportBundle(guildId, season);

  await interaction.editReply({
    content: `${formatSeasonLabel(season)} のCSVを出力しました。\nresults: ${exportBundle.resultRows.length}行\nrank_snapshots: ${exportBundle.rankSnapshotRows.length}行`,
    files: [
      csvAttachment(exportBundle.resultFileName, exportBundle.resultCsv),
      csvAttachment(exportBundle.rankSnapshotFileName, exportBundle.rankSnapshotsCsv)
    ]
  });
}

async function handleSeasonLock(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guildId = requireGuildId(interaction);
  if (!hasManagerAccess(interaction)) {
    await interaction.editReply("このコマンドはサーバー管理者または開発者のみ使用できます。");
    return;
  }

  const channel = interaction.options.getChannel("channel", true);
  await prisma.seasonLockSetting.upsert({
    where: { guildId },
    create: {
      guildId,
      adminChannelId: channel.id
    },
    update: {
      adminChannelId: channel.id
    }
  });

  await interaction.editReply(`シーズンロック中の運営閲覧チャンネルを <#${channel.id}> に設定しました。`);
}

async function handleSeasonUnlock(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guildId = requireGuildId(interaction);
  if (!hasManagerAccess(interaction)) {
    await interaction.editReply("このコマンドはサーバー管理者または開発者のみ使用できます。");
    return;
  }

  const season = latestConcludedSeason();
  await prisma.seasonLockSetting.upsert({
    where: { guildId },
    create: {
      guildId,
      unlockedSeasonCode: season.code,
      unlockedSeasonYear: season.seasonYear
    },
    update: {
      unlockedSeasonCode: season.code,
      unlockedSeasonYear: season.seasonYear
    }
  });

  await interaction.editReply(`${formatSeasonLabel(season)} のロックを解除しました。`);
}

function nanikiruDescription(question: NanikiruQuestion, context: NanikiruContext, note?: string | null): string {
  const lines = [formatNanikiruContext(context), formatNanikiruHand(question)];
  if (note) {
    lines.push(`備考: ${note}`);
  }
  return lines.join("\n");
}

function nanikiruEmbed(question: NanikiruQuestion, context: NanikiruContext, answerCount: number, note?: string | null) {
  return new EmbedBuilder()
    .setTitle("平面何切る")
    .setDescription(nanikiruDescription(question, context, note))
    .setFooter({ text: `回答数: ${answerCount} / 回答すると自分だけに現在の回答分布が表示されます。24時間後に締め切ります。` });
}

function closedNanikiruEmbed(question: NanikiruQuestion, context: NanikiruContext, answerCount: number, note?: string | null) {
  return new EmbedBuilder()
    .setTitle("平面何切る（締切済み）")
    .setDescription(nanikiruDescription(question, context, note))
    .setFooter({ text: `回答数: ${answerCount} / この問題の回答受付は終了しました。` });
}

function nanikiruAnswerRow(questionId: string, hand: Tile[]) {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`mjs:nanikiru:${questionId}`)
      .setPlaceholder("切る牌を選択")
      .addOptions(
        uniqueDiscardTiles(hand).map((tile) => ({
          label: tileLabel(tile),
          value: `${tile}`
        }))
      )
  );
}

function formatNanikiruCounts(counts: Map<Tile, number>): string {
  const lines = [...counts.entries()]
    .sort(([leftTile, leftCount], [rightTile, rightCount]) => rightCount - leftCount || leftTile - rightTile)
    .map(([tile, count]) => `${tileLabel(tile)} ${count}票`);
  return lines.length ? lines.join(" / ") : "回答なし";
}

async function nanikiruDistributionWithNames(guildId: string, answers: Array<{ userId: string; tile: number }>): Promise<string> {
  if (answers.length === 0) {
    return "回答なし";
  }

  const grouped = new Map<Tile, string[]>();
  for (const answer of answers) {
    const names = grouped.get(answer.tile) ?? [];
    names.push(await displayNameForUserId(guildId, answer.userId));
    grouped.set(answer.tile, names);
  }

  return [...grouped.entries()]
    .sort(([leftTile, leftNames], [rightTile, rightNames]) => rightNames.length - leftNames.length || leftTile - rightTile)
    .map(([tile, names]) => `${tileLabel(tile)} ${names.length}票: ${names.join(", ")}`)
    .join("\n");
}

async function displayNameForUserId(guildId: string, userId: string): Promise<string> {
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  const member = await guild?.members.fetch(userId).catch(() => null);
  return member?.displayName ?? `User-${userId.slice(-4)}`;
}

function serializeHand(hand: Tile[]): string {
  return hand.join(",");
}

function deserializeHand(hand: string): Tile[] {
  return hand.split(",").map((tile) => Number(tile));
}

function serializeRedDoraTiles(redDoraTiles: Tile[]): string {
  return redDoraTiles.join(",");
}

function deserializeRedDoraTiles(redDoraTiles?: string | null): Tile[] {
  return redDoraTiles ? redDoraTiles.split(",").map((tile) => Number(tile)) : [];
}

function serializeDoraTiles(doraTiles: Tile[]): string {
  return doraTiles.join(",");
}

function deserializeDoraTiles(doraTiles?: string | null): Tile[] {
  return doraTiles ? doraTiles.split(",").map((tile) => Number(tile)) : [];
}

function storedQuestion(problem: { hand: string; redDoraTiles?: string | null; bestShanten: number; bestDiscardCount?: number | null }): NanikiruQuestion {
  return {
    hand: deserializeHand(problem.hand),
    redDoraTiles: deserializeRedDoraTiles(problem.redDoraTiles),
    bestShanten: problem.bestShanten,
    bestDiscardCount: problem.bestDiscardCount ?? 1
  };
}

function storedContext(problem: {
  doraTile?: number | null;
  doraTiles?: string | null;
  turnNumber?: number | null;
  seatWind?: string | null;
  roundWind?: string | null;
  roundNumber?: number | null;
}): NanikiruContext {
  const doraTiles = deserializeDoraTiles(problem.doraTiles);
  return {
    doraTiles: doraTiles.length > 0 ? doraTiles : [problem.doraTile ?? 4],
    turn: problem.turnNumber ?? 8,
    seatWind: problem.seatWind === "south" || problem.seatWind === "west" || problem.seatWind === "north" ? problem.seatWind : "east",
    roundWind: problem.roundWind === "south" || problem.roundWind === "west" ? problem.roundWind : "east",
    roundNumber: problem.roundWind === "west" ? 1 : problem.roundNumber ?? 1
  };
}

async function nanikiruResultEmbed(problem: {
  questionId: string;
  guildId: string;
  hand: string;
  redDoraTiles?: string | null;
  bestShanten: number;
  bestDiscardCount?: number | null;
  shantenFilter: string;
  honorTileMode: string;
  doraTile?: number | null;
  doraTiles?: string | null;
  turnNumber?: number | null;
  seatWind?: string | null;
  roundWind?: string | null;
  roundNumber?: number | null;
  note?: string | null;
  answers: Array<{ userId: string; tile: number }>;
}) {
  const question = storedQuestion(problem);
  const context = storedContext(problem);
  const distribution = await nanikiruDistributionWithNames(problem.guildId, problem.answers);
  const shantenFilterLabel = problem.shantenFilter === "manual"
    ? "手動入力"
    : shantenFilterLabels[problem.shantenFilter as ShantenFilter] ?? problem.shantenFilter;

  return new EmbedBuilder()
    .setTitle("平面何切る 回答結果")
    .setDescription(`${nanikiruDescription(question, context, problem.note)}\n回答数: ${problem.answers.length}`)
    .addFields(
      {
        name: "出題条件",
        value: `${shantenFilterLabel} / ${
          honorTileModeLabels[problem.honorTileMode as HonorTileMode] ?? problem.honorTileMode
        }`,
        inline: false
      },
      { name: "回答分布", value: distribution, inline: false }
    )
    .setFooter({ text: `Question ID: ${problem.questionId}` });
}

async function ensureGuild(guildId: string) {
  await prisma.guild.upsert({
    where: { guildId },
    create: { guildId },
    update: {}
  });
}

async function resolveSendableChannel(channelId: string) {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (channel?.isTextBased() && "send" in channel) {
    return channel;
  }
  return null;
}

async function resolveNanikiruPostChannel(interaction: ChatInputCommandInteraction, configuredChannelId?: string | null) {
  const selectedChannel = interaction.options.getChannel("channel");
  if (selectedChannel) {
    return resolveSendableChannel(selectedChannel.id);
  }
  if (configuredChannelId) {
    return resolveSendableChannel(configuredChannelId);
  }
  return interaction.channel?.isTextBased() && "send" in interaction.channel ? interaction.channel : null;
}

function scheduleNanikiruClose(questionId: string, closesAt: Date) {
  const existing = nanikiruCloseTimers.get(questionId);
  if (existing) {
    clearTimeout(existing);
  }

  const delayMs = Math.max(0, closesAt.getTime() - Date.now());
  const timer = setTimeout(() => {
    closeNanikiruQuestion(questionId).catch((error) => console.error(error));
  }, delayMs);
  timer.unref();
  nanikiruCloseTimers.set(questionId, timer);
}

async function schedulePendingNanikiruQuestions() {
  const problems = await prisma.nanikiruProblem.findMany({
    where: {
      closedAt: null
    },
    select: {
      questionId: true,
      closesAt: true
    }
  });

  for (const problem of problems) {
    scheduleNanikiruClose(problem.questionId, problem.closesAt);
  }
}

async function closeNanikiruQuestion(questionId: string) {
  const updated = await prisma.nanikiruProblem.updateMany({
    where: {
      questionId,
      closedAt: null
    },
    data: {
      closedAt: new Date()
    }
  });
  if (updated.count === 0) {
    return;
  }

  const timer = nanikiruCloseTimers.get(questionId);
  if (timer) {
    clearTimeout(timer);
    nanikiruCloseTimers.delete(questionId);
  }

  const problem = await prisma.nanikiruProblem.findUnique({
    where: { questionId },
    include: { answers: true }
  });
  if (!problem) {
    return;
  }

  const question = storedQuestion(problem);
  const context = storedContext(problem);
  const messageChannel = await resolveSendableChannel(problem.questionChannelId);
  const message = await messageChannel?.messages.fetch(problem.messageId).catch(() => null);
  await message?.edit({
    embeds: [closedNanikiruEmbed(question, context, problem.answers.length, problem.note)],
    components: []
  }).catch(() => undefined);

  const resultChannel = await resolveSendableChannel(problem.resultChannelId ?? problem.questionChannelId);
  await resultChannel?.send({
    embeds: [await nanikiruResultEmbed(problem)]
  }).catch((error) => console.error(error));
}

async function handleNanikiruCommand(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guildId = requireGuildId(interaction);
  const filter = parseShantenFilter(interaction.options.getString("shanten"));
  const honorTileMode = parseHonorTileMode(interaction.options.getString("honors"));
  const handInput = interaction.options.getString("hand");
  const note = interaction.options.getString("note")?.trim() || null;
  const question = handInput ? createNanikiruQuestionFromHand(handInput) : generateNanikiruQuestion(filter, honorTileMode);
  const context = createNanikiruContext({
    dora: interaction.options.getString("dora"),
    turn: interaction.options.getInteger("turn"),
    seatWind: interaction.options.getString("seat_wind"),
    roundWind: interaction.options.getString("round_wind"),
    roundNumber: interaction.options.getInteger("round_number")
  });
  const setting = await prisma.nanikiruGuildSetting.findUnique({ where: { guildId } });
  const targetChannel = await resolveNanikiruPostChannel(interaction, setting?.questionChannelId);

  if (!targetChannel) {
    await interaction.editReply("投稿先にはテキストチャンネルを指定してください。");
    return;
  }

  const questionId = randomUUID();
  const closesAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const message = await targetChannel.send({
    embeds: [nanikiruEmbed(question, context, 0, note)],
    components: [nanikiruAnswerRow(questionId, question.hand)]
  });

  await ensureGuild(guildId);
  await prisma.nanikiruProblem.create({
    data: {
      questionId,
      guildId,
      hand: serializeHand(question.hand),
      redDoraTiles: serializeRedDoraTiles(question.redDoraTiles),
      bestShanten: question.bestShanten,
      bestDiscardCount: question.bestDiscardCount,
      shantenFilter: handInput ? "manual" : filter,
      honorTileMode,
      doraTile: context.doraTiles[0],
      doraTiles: serializeDoraTiles(context.doraTiles),
      note,
      turnNumber: context.turn,
      seatWind: context.seatWind,
      roundWind: context.roundWind,
      roundNumber: context.roundNumber,
      questionChannelId: targetChannel.id,
      resultChannelId: setting?.resultChannelId ?? setting?.questionChannelId ?? targetChannel.id,
      messageId: message.id,
      closesAt
    }
  });
  scheduleNanikiruClose(questionId, closesAt);

  const destination = targetChannel.id === interaction.channelId ? "このチャンネル" : `<#${targetChannel.id}>`;
  const conditionText = handInput ? "手動入力" : `${shantenFilterLabels[filter]} / ${honorTileModeLabels[honorTileMode]}`;
  await interaction.editReply(`${destination} に ${conditionText} の何切るを投稿しました。`);
}

async function handleNanikiruConfigCommand(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guildId = requireGuildId(interaction);
  if (!canManageNames(interaction)) {
    await interaction.editReply("この操作はサーバー管理者または開発者のみ実行できます。");
    return;
  }

  const questionChannel = interaction.options.getChannel("question_channel");
  const resultChannel = interaction.options.getChannel("result_channel");
  await ensureGuild(guildId);

  if (!questionChannel && !resultChannel) {
    const setting = await prisma.nanikiruGuildSetting.findUnique({ where: { guildId } });
    await interaction.editReply(
      `何切る設定\n問題投稿: ${setting?.questionChannelId ? `<#${setting.questionChannelId}>` : "未設定"}\n結果投稿: ${
        setting?.resultChannelId ? `<#${setting.resultChannelId}>` : "未設定（問題投稿チャンネル）"
      }`
    );
    return;
  }

  const data = {
    ...(questionChannel ? { questionChannelId: questionChannel.id } : {}),
    ...(resultChannel ? { resultChannelId: resultChannel.id } : {})
  };
  const setting = await prisma.nanikiruGuildSetting.upsert({
    where: { guildId },
    create: {
      guildId,
      questionChannelId: questionChannel?.id,
      resultChannelId: resultChannel?.id
    },
    update: data
  });

  await interaction.editReply(
    `何切る設定を更新しました。\n問題投稿: ${setting.questionChannelId ? `<#${setting.questionChannelId}>` : "未設定"}\n結果投稿: ${
      setting.resultChannelId ? `<#${setting.resultChannelId}>` : "未設定（問題投稿チャンネル）"
    }`
  );
}

async function handleNanikiruAnswer(interaction: StringSelectMenuInteraction) {
  const [, feature, questionId] = interaction.customId.split(":");
  if (feature !== "nanikiru" || !questionId) {
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const problem = await prisma.nanikiruProblem.findUnique({
    where: { questionId },
    include: { answers: true }
  });
  if (!problem || problem.guildId !== interaction.guildId) {
    await interaction.editReply("この問題の受付は終了しました。新しく `/mjs nanikiru` を実行してください。");
    return;
  }

  if (problem.closedAt || problem.closesAt.getTime() <= Date.now()) {
    await closeNanikiruQuestion(questionId);
    await interaction.editReply("この問題の回答受付は終了しました。");
    return;
  }

  const question = storedQuestion(problem);
  const context = storedContext(problem);
  const selectedTile = Number(interaction.values[0]);
  if (!Number.isInteger(selectedTile) || !uniqueDiscardTiles(question.hand).includes(selectedTile)) {
    await interaction.editReply("不正な回答です。");
    return;
  }

  const previousAnswer = problem.answers.find((answer) => answer.userId === interaction.user.id)?.tile;
  await prisma.nanikiruAnswer.upsert({
    where: {
      questionId_userId: {
        questionId,
        userId: interaction.user.id
      }
    },
    create: {
      questionId,
      userId: interaction.user.id,
      tile: selectedTile
    },
    update: {
      tile: selectedTile
    }
  });

  const answers = await prisma.nanikiruAnswer.findMany({
    where: { questionId }
  });
  await interaction.message.edit({
    embeds: [nanikiruEmbed(question, context, answers.length, problem.note)],
    components: [nanikiruAnswerRow(questionId, question.hand)]
  }).catch((error) => console.error(error));

  const distribution = await nanikiruDistributionWithNames(problem.guildId, answers);
  const answerText = previousAnswer === undefined
    ? `あなたの回答: ${tileLabel(selectedTile)}`
    : `あなたの回答を ${tileLabel(previousAnswer)} から ${tileLabel(selectedTile)} に変更しました。`;
  await interaction.editReply(`${answerText}\n現在の回答分布:\n${distribution}`);
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
    "`/mjs stats` 成績を表示",
    "`/mjs rank` ランキングを表示",
    "`/mjs best` レコードを表示",
    "`/mjs awards` シーズン表彰を表示",
    "`/mjs export` CSVを出力",
    "`/mjs season_lock` ロック中の運営閲覧チャンネルを設定",
    "`/mjs season_unlock` 直前シーズンのロックを解除",
    "`/mjs nanikiru` 何切る問題を出題",
    "`/mjs nanikiru_config` 何切るの投稿先を設定",
    "`/mjs log` ユーザー別の対局履歴を表示",
    "`/mjs matches` サーバー全体の対局一覧を表示",
    "`/mjs del` 指定した対局を削除",
    "`/mjs undo` 最新の対局を削除",
    "`/mjs members` VRC名の登録一覧を表示",
    "`/mjs help` このヘルプを表示"
  ];

  if (canUseName) {
    lines.splice(12, 0, "`/mjs name` DiscordユーザーとVRC名を紐づけ");
  }

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setTitle("MJS Help")
        .setDescription(lines.join("\n"))
        .setFooter({
          text: canUseName ? "管理者向けコマンドを含めて表示しています。" : "管理者向けコマンドは非表示です。"
        })
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
  } else if (subcommand === "matches") {
    await handleMatchList(interaction);
  } else if (subcommand === "rank") {
    await handleRanking(interaction);
  } else if (subcommand === "best") {
    await handleRecords(interaction);
  } else if (subcommand === "awards") {
    await handleAwards(interaction);
  } else if (subcommand === "export") {
    await handleExport(interaction);
  } else if (subcommand === "season_lock") {
    await handleSeasonLock(interaction);
  } else if (subcommand === "season_unlock") {
    await handleSeasonUnlock(interaction);
  } else if (subcommand === "nanikiru") {
    await handleNanikiruCommand(interaction);
  } else if (subcommand === "nanikiru_config") {
    await handleNanikiruConfigCommand(interaction);
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
  schedulePendingNanikiruQuestions().catch((error) => console.error(error));
});

client.on(Events.Debug, (message) => {
  if (process.env.DISCORD_DEBUG === "1") {
    console.debug(`[discord:debug] ${message}`);
  }
});

client.on(Events.Error, (error) => {
  console.error("[discord:error]", error);
});

client.on(Events.Warn, (message) => {
  console.warn(`[discord:warn] ${message}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleChatInput(interaction);
    } else if (interaction.isModalSubmit() && interaction.customId.startsWith("mjs:add")) {
      await handleRecordModal(interaction);
    } else if (interaction.isStringSelectMenu() && interaction.customId.startsWith("mjs:nanikiru:")) {
      await handleNanikiruAnswer(interaction);
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

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Discord login timed out after ${ms}ms.`)), ms);
  });
}

try {
  console.log(`Starting Discord login for client ${process.env.DISCORD_CLIENT_ID ?? "unknown"}.`);
  await Promise.race([client.login(token), timeout(discordLoginTimeoutMs)]);
} catch (error) {
  console.error("Discord login failed.", error);
  healthServer.close();
  process.exitCode = 1;
  throw error;
}
