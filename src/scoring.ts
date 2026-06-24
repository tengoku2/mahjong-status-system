import { TieBreakType, type RuleSet } from "@prisma/client";
import type { CalculatedResult, MahjongType, PlayerInput } from "./types.js";

const rules = {
  "4p": {
    returnScore: 30000,
    uma: new Map([
      [1, 50],
      [2, 10],
      [3, -10],
      [4, -30]
    ])
  },
  "4p_east": {
    returnScore: 30000,
    uma: new Map([
      [1, 30],
      [2, 10],
      [3, -10],
      [4, -20]
    ])
  },
  "3p": {
    returnScore: 40000,
    uma: new Map([
      [1, 10],
      [2, 5],
      [3, -15]
    ])
  },
  "3p_east": {
    returnScore: 35000,
    uma: new Map([
      [1, 10],
      [2, 0],
      [3, -10]
    ])
  }
} as const;

export function normalizeMahjongType(type: string): MahjongType {
  const normalized = type.trim().toLowerCase();
  if (["4", "4p", "4h", "4p_hanchan", "四人", "4人", "4人半荘"].includes(normalized)) {
    return "4p";
  }
  if (["3", "3p", "3h", "3p_hanchan", "三人", "3人", "3人半荘"].includes(normalized)) {
    return "3p";
  }
  if (["4e", "4p_east", "4east", "4p_tonpu", "四人東風", "4人東風", "東風4人"].includes(normalized)) {
    return "4p_east";
  }
  if (["3e", "3p_east", "3east", "3p_tonpu", "三人東風", "3人東風", "東風3人"].includes(normalized)) {
    return "3p_east";
  }
  throw new Error(`未対応の麻雀種別です: ${type}`);
}

export function calculatePoint(type: MahjongType | string, rank: number, rawScore: number): number {
  const normalizedType = normalizeMahjongType(type);
  const rule = rules[normalizedType];
  const uma = rule.uma.get(rank);
  if (uma === undefined) {
    throw new Error(`${normalizedType} does not allow rank ${rank}`);
  }

  return (rawScore - rule.returnScore) / 1000 + uma;
}

export function calculateResults(type: MahjongType | string, players: PlayerInput[]): CalculatedResult[] {
  return players.map((player) => ({
    ...player,
    point: calculatePoint(type, player.rank, player.rawScore)
  }));
}

export function calculateResultsWithRuleSet(ruleSet: Pick<RuleSet, "returnScore" | "tieBreakType" | "uma">, players: PlayerInput[]): CalculatedResult[] {
  const uma = parseUma(ruleSet.uma);
  const tiedRanksByRawScore = new Map<number, number[]>();

  if (ruleSet.tieBreakType === TieBreakType.SPLIT_UMA) {
    for (const player of players) {
      const ranks = tiedRanksByRawScore.get(player.rawScore) ?? [];
      ranks.push(player.rank);
      tiedRanksByRawScore.set(player.rawScore, ranks);
    }
  }

  return players.map((player) => {
    const rankUma =
      ruleSet.tieBreakType === TieBreakType.SPLIT_UMA
        ? averageUmaForRanks(uma, tiedRanksByRawScore.get(player.rawScore) ?? [player.rank])
        : umaForRank(uma, player.rank);

    return {
      ...player,
      point: (player.rawScore - ruleSet.returnScore) / 1000 + rankUma
    };
  });
}

export function expectedPlayerCount(type: MahjongType | string): number {
  return normalizeMahjongType(type).startsWith("4p") ? 4 : 3;
}

export function isEastGame(type: MahjongType | string): boolean {
  return normalizeMahjongType(type).endsWith("_east");
}

function parseUma(value: unknown): number[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "number")) {
    throw new Error("RuleSetのウマ設定が不正です。");
  }
  return value;
}

function umaForRank(uma: number[], rank: number): number {
  const value = uma[rank - 1];
  if (value === undefined) {
    throw new Error(`RuleSet does not allow rank ${rank}`);
  }
  return value;
}

function averageUmaForRanks(uma: number[], ranks: number[]): number {
  return ranks.reduce((total, rank) => total + umaForRank(uma, rank), 0) / ranks.length;
}
