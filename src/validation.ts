import { expectedPlayerCount, normalizeMahjongType } from "./scoring.js";
import type { MahjongType, PlayerInput } from "./types.js";

const userIdPattern = /^(?:<@!?)?(\d{17,20})>?$/;

export interface ParsedPlayerLine {
  userRef: string;
  userId?: string;
  rank: number;
  rawScore: number;
}

export function parseMahjongType(value: string): MahjongType {
  try {
    return normalizeMahjongType(value);
  } catch {
    throw new Error("麻雀種別は 3p, 4p, 3p_east, 4p_east のいずれかで入力してください。");
  }
}

export function userIdFromRef(userRef: string): string | null {
  const userMatch = userIdPattern.exec(userRef.trim());
  return userMatch?.[1] ?? null;
}

export function parsePlayerLine(line: string, defaultRank?: number): ParsedPlayerLine | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  const parts = trimmed.split(/\s+/);
  const usesDefaultRank = parts.length === 2 && defaultRank !== undefined;
  if (parts.length !== 3 && !usesDefaultRank) {
    throw new Error(`入力形式が不正です: ${line}\n例: @ユーザー 39400 または @ユーザー 1 39400`);
  }

  const userRef = parts[0];
  const rank = usesDefaultRank ? defaultRank : Number(parts[1]);
  const rawScore = Number(usesDefaultRank ? parts[1] : parts[2]);

  if (!Number.isInteger(rank)) {
    throw new Error(`順位は整数で入力してください: ${usesDefaultRank ? defaultRank : parts[1]}`);
  }
  if (!Number.isInteger(rawScore)) {
    throw new Error(`最終持ち点は整数で入力してください: ${usesDefaultRank ? parts[1] : parts[2]}`);
  }

  return {
    userRef,
    userId: userIdFromRef(userRef) ?? undefined,
    rank,
    rawScore
  };
}

export function validatePlayers(type: MahjongType, players: PlayerInput[]): void {
  const expected = expectedPlayerCount(type);
  if (players.length !== expected) {
    throw new Error(`${type} は ${expected} 人分の入力が必要です。`);
  }

  const userIds = new Set(players.map((player) => player.userId));
  if (userIds.size !== players.length) {
    throw new Error("同一ユーザーが重複しています。");
  }

  const ranks = new Set(players.map((player) => player.rank));
  if (ranks.size !== players.length) {
    throw new Error("順位が重複しています。");
  }

  for (let rank = 1; rank <= expected; rank += 1) {
    if (!ranks.has(rank)) {
      throw new Error(`順位は 1 から ${expected} までを重複なく入力してください。`);
    }
  }
}
