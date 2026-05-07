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
  "3p": {
    returnScore: 35000,
    uma: new Map([
      [1, 15],
      [2, 0],
      [3, -15]
    ])
  }
} as const;

export function calculatePoint(type: MahjongType, rank: number, rawScore: number): number {
  const rule = rules[type];
  const uma = rule.uma.get(rank);
  if (uma === undefined) {
    throw new Error(`${type} does not allow rank ${rank}`);
  }

  return (rawScore - rule.returnScore) / 1000 + uma;
}

export function calculateResults(type: MahjongType, players: PlayerInput[]): CalculatedResult[] {
  return players.map((player) => ({
    ...player,
    point: calculatePoint(type, player.rank, player.rawScore)
  }));
}

export function expectedPlayerCount(type: MahjongType): number {
  return type === "4p" ? 4 : 3;
}
