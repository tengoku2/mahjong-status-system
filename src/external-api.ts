import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { URL } from "node:url";
import type { Client } from "discord.js";
import { prisma } from "./prisma.js";
import { createExternalMatch } from "./services.js";
import { calculateResults, normalizeMahjongType } from "./scoring.js";
import type { MahjongType, PlayerInput } from "./types.js";
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
}

interface ExternalPlayerPayload {
  discordUserId?: unknown;
  userId?: unknown;
  displayName?: unknown;
  vrcName?: unknown;
  rank?: unknown;
  rawScore?: unknown;
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

function normalizeType(value: unknown): MahjongType {
  const text = requireString(value, "type");
  try {
    return normalizeMahjongType(text);
  } catch {
    throw new HttpError(400, "type must be 3p, 4p, 3p_east, or 4p_east.");
  }
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

interface ParsedExternalPlayer {
  userId?: string;
  displayName?: string;
  rank: number;
  rawScore: number;
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
    const rank = player.rank;
    const rawScore = player.rawScore;
    if (!Number.isInteger(rank)) {
      throw new HttpError(400, `players[${index}].rank must be an integer.`);
    }
    if (!Number.isInteger(rawScore)) {
      throw new HttpError(400, `players[${index}].rawScore must be an integer.`);
    }

    return {
      userId: userId || undefined,
      displayName,
      rank: rank as number,
      rawScore: rawScore as number
    };
  });
}

function normalizeNameForMatch(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
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
    where: {
      guildId
    },
    select: {
      userId: true,
      vrcName: true
    }
  });

  const profilesByName = new Map<string, Array<{ userId: string; vrcName: string }>>();
  for (const profile of profiles) {
    const key = normalizeNameForMatch(profile.vrcName);
    const current = profilesByName.get(key) ?? [];
    current.push(profile);
    profilesByName.set(key, current);
  }

  return players.map((player, index) => {
    if (player.userId) {
      return {
        userId: player.userId,
        rank: player.rank,
        rawScore: player.rawScore
      };
    }

    const displayName = player.displayName as string;
    const matches = profilesByName.get(normalizeNameForMatch(displayName)) ?? [];
    if (matches.length === 0) {
      throw new HttpError(400, `players[${index}].displayName is not registered in this guild.`);
    }
    if (matches.length > 1) {
      throw new HttpError(400, `players[${index}].displayName matches multiple registered users.`);
    }

    return {
      userId: matches[0].userId,
      rank: player.rank,
      rawScore: player.rawScore
    };
  });
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

async function assertGuildMembers(client: Client, guildId: string, players: PlayerInput[]) {
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    throw new HttpError(400, "guildId is not available to this bot.");
  }

  for (const player of players) {
    const member = await guild.members.fetch(player.userId).catch(() => null);
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
  validatePlayers(type, players);
  await assertGuildMembers(client, guildId, players);

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
      results: calculateResults(type, players).map((matchResult) => ({
        userId: matchResult.userId,
        rank: matchResult.rank,
        rawScore: matchResult.rawScore,
        point: matchResult.point
      }))
    });
    return;
  }

  const result = await createExternalMatch(guildId, type, players, tournamentName, playedAt, {
    externalSource,
    externalMatchId
  });

  sendJson(response, result.duplicate ? 200 : 201, {
    ok: true,
    duplicate: result.duplicate,
    matchId: result.match.matchId,
    guildId: result.match.guildId,
    type: result.match.type,
    tournamentName: result.match.tournamentName,
    playedAt: result.match.playedAt,
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
