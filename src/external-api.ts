import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { URL } from "node:url";
import type { Client } from "discord.js";
import { prisma } from "./prisma.js";
import { createExternalMatch } from "./services.js";
import { calculateResults, normalizeMahjongType } from "./scoring.js";
import type { HandEndType, HandInput, HandPlayerStatInput, MahjongType, PlayerInput } from "./types.js";
import { validatePlayers } from "./validation.js";

const maxBodyBytes = 64 * 1024;
const idPattern = /^\d{17,20}$/;

interface ExternalMatchPayload {
  guildId?: unknown;
  type?: unknown;
  playedAt?: unknown;
  tournamentName?: unknown;
  externalSource?: unknown;
  externalMatchId?: unknown;
  dryRun?: unknown;
  players?: unknown;
  hands?: unknown;
}

interface ExternalPlayerPayload {
  discordUserId?: unknown;
  userId?: unknown;
  displayName?: unknown;
  vrcName?: unknown;
  rank?: unknown;
  rawScore?: unknown;
}

interface ExternalHandPayload {
  handIndex?: unknown;
  roundWind?: unknown;
  roundNumber?: unknown;
  honba?: unknown;
  kyotaku?: unknown;
  dealerDiscordUserId?: unknown;
  dealerUserId?: unknown;
  dealerDisplayName?: unknown;
  dealerVrcName?: unknown;
  endType?: unknown;
  abortReason?: unknown;
  playerStats?: unknown;
}

interface ExternalHandPlayerStatPayload {
  discordUserId?: unknown;
  userId?: unknown;
  displayName?: unknown;
  vrcName?: unknown;
  seat?: unknown;
  startScore?: unknown;
  endScore?: unknown;
  isTenpaiAtRyukyoku?: unknown;
  declaredRiichi?: unknown;
  calledOpenMeld?: unknown;
  won?: unknown;
  wonByTsumo?: unknown;
  dealtIn?: unknown;
  winScore?: unknown;
  dealInScore?: unknown;
  winOrder?: unknown;
  isDama?: unknown;
  ippatsuWin?: unknown;
  uraDoraCount?: unknown;
}

interface ParsedExternalPlayer {
  userId?: string;
  displayName?: string;
  rank: number;
  rawScore: number;
}

interface ParsedExternalHandPlayerStat {
  userId?: string;
  displayName?: string;
  seat?: number;
  startScore?: number;
  endScore?: number;
  isTenpaiAtRyukyoku?: boolean;
  declaredRiichi?: boolean;
  calledOpenMeld?: boolean;
  won?: boolean;
  wonByTsumo?: boolean;
  dealtIn?: boolean;
  winScore?: number;
  dealInScore?: number;
  winOrder?: number;
  isDama?: boolean;
  ippatsuWin?: boolean;
  uraDoraCount?: number;
}

interface ParsedExternalHand {
  handIndex: number;
  roundWind: string;
  roundNumber: number;
  honba?: number;
  kyotaku?: number;
  dealerUserId?: string;
  dealerDisplayName?: string;
  endType: HandEndType;
  abortReason?: string;
  playerStats: ParsedExternalHandPlayerStat[];
}

class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
  }
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body, "utf8") > maxBodyBytes) {
        reject(new HttpError(413, "Request body is too large."));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

async function readJson(request: IncomingMessage): Promise<ExternalMatchPayload> {
  const body = await readBody(request);
  if (!body.trim()) {
    throw new HttpError(400, "JSON body is required.");
  }

  try {
    return JSON.parse(body) as ExternalMatchPayload;
  } catch {
    throw new HttpError(400, "Invalid JSON body.");
  }
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, `${fieldName} is required.`);
  }
  return value.trim();
}

function requireInteger(value: unknown, fieldName: string): number {
  if (!Number.isInteger(value)) {
    throw new HttpError(400, `${fieldName} must be an integer.`);
  }
  return value as number;
}

function optionalInteger(value: unknown, fieldName: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return requireInteger(value, fieldName);
}

function optionalBoolean(value: unknown, fieldName: string): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new HttpError(400, `${fieldName} must be a boolean.`);
  }
  return value;
}

function normalizeType(value: unknown): MahjongType {
  const text = requireString(value, "type");
  try {
    return normalizeMahjongType(text);
  } catch {
    throw new HttpError(400, "type must be 3p, 4p, 3p_east, or 4p_east.");
  }
}

function normalizeHandEndType(value: unknown, fieldName: string): HandEndType {
  const text = requireString(value, fieldName).toUpperCase();
  if (text !== "AGARI" && text !== "RYUKYOKU" && text !== "ABORTIVE" && text !== "FORCED_END") {
    throw new HttpError(400, `${fieldName} must be AGARI, RYUKYOKU, ABORTIVE, or FORCED_END.`);
  }
  return text;
}

function parsePlayedAt(value: unknown): Date | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new HttpError(400, "playedAt must be a string.");
  }

  const text = value.trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const date = dateOnly ? new Date(`${text}T12:00:00+09:00`) : new Date(text);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, "playedAt must be YYYY-MM-DD or an ISO datetime.");
  }
  return date;
}

function normalizeDisplayName(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function normalizePlayers(value: unknown): ParsedExternalPlayer[] {
  if (!Array.isArray(value)) {
    throw new HttpError(400, "players must be an array.");
  }

  return value.map((entry, index) => {
    const player = entry as ExternalPlayerPayload;
    const userId = typeof player.discordUserId === "string" ? player.discordUserId.trim() : typeof player.userId === "string" ? player.userId.trim() : "";
    const displayName = normalizeDisplayName(player.displayName) ?? normalizeDisplayName(player.vrcName);
    if (userId && !idPattern.test(userId)) {
      throw new HttpError(400, `players[${index}].discordUserId must be a Discord user ID.`);
    }
    if (!userId && !displayName) {
      throw new HttpError(400, `players[${index}] must include discordUserId or displayName.`);
    }
    return {
      userId: userId || undefined,
      displayName,
      rank: requireInteger(player.rank, `players[${index}].rank`),
      rawScore: requireInteger(player.rawScore, `players[${index}].rawScore`)
    };
  });
}

function normalizeHandPlayerStats(value: unknown): ParsedExternalHandPlayerStat[] {
  if (!Array.isArray(value)) {
    throw new HttpError(400, "hands[].playerStats must be an array.");
  }

  return value.map((entry, index) => {
    const stat = entry as ExternalHandPlayerStatPayload;
    const userId = typeof stat.discordUserId === "string" ? stat.discordUserId.trim() : typeof stat.userId === "string" ? stat.userId.trim() : "";
    const displayName = normalizeDisplayName(stat.displayName) ?? normalizeDisplayName(stat.vrcName);
    if (userId && !idPattern.test(userId)) {
      throw new HttpError(400, `hands[].playerStats[${index}].discordUserId must be a Discord user ID.`);
    }
    if (!userId && !displayName) {
      throw new HttpError(400, `hands[].playerStats[${index}] must include discordUserId or displayName.`);
    }

    return {
      userId: userId || undefined,
      displayName,
      seat: optionalInteger(stat.seat, `hands[].playerStats[${index}].seat`),
      startScore: optionalInteger(stat.startScore, `hands[].playerStats[${index}].startScore`),
      endScore: optionalInteger(stat.endScore, `hands[].playerStats[${index}].endScore`),
      isTenpaiAtRyukyoku: optionalBoolean(stat.isTenpaiAtRyukyoku, `hands[].playerStats[${index}].isTenpaiAtRyukyoku`),
      declaredRiichi: optionalBoolean(stat.declaredRiichi, `hands[].playerStats[${index}].declaredRiichi`),
      calledOpenMeld: optionalBoolean(stat.calledOpenMeld, `hands[].playerStats[${index}].calledOpenMeld`),
      won: optionalBoolean(stat.won, `hands[].playerStats[${index}].won`),
      wonByTsumo: optionalBoolean(stat.wonByTsumo, `hands[].playerStats[${index}].wonByTsumo`),
      dealtIn: optionalBoolean(stat.dealtIn, `hands[].playerStats[${index}].dealtIn`),
      winScore: optionalInteger(stat.winScore, `hands[].playerStats[${index}].winScore`),
      dealInScore: optionalInteger(stat.dealInScore, `hands[].playerStats[${index}].dealInScore`),
      winOrder: optionalInteger(stat.winOrder, `hands[].playerStats[${index}].winOrder`),
      isDama: optionalBoolean(stat.isDama, `hands[].playerStats[${index}].isDama`),
      ippatsuWin: optionalBoolean(stat.ippatsuWin, `hands[].playerStats[${index}].ippatsuWin`),
      uraDoraCount: optionalInteger(stat.uraDoraCount, `hands[].playerStats[${index}].uraDoraCount`)
    };
  });
}

function normalizeHands(value: unknown): ParsedExternalHand[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new HttpError(400, "hands must be an array.");
  }

  const hands = value.map((entry, index) => {
    const hand = entry as ExternalHandPayload;
    const dealerUserId =
      typeof hand.dealerDiscordUserId === "string"
        ? hand.dealerDiscordUserId.trim()
        : typeof hand.dealerUserId === "string"
          ? hand.dealerUserId.trim()
          : "";
    const dealerDisplayName = normalizeDisplayName(hand.dealerDisplayName) ?? normalizeDisplayName(hand.dealerVrcName);
    if (dealerUserId && !idPattern.test(dealerUserId)) {
      throw new HttpError(400, `hands[${index}].dealerDiscordUserId must be a Discord user ID.`);
    }

    return {
      handIndex: requireInteger(hand.handIndex, `hands[${index}].handIndex`),
      roundWind: requireString(hand.roundWind, `hands[${index}].roundWind`),
      roundNumber: requireInteger(hand.roundNumber, `hands[${index}].roundNumber`),
      honba: optionalInteger(hand.honba, `hands[${index}].honba`),
      kyotaku: optionalInteger(hand.kyotaku, `hands[${index}].kyotaku`),
      dealerUserId: dealerUserId || undefined,
      dealerDisplayName,
      endType: normalizeHandEndType(hand.endType, `hands[${index}].endType`),
      abortReason: typeof hand.abortReason === "string" ? hand.abortReason.trim() || undefined : undefined,
      playerStats: normalizeHandPlayerStats(hand.playerStats)
    };
  });

  const uniqueIndexes = new Set(hands.map((hand) => hand.handIndex));
  if (uniqueIndexes.size !== hands.length) {
    throw new HttpError(400, "hands[].handIndex must be unique.");
  }

  return hands.sort((a, b) => a.handIndex - b.handIndex);
}

function normalizeNameForMatch(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

function buildProfilesByName(profiles: Array<{ userId: string; vrcName: string }>) {
  const profilesByName = new Map<string, Array<{ userId: string; vrcName: string }>>();
  for (const profile of profiles) {
    const key = normalizeNameForMatch(profile.vrcName);
    const current = profilesByName.get(key) ?? [];
    current.push(profile);
    profilesByName.set(key, current);
  }
  return profilesByName;
}

function resolveUserIdByName(
  profilesByName: Map<string, Array<{ userId: string; vrcName: string }>>,
  displayName: string,
  fieldName: string
) {
  const matches = profilesByName.get(normalizeNameForMatch(displayName)) ?? [];
  if (matches.length === 0) {
    throw new HttpError(400, `${fieldName} is not registered in this guild.`);
  }
  if (matches.length > 1) {
    throw new HttpError(400, `${fieldName} matches multiple registered users.`);
  }
  return matches[0].userId;
}

async function resolvePlayersByDisplayName(guildId: string, players: ParsedExternalPlayer[]): Promise<PlayerInput[]> {
  const unresolvedNames = [...new Set(players.filter((player) => !player.userId).map((player) => player.displayName).filter(Boolean) as string[])];
  if (unresolvedNames.length === 0) {
    return players.map((player) => ({
      userId: player.userId as string,
      rank: player.rank,
      rawScore: player.rawScore
    }));
  }

  const profiles = await prisma.userProfile.findMany({
    where: { guildId },
    select: {
      userId: true,
      vrcName: true
    }
  });
  const profilesByName = buildProfilesByName(profiles);

  return players.map((player, index) => {
    if (player.userId) {
      return {
        userId: player.userId,
        rank: player.rank,
        rawScore: player.rawScore
      };
    }

    return {
      userId: resolveUserIdByName(profilesByName, player.displayName as string, `players[${index}].displayName`),
      rank: player.rank,
      rawScore: player.rawScore
    };
  });
}

async function resolveHandsByDisplayName(guildId: string, hands: ParsedExternalHand[] | undefined): Promise<HandInput[] | undefined> {
  if (!hands || hands.length === 0) {
    return undefined;
  }

  const unresolvedNames = hands.some(
    (hand) => (!hand.dealerUserId && hand.dealerDisplayName) || hand.playerStats.some((stat) => !stat.userId)
  );

  const profiles = unresolvedNames
    ? await prisma.userProfile.findMany({
        where: { guildId },
        select: {
          userId: true,
          vrcName: true
        }
      })
    : [];
  const profilesByName = buildProfilesByName(profiles);

  return hands.map((hand, handIndex) => ({
    handIndex: hand.handIndex,
    roundWind: hand.roundWind,
    roundNumber: hand.roundNumber,
    honba: hand.honba,
    kyotaku: hand.kyotaku,
    dealerUserId:
      hand.dealerUserId ??
      (hand.dealerDisplayName
        ? resolveUserIdByName(profilesByName, hand.dealerDisplayName, `hands[${handIndex}].dealerDisplayName`)
        : undefined),
    endType: hand.endType,
    abortReason: hand.abortReason,
    playerStats: hand.playerStats.map((stat, playerIndex) => ({
      userId:
        stat.userId ??
        resolveUserIdByName(profilesByName, stat.displayName as string, `hands[${handIndex}].playerStats[${playerIndex}].displayName`),
      seat: stat.seat,
      startScore: stat.startScore,
      endScore: stat.endScore,
      isTenpaiAtRyukyoku: stat.isTenpaiAtRyukyoku,
      declaredRiichi: stat.declaredRiichi,
      calledOpenMeld: stat.calledOpenMeld,
      won: stat.won,
      wonByTsumo: stat.wonByTsumo,
      dealtIn: stat.dealtIn,
      winScore: stat.winScore,
      dealInScore: stat.dealInScore,
      winOrder: stat.winOrder,
      isDama: stat.isDama,
      ippatsuWin: stat.ippatsuWin,
      uraDoraCount: stat.uraDoraCount
    } satisfies HandPlayerStatInput))
  }));
}

function authenticate(request: IncomingMessage) {
  const apiKey = process.env.EXTERNAL_API_KEY;
  if (!apiKey) {
    throw new HttpError(503, "External API is disabled.");
  }

  const authHeader = request.headers.authorization;
  const bearer = typeof authHeader === "string" && authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : undefined;
  const headerKey = Array.isArray(request.headers["x-api-key"]) ? request.headers["x-api-key"][0] : request.headers["x-api-key"];
  if (bearer !== apiKey && headerKey !== apiKey) {
    throw new HttpError(401, "Invalid API key.");
  }
}

async function assertGuildMembers(client: Client, guildId: string, players: PlayerInput[], hands?: HandInput[]) {
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    throw new HttpError(400, "guildId is not available to this bot.");
  }

  const userIds = new Set(players.map((player) => player.userId));
  for (const hand of hands ?? []) {
    if (hand.dealerUserId) {
      userIds.add(hand.dealerUserId);
    }
    for (const stat of hand.playerStats) {
      userIds.add(stat.userId);
    }
  }

  for (const userId of userIds) {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) {
      throw new HttpError(400, "サーバー内での対戦のみ有効です。");
    }
  }
}

async function handleExternalMatch(client: Client, request: IncomingMessage, response: ServerResponse) {
  authenticate(request);
  const payload = await readJson(request);
  const guildId = requireString(payload.guildId, "guildId");
  const type = normalizeType(payload.type);
  const parsedPlayers = normalizePlayers(payload.players);
  const parsedHands = normalizeHands(payload.hands);
  const externalSource = requireString(payload.externalSource, "externalSource");
  const externalMatchId = requireString(payload.externalMatchId, "externalMatchId");
  const tournamentName = typeof payload.tournamentName === "string" ? payload.tournamentName.trim() || undefined : undefined;
  const playedAt = parsePlayedAt(payload.playedAt);
  const dryRun = payload.dryRun === true;

  if (!idPattern.test(guildId)) {
    throw new HttpError(400, "guildId must be a Discord guild ID.");
  }
  if (externalSource.length > 64) {
    throw new HttpError(400, "externalSource must be 64 characters or less.");
  }
  if (externalMatchId.length > 128) {
    throw new HttpError(400, "externalMatchId must be 128 characters or less.");
  }

  const players = await resolvePlayersByDisplayName(guildId, parsedPlayers);
  const hands = await resolveHandsByDisplayName(guildId, parsedHands);
  validatePlayers(type, players);
  await assertGuildMembers(client, guildId, players, hands);

  if (dryRun) {
    const existing = await prisma.externalMatch.findUnique({
      where: {
        externalSource_externalMatchId: {
          externalSource,
          externalMatchId
        }
      },
      select: {
        matchId: true
      }
    });
    sendJson(response, 200, {
      ok: true,
      dryRun: true,
      duplicate: Boolean(existing),
      existingMatchId: existing?.matchId,
      guildId,
      type,
      tournamentName,
      playedAt,
      handCount: hands?.length ?? 0,
      results: calculateResults(type, players).map((matchResult) => ({
        userId: matchResult.userId,
        rank: matchResult.rank,
        rawScore: matchResult.rawScore,
        point: matchResult.point
      }))
    });
    return;
  }

  const result = await createExternalMatch(
    guildId,
    type,
    players,
    tournamentName,
    playedAt,
    {
      externalSource,
      externalMatchId
    },
    hands
  );

  sendJson(response, result.duplicate ? 200 : 201, {
    ok: true,
    duplicate: result.duplicate,
    matchId: result.match.matchId,
    guildId: result.match.guildId,
    type: result.match.type,
    tournamentName: result.match.tournamentName,
    playedAt: result.match.playedAt,
    handCount: hands?.length ?? 0,
    results: result.match.results.map((matchResult) => ({
      userId: matchResult.userId,
      rank: matchResult.rank,
      rawScore: matchResult.rawScore,
      point: matchResult.point
    }))
  });
}

export function createApiServer(client: Client) {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");

      if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
        sendJson(response, 200, {
          ok: true,
          discordReady: client.isReady(),
          discordStatus: client.ws?.status,
          discordPing: client.ws?.ping,
          uptime: process.uptime()
        });
        return;
      }

      if (url.pathname === "/api/matches") {
        if (request.method !== "POST") {
          response.setHeader("allow", "POST");
          sendJson(response, 405, { ok: false, error: "Method Not Allowed" });
          return;
        }
        await handleExternalMatch(client, request, response);
        return;
      }

      sendJson(response, 404, { ok: false, error: "Not Found" });
    } catch (error) {
      const statusCode = error instanceof HttpError ? error.statusCode : 500;
      const message = error instanceof Error ? error.message : "Internal Server Error";
      sendJson(response, statusCode, { ok: false, error: message });
      if (statusCode >= 500) {
        console.error(error);
      }
    }
  });
}
