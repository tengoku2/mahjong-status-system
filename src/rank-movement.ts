export interface RankingEntryLike {
  userId: string;
}

export type RankMovement = "up_far" | "up_near" | "same" | "down_near" | "down_far" | "new";

export function movementSymbol(movement: RankMovement): string {
  const symbols: Record<RankMovement, string> = {
    up_far: "↑",
    up_near: "↗",
    same: "-",
    down_near: "↘",
    down_far: "↓",
    new: "NEW"
  };
  return symbols[movement];
}

export function calculateRankMovements<T extends RankingEntryLike>(
  current: T[],
  previous: T[],
  useNew = true
): Map<string, RankMovement> {
  const previousPositions = new Map(previous.map((entry, index) => [entry.userId, index + 1]));
  const everyoneIsNew = useNew && current.length > 0 && previous.length === 0;
  const movements = new Map<string, RankMovement>();

  for (const [index, entry] of current.entries()) {
    const currentRank = index + 1;
    const previousRank = previousPositions.get(entry.userId);

    if (previousRank === undefined) {
      movements.set(entry.userId, everyoneIsNew ? "same" : "new");
      continue;
    }

    const diff = previousRank - currentRank;
    if (diff >= 2) {
      movements.set(entry.userId, "up_far");
    } else if (diff === 1) {
      movements.set(entry.userId, "up_near");
    } else if (diff === 0) {
      movements.set(entry.userId, "same");
    } else if (diff === -1) {
      movements.set(entry.userId, "down_near");
    } else {
      movements.set(entry.userId, "down_far");
    }
  }

  return movements;
}
