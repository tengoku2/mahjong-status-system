import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

type DatabaseSyncConstructor = new (path: string, options?: { readOnly?: boolean }) => {
  prepare: (sql: string) => {
    all: (...values: unknown[]) => unknown[];
    get: (...values: unknown[]) => unknown;
  };
  close: () => void;
};

const sqlitePath = resolve(process.env.SQLITE_DATABASE_PATH ?? "prisma/dev.db");
if (!existsSync(sqlitePath)) {
  throw new Error(`SQLite database not found: ${sqlitePath}`);
}

const { DatabaseSync } = (await import("node:sqlite")) as unknown as { DatabaseSync: DatabaseSyncConstructor };
const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });
const prisma = new PrismaClient();

function rows<T>(sql: string): T[] {
  return sqlite.prepare(sql).all() as T[];
}

function dateValue(value: string | Date | null | undefined): Date {
  return value ? new Date(value) : new Date();
}

const guilds = rows<{ guild_id: string; created_at: string }>('SELECT guild_id, created_at FROM "guilds"');
const users = rows<{ guild_id: string; user_id: string; created_at: string }>('SELECT guild_id, user_id, created_at FROM "users"');
const profiles = rows<{ guild_id: string; user_id: string; vrc_name: string; updated_at: string }>(
  'SELECT guild_id, user_id, vrc_name, updated_at FROM "user_profiles"'
);
const matches = rows<{
  match_id: string;
  guild_id: string;
  type: string;
  tournament_name: string | null;
  played_at: string | null;
  created_at: string;
}>(
  'SELECT match_id, guild_id, type, tournament_name, COALESCE(played_at, created_at) AS played_at, created_at FROM "matches"'
);
const results = rows<{
  result_id: string;
  match_id: string;
  user_id: string;
  rank: number;
  raw_score: number;
  point: number;
}>('SELECT result_id, match_id, user_id, rank, raw_score, point FROM "results"');

await prisma.$transaction(
  async (tx) => {
    for (const guild of guilds) {
      await tx.guild.upsert({
        where: { guildId: guild.guild_id },
        create: { guildId: guild.guild_id, createdAt: dateValue(guild.created_at) },
        update: {}
      });
    }

    for (const user of users) {
      await tx.user.upsert({
        where: { guildId_userId: { guildId: user.guild_id, userId: user.user_id } },
        create: { guildId: user.guild_id, userId: user.user_id, createdAt: dateValue(user.created_at) },
        update: {}
      });
    }

    for (const profile of profiles) {
      await tx.userProfile.upsert({
        where: { guildId_userId: { guildId: profile.guild_id, userId: profile.user_id } },
        create: {
          guildId: profile.guild_id,
          userId: profile.user_id,
          vrcName: profile.vrc_name,
          updatedAt: dateValue(profile.updated_at)
        },
        update: {
          vrcName: profile.vrc_name
        }
      });
    }

    for (const match of matches) {
      await tx.match.upsert({
        where: { matchId: match.match_id },
        create: {
          matchId: match.match_id,
          guildId: match.guild_id,
          type: match.type,
          tournamentName: match.tournament_name ?? undefined,
          playedAt: dateValue(match.played_at),
          createdAt: dateValue(match.created_at)
        },
        update: {}
      });
    }

    for (const result of results) {
      await tx.result.upsert({
        where: { resultId: result.result_id },
        create: {
          resultId: result.result_id,
          matchId: result.match_id,
          userId: result.user_id,
          rank: result.rank,
          rawScore: result.raw_score,
          point: result.point
        },
        update: {}
      });
    }
  },
  {
    timeout: 120_000,
    maxWait: 30_000
  }
);

sqlite.close();
await prisma.$disconnect();

console.log(
  `Migrated ${guilds.length} guilds, ${users.length} users, ${profiles.length} profiles, ${matches.length} matches, ${results.length} results.`
);
