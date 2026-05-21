import { randomInt } from "node:crypto";

export type Tile = number;

export type ShantenFilter = "any" | "iishanten" | "ryanshanten";

export type HonorTileMode = "include" | "exclude";

export type NanikiruQuestion = {
  hand: Tile[];
  bestShanten: number;
};

const TILE_COUNT = 34;
const MAX_GENERATION_ATTEMPTS = 5_000;

const terminalAndHonorTiles = new Set<Tile>([0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33]);

export const shantenFilterLabels: Record<ShantenFilter, string> = {
  any: "指定なし",
  iishanten: "一向聴",
  ryanshanten: "二向聴"
};

export const honorTileModeLabels: Record<HonorTileMode, string> = {
  include: "字牌あり",
  exclude: "字牌なし"
};

export function parseShantenFilter(value: string | null): ShantenFilter {
  if (value === "iishanten" || value === "ryanshanten") {
    return value;
  }
  return "any";
}

export function parseHonorTileMode(value: string | null): HonorTileMode {
  return value === "exclude" ? "exclude" : "include";
}

export function tileLabel(tile: Tile): string {
  if (tile >= 0 && tile <= 8) {
    return `${(tile % 9) + 1}m`;
  }
  if (tile >= 9 && tile <= 17) {
    return `${(tile % 9) + 1}p`;
  }
  if (tile >= 18 && tile <= 26) {
    return `${(tile % 9) + 1}s`;
  }
  const honors = ["東", "南", "西", "北", "白", "發", "中"];
  return honors[tile - 27] ?? "?";
}

export function formatHand(hand: Tile[]): string {
  const sorted = [...hand].sort(compareTiles);
  const suitParts = [formatSuit(sorted, 0, "m"), formatSuit(sorted, 9, "p"), formatSuit(sorted, 18, "s")].filter(Boolean);
  const honors = sorted.filter(isHonorTile).map(tileLabel).join("");
  return [...suitParts, honors].filter(Boolean).join(" ");
}

export function uniqueDiscardTiles(hand: Tile[]): Tile[] {
  return [...new Set(hand)].sort(compareTiles);
}

export function compareTiles(a: Tile, b: Tile): number {
  return a - b;
}

export function generateNanikiruQuestion(filter: ShantenFilter = "any", honorTileMode: HonorTileMode = "include"): NanikiruQuestion {
  const targetShanten = filterToShanten(filter);

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const hand = drawRandomHand(honorTileMode);
    const bestShanten = bestShantenAfterDiscard(hand);
    if (targetShanten === null || bestShanten === targetShanten) {
      return {
        hand: hand.sort(compareTiles),
        bestShanten
      };
    }
  }

  throw new Error(`${shantenFilterLabels[filter]}の問題を生成できませんでした。もう一度実行してください。`);
}

export function bestShantenAfterDiscard(hand: Tile[]): number {
  if (hand.length !== 14) {
    throw new Error("何切るの手牌は14枚である必要があります。");
  }

  return Math.min(
    ...uniqueDiscardTiles(hand).map((tile) => {
      const afterDiscard = removeOneTile(hand, tile);
      return calculateShanten(afterDiscard);
    })
  );
}

export function calculateShanten(hand: Tile[]): number {
  if (hand.length % 3 !== 1) {
    throw new Error("向聴数は3n+1枚の手牌で計算してください。");
  }

  const counts = toCounts(hand);
  return Math.min(calculateStandardShanten(counts), calculateChiitoiShanten(counts), calculateKokushiShanten(counts));
}

function filterToShanten(filter: ShantenFilter): number | null {
  if (filter === "iishanten") {
    return 1;
  }
  if (filter === "ryanshanten") {
    return 2;
  }
  return null;
}

function drawRandomHand(honorTileMode: HonorTileMode): Tile[] {
  const tileTypes = Array.from({ length: honorTileMode === "exclude" ? 27 : TILE_COUNT }, (_, tile) => tile);
  const wall = tileTypes.flatMap((tile) => [tile, tile, tile, tile]);
  const hand: Tile[] = [];

  for (let i = 0; i < 14; i += 1) {
    const index = randomInt(wall.length);
    const [tile] = wall.splice(index, 1);
    hand.push(tile);
  }

  return hand;
}

function formatSuit(sortedHand: Tile[], offset: number, suffix: "m" | "p" | "s"): string {
  const digits = sortedHand
    .filter((tile) => tile >= offset && tile < offset + 9)
    .map((tile) => `${tile - offset + 1}`)
    .join("");
  return digits ? `${digits}${suffix}` : "";
}

function isHonorTile(tile: Tile): boolean {
  return tile >= 27;
}

function removeOneTile(hand: Tile[], tile: Tile): Tile[] {
  const result = [...hand];
  const index = result.indexOf(tile);
  if (index === -1) {
    throw new Error(`手牌に ${tileLabel(tile)} がありません。`);
  }
  result.splice(index, 1);
  return result;
}

function toCounts(hand: Tile[]): number[] {
  const counts = Array<number>(TILE_COUNT).fill(0);
  for (const tile of hand) {
    if (!Number.isInteger(tile) || tile < 0 || tile >= TILE_COUNT) {
      throw new Error(`不正な牌です: ${tile}`);
    }
    counts[tile] += 1;
    if (counts[tile] > 4) {
      throw new Error(`同じ牌が5枚以上あります: ${tileLabel(tile)}`);
    }
  }
  return counts;
}

function calculateStandardShanten(counts: number[]): number {
  let minShanten = calculateStandardShantenWithPair(counts, false);

  for (let tile = 0; tile < TILE_COUNT; tile += 1) {
    if (counts[tile] >= 2) {
      counts[tile] -= 2;
      minShanten = Math.min(minShanten, calculateStandardShantenWithPair(counts, true));
      counts[tile] += 2;
    }
  }

  return minShanten;
}

function calculateStandardShantenWithPair(counts: number[], hasPair: boolean): number {
  let minShanten = 8;

  function search(start: number, melds: number, taatsu: number) {
    if (melds > 4 || taatsu > 4) {
      return;
    }

    let tile = start;
    while (tile < TILE_COUNT && counts[tile] === 0) {
      tile += 1;
    }

    if (tile >= TILE_COUNT) {
      const usableTaatsu = Math.min(taatsu, 4 - melds);
      minShanten = Math.min(minShanten, 8 - melds * 2 - usableTaatsu - (hasPair ? 1 : 0));
      return;
    }

    if (counts[tile] >= 3) {
      counts[tile] -= 3;
      search(tile, melds + 1, taatsu);
      counts[tile] += 3;
    }

    if (canTakeSequence(counts, tile)) {
      counts[tile] -= 1;
      counts[tile + 1] -= 1;
      counts[tile + 2] -= 1;
      search(tile, melds + 1, taatsu);
      counts[tile] += 1;
      counts[tile + 1] += 1;
      counts[tile + 2] += 1;
    }

    if (counts[tile] >= 2) {
      counts[tile] -= 2;
      search(tile, melds, taatsu + 1);
      counts[tile] += 2;
    }

    for (const offset of [1, 2] as const) {
      if (canTakeSequenceWait(counts, tile, offset)) {
        counts[tile] -= 1;
        counts[tile + offset] -= 1;
        search(tile, melds, taatsu + 1);
        counts[tile] += 1;
        counts[tile + offset] += 1;
      }
    }

    counts[tile] -= 1;
    search(tile, melds, taatsu);
    counts[tile] += 1;
  }

  search(0, 0, 0);
  return minShanten;
}

function canTakeSequence(counts: number[], tile: Tile): boolean {
  return tile < 27 && tile % 9 <= 6 && counts[tile] > 0 && counts[tile + 1] > 0 && counts[tile + 2] > 0;
}

function canTakeSequenceWait(counts: number[], tile: Tile, offset: 1 | 2): boolean {
  return tile < 27 && tile % 9 <= 8 - offset && counts[tile] > 0 && counts[tile + offset] > 0;
}

function calculateChiitoiShanten(counts: number[]): number {
  const pairs = counts.filter((count) => count >= 2).length;
  const uniqueTiles = counts.filter((count) => count > 0).length;
  return 6 - pairs + Math.max(0, 7 - uniqueTiles);
}

function calculateKokushiShanten(counts: number[]): number {
  let uniqueTerminalsAndHonors = 0;
  let hasPair = false;

  for (const tile of terminalAndHonorTiles) {
    if (counts[tile] > 0) {
      uniqueTerminalsAndHonors += 1;
    }
    if (counts[tile] >= 2) {
      hasPair = true;
    }
  }

  return 13 - uniqueTerminalsAndHonors - (hasPair ? 1 : 0);
}
