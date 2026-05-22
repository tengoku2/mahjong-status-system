import { randomInt } from "node:crypto";

export type Tile = number;

export type ShantenFilter = "any" | "iishanten" | "ryanshanten";

export type HonorTileMode = "include" | "exclude";

export type Wind = "east" | "south" | "west" | "north";

export type NanikiruContext = {
  dora: Tile;
  turn: number;
  seatWind: Wind;
  roundWind: Wind;
};

export type NanikiruQuestion = {
  hand: Tile[];
  bestShanten: number;
  bestDiscardCount: number;
};

const TILE_COUNT = 34;
const MAX_GENERATION_ATTEMPTS = 5_000;
const RED_DORA_TILES: Tile[] = [4, 13, 22];
const winds: Wind[] = ["east", "south", "west", "north"];

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

export const windLabels: Record<Wind, string> = {
  east: "東",
  south: "南",
  west: "西",
  north: "北"
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

export function formatNanikiruContext(context: NanikiruContext): string {
  return `ドラ: ${tileLabel(context.dora)} / 赤ドラ: ${formatHand(RED_DORA_TILES)} / 巡目: ${context.turn}巡目 / 自風: ${windLabels[context.seatWind]} / 場風: ${windLabels[context.roundWind]}`;
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
    const evaluation = evaluateDiscardShanten(hand);
    const matchesFilter = targetShanten === null || evaluation.bestShanten === targetShanten;
    if (matchesFilter && evaluation.bestDiscardTiles.length >= 2) {
      return {
        hand: hand.sort(compareTiles),
        bestShanten: evaluation.bestShanten,
        bestDiscardCount: evaluation.bestDiscardTiles.length
      };
    }
  }

  throw new Error(`${shantenFilterLabels[filter]}の問題を生成できませんでした。もう一度実行してください。`);
}

export function createNanikiruQuestionFromHand(input: string): NanikiruQuestion {
  const hand = parseHandInput(input);
  const evaluation = evaluateDiscardShanten(hand);
  return {
    hand: hand.sort(compareTiles),
    bestShanten: evaluation.bestShanten,
    bestDiscardCount: evaluation.bestDiscardTiles.length
  };
}

export function createNanikiruContext(input: {
  dora?: string | null;
  turn?: number | null;
  seatWind?: string | null;
  roundWind?: string | null;
}): NanikiruContext {
  return {
    dora: input.dora ? parseTileInput(input.dora) : randomInt(TILE_COUNT),
    turn: input.turn ?? randomInt(4, 15),
    seatWind: parseWind(input.seatWind) ?? winds[randomInt(winds.length)],
    roundWind: parseWind(input.roundWind) ?? (randomInt(10) < 8 ? "east" : "south")
  };
}

export function parseTileInput(input: string): Tile {
  const hand = parseTileList(input);
  if (hand.length !== 1) {
    throw new Error("ドラは1枚だけ入力してください。例: 5s, 東");
  }
  return hand[0];
}

export function parseHandInput(input: string): Tile[] {
  const hand = parseTileList(input);

  if (hand.length !== 14) {
    throw new Error(`手牌は14枚で入力してください。現在は${hand.length}枚です。`);
  }

  toCounts(hand);
  return hand.sort(compareTiles);
}

export function bestShantenAfterDiscard(hand: Tile[]): number {
  return evaluateDiscardShanten(hand).bestShanten;
}

export function evaluateDiscardShanten(hand: Tile[]): { bestShanten: number; bestDiscardTiles: Tile[] } {
  if (hand.length !== 14) {
    throw new Error("何切るの手牌は14枚である必要があります。");
  }

  const results = uniqueDiscardTiles(hand).map((tile) => {
    const afterDiscard = removeOneTile(hand, tile);
    return {
      tile,
      shanten: calculateShanten(afterDiscard)
    };
  });
  const bestShanten = Math.min(...results.map((result) => result.shanten));

  return {
    bestShanten,
    bestDiscardTiles: results.filter((result) => result.shanten === bestShanten).map((result) => result.tile)
  };
}

function parseTileList(input: string): Tile[] {
  const normalized = input.replace(/\s+/g, "").replace(/萬/g, "m").replace(/筒/g, "p").replace(/索/g, "s");
  const hand: Tile[] = [];
  let digits = "";

  for (const char of normalized) {
    if (/^[1-9]$/.test(char)) {
      digits += char;
      continue;
    }

    if (char === "m" || char === "p" || char === "s") {
      if (!digits) {
        throw new Error("数牌は `123m` のように数字の後に m/p/s を付けて入力してください。");
      }
      const offset = char === "m" ? 0 : char === "p" ? 9 : 18;
      for (const digit of digits) {
        hand.push(offset + Number(digit) - 1);
      }
      digits = "";
      continue;
    }

    const honorTile = parseHonorTile(char);
    if (honorTile !== null) {
      if (digits) {
        throw new Error("字牌の前に未指定の数字があります。数牌は `123m` のように入力してください。");
      }
      hand.push(honorTile);
      continue;
    }

    throw new Error(`未対応の牌表記です: ${char}`);
  }

  if (digits) {
    throw new Error("数牌は `123m` のように数字の後に m/p/s を付けて入力してください。");
  }
  return hand;
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

function parseWind(value: string | null | undefined): Wind | null {
  if (value === "east" || value === "south" || value === "west" || value === "north") {
    return value;
  }
  return null;
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

function parseHonorTile(char: string): Tile | null {
  const honors: Record<string, Tile> = {
    東: 27,
    南: 28,
    西: 29,
    北: 30,
    白: 31,
    發: 32,
    発: 32,
    中: 33
  };
  return honors[char] ?? null;
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
