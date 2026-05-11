import "dotenv/config";
import { createReadStream, existsSync, statSync } from "node:fs";
import { opendir, stat } from "node:fs/promises";
import { EOL, homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { createInterface } from "node:readline";

interface WatchOptions {
  apiUrl: string;
  apiKey?: string;
  guildId?: string;
  logPath?: string;
  dryRun: boolean;
  localOnly: boolean;
  allowPlaceholderPlayers: boolean;
  prefix: string;
  pollMs: number;
}

interface TankiLogPayload {
  guildId?: string;
  type: string;
  playedAt?: string;
  tournamentName?: string;
  externalSource?: string;
  externalMatchId?: string;
  dryRun?: boolean;
  players: Array<{
    displayName: string;
    rank: number;
    rawScore: number;
  }>;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function options(): WatchOptions {
  const localOnly = (process.env.TANKI_LOCAL_ONLY ?? "false").toLowerCase() === "true";
  return {
    apiUrl: process.env.TANKI_API_URL?.trim() || "https://mjs-tengoku2-a8a007d5.koyeb.app/api/matches",
    apiKey: localOnly ? process.env.EXTERNAL_API_KEY?.trim() : requireEnv("EXTERNAL_API_KEY"),
    guildId: process.env.TANKI_GUILD_ID?.trim() || process.env.DISCORD_GUILD_ID?.trim(),
    logPath: process.env.TANKI_LOG_PATH?.trim(),
    dryRun: (process.env.TANKI_DRY_RUN ?? "true").toLowerCase() !== "false",
    localOnly,
    allowPlaceholderPlayers: (process.env.TANKI_ALLOW_PLACEHOLDER_PLAYERS ?? "false").toLowerCase() === "true",
    prefix: process.env.TANKI_LOG_PREFIX?.trim() || "MJS_RESULT:",
    pollMs: Number(process.env.TANKI_POLL_MS ?? 1000)
  };
}

async function newestVrchatLog(): Promise<string> {
  const dir = join(homedir(), "AppData", "LocalLow", "VRChat", "VRChat");
  const entries: Array<{ path: string; mtimeMs: number }> = [];
  const handle = await opendir(dir);
  for await (const entry of handle) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".txt") || !entry.name.toLowerCase().includes("output_log")) {
      continue;
    }
    const path = join(dir, entry.name);
    const info = await stat(path);
    entries.push({ path, mtimeMs: info.mtimeMs });
  }
  entries.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const newest = entries[0]?.path;
  if (!newest) {
    throw new Error(`No VRChat output_log txt file found in ${dir}`);
  }
  return newest;
}

function makeExternalMatchId(payload: TankiLogPayload): string {
  if (payload.externalMatchId?.trim()) {
    return payload.externalMatchId.trim();
  }
  const date = payload.playedAt || new Date().toISOString();
  const players = payload.players
    .map((player) => `${player.rank}:${player.displayName}:${player.rawScore}`)
    .sort()
    .join("|");
  return Buffer.from(`${payload.type}|${date}|${players}`).toString("base64url").slice(0, 96);
}

function normalizePayload(raw: unknown, opts: WatchOptions): TankiLogPayload {
  if (!raw || typeof raw !== "object") {
    throw new Error("Log payload must be a JSON object.");
  }
  const payload = raw as TankiLogPayload;
  if (!payload.guildId && !opts.guildId) {
    throw new Error("guildId is required in log payload or TANKI_GUILD_ID.");
  }
  if (!Array.isArray(payload.players)) {
    throw new Error("players must be an array.");
  }

  return {
    ...payload,
    guildId: payload.guildId || opts.guildId,
    externalSource: payload.externalSource || "tanki-log",
    externalMatchId: makeExternalMatchId(payload),
    dryRun: payload.dryRun ?? opts.dryRun
  };
}

function placeholderPlayerPositions(payload: TankiLogPayload): number[] {
  return payload.players
    .map((player, index) => ({ index, name: player.displayName?.trim() ?? "" }))
    .filter((player) => !player.name || player.name === "-")
    .map((player) => player.index + 1);
}

function validateReadyToSend(payload: TankiLogPayload, opts: WatchOptions) {
  if (opts.localOnly && opts.allowPlaceholderPlayers) {
    return;
  }

  const blankPlayers = placeholderPlayerPositions(payload);

  if (blankPlayers.length > 0) {
    const positions = blankPlayers.join(", ");
    throw new Error(`Skipped: player displayName is empty at positions ${positions}. Run this with actual seated players.`);
  }
}

async function postMatch(payload: TankiLogPayload, opts: WatchOptions) {
  if (!opts.apiKey) {
    throw new Error("EXTERNAL_API_KEY is required unless TANKI_LOCAL_ONLY=true.");
  }
  const response = await fetch(opts.apiUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${opts.apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`API ${response.status}: ${text}`);
  }
  return text;
}

async function readExistingLines(path: string, prefix: string, onLine: (line: string) => Promise<void>) {
  const stream = createReadStream(path, { encoding: "utf8" });
  const reader = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of reader) {
    if (line.includes(prefix)) {
      await onLine(line);
    }
  }
}

async function watchAppendedLines(path: string, onChunkLine: (line: string) => Promise<void>, pollMs: number) {
  let position = statSync(path).size;
  let carry = "";
  setInterval(async () => {
    try {
      if (!existsSync(path)) {
        return;
      }
      const size = statSync(path).size;
      if (size < position) {
        position = 0;
        carry = "";
      }
      if (size === position) {
        return;
      }

      const stream = createReadStream(path, { encoding: "utf8", start: position, end: size - 1 });
      position = size;
      for await (const chunk of stream) {
        carry += chunk;
        const lines = carry.split(/\r?\n/);
        carry = lines.pop() ?? "";
        for (const line of lines) {
          await onChunkLine(line);
        }
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
    }
  }, pollMs);
}

async function main() {
  const opts = options();
  const logPath = resolve(opts.logPath || (await newestVrchatLog()));
  console.log(`Watching ${basename(logPath)} with prefix ${opts.prefix}`);
  console.log(`Mode: ${opts.localOnly ? "localOnly" : opts.dryRun ? "dryRun" : "register"}`);

  const seen = new Set<string>();
  async function handleLine(line: string) {
    const index = line.indexOf(opts.prefix);
    if (index < 0) {
      return;
    }
    const jsonText = line.slice(index + opts.prefix.length).trim();
    if (!jsonText || seen.has(jsonText)) {
      return;
    }
    seen.add(jsonText);

    try {
      const payload = normalizePayload(JSON.parse(jsonText), opts);
      validateReadyToSend(payload, opts);
      if (opts.localOnly) {
        const placeholders = placeholderPlayerPositions(payload);
        console.log(
          `localOnly ${payload.externalMatchId}${placeholders.length > 0 ? ` placeholders=${placeholders.join(",")}` : ""}${EOL}` +
            JSON.stringify(payload, null, 2)
        );
        return;
      }
      const result = await postMatch(payload, opts);
      console.log(`sent ${payload.dryRun ? "dryRun" : "register"} ${payload.externalMatchId}${EOL}${result}`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
    }
  }

  if ((process.env.TANKI_READ_EXISTING ?? "false").toLowerCase() === "true") {
    await readExistingLines(logPath, opts.prefix, handleLine);
  }
  await watchAppendedLines(logPath, handleLine, opts.pollMs);
}

await main();
