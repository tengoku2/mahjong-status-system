import { describe, expect, it } from "vitest";
import { calculateSeasonAwards } from "../src/awards.js";
import type { RecordInput } from "../src/records.js";

function result(matchId: string, day: number, userId: string, rank: number, rawScore: number, point: number): RecordInput {
  return {
    userId,
    rank,
    rawScore,
    point,
    match: {
      matchId,
      playedAt: new Date(2026, 2, day, 12, 0, 0)
    }
  };
}

describe("awards", () => {
  it("breaks mvp ties by head-to-head average rank", () => {
    const awards = calculateSeasonAwards(
      [
        result("m1", 1, "a", 1, 40000, 30),
        result("m1", 1, "b", 2, 35000, 0),
        result("m1", 1, "c", 3, 30000, -30),
        result("m2", 2, "b", 1, 40000, 30),
        result("m2", 2, "a", 2, 35000, 0),
        result("m2", 2, "c", 3, 30000, -30),
        result("m3", 3, "a", 1, 41000, 31),
        result("m3", 3, "b", 2, 34000, -1),
        result("m3", 3, "c", 3, 30000, -30),
        result("m4", 4, "b", 1, 41000, 31),
        result("m4", 4, "a", 2, 34000, -1),
        result("m4", 4, "c", 3, 30000, -30),
        result("m5", 5, "a", 1, 42000, 32),
        result("m5", 5, "b", 2, 33000, -2),
        result("m5", 5, "c", 3, 30000, -30),
        result("m6", 6, "a", 1, 43000, 33),
        result("m6", 6, "d", 2, 32000, -3),
        result("m6", 6, "c", 3, 30000, -30),
        result("m7", 7, "b", 1, 43000, 33),
        result("m7", 7, "d", 2, 32000, -3),
        result("m7", 7, "c", 3, 30000, -30)
      ],
      5
    );

    expect(awards.mvp).toEqual([{ userId: "a", value: 125 }]);
  });

  it("allows tied mvp when head-to-head is still tied", () => {
    const awards = calculateSeasonAwards(
      [
        result("m1", 1, "a", 1, 40000, 30),
        result("m1", 1, "b", 2, 35000, 0),
        result("m1", 1, "c", 3, 30000, -30),
        result("m2", 2, "b", 1, 40000, 30),
        result("m2", 2, "a", 2, 35000, 0),
        result("m2", 2, "c", 3, 30000, -30),
        result("m3", 3, "a", 1, 40000, 30),
        result("m3", 3, "b", 2, 35000, 0),
        result("m3", 3, "c", 3, 30000, -30),
        result("m4", 4, "b", 1, 40000, 30),
        result("m4", 4, "a", 2, 35000, 0),
        result("m4", 4, "c", 3, 30000, -30),
        result("m5", 5, "a", 1, 40000, 30),
        result("m5", 5, "d", 2, 35000, 0),
        result("m5", 5, "c", 3, 30000, -30),
        result("m6", 6, "b", 1, 40000, 30),
        result("m6", 6, "d", 2, 35000, 0),
        result("m6", 6, "c", 3, 30000, -30)
      ],
      5
    );

    expect(awards.mvp).toEqual([
      { userId: "a", value: 90 },
      { userId: "b", value: 90 }
    ]);
  });
});
