import { describe, expect, it } from "vitest";
import { calculateRecords, type RecordInput } from "../src/records.js";

function result(matchId: string, day: number, userId: string, rank: number, rawScore: number, point: number): RecordInput {
  return {
    userId,
    rank,
    rawScore,
    point,
    match: {
      matchId,
      playedAt: new Date(2026, 4, day, 12, 0, 0)
    }
  };
}

describe("records", () => {
  it("calculates match and player records from stored results", () => {
    const records = calculateRecords(
      "4p",
      [
        result("m1", 1, "a", 1, 42000, 62),
        result("m1", 1, "b", 2, 31000, 11),
        result("m1", 1, "c", 3, 25000, -15),
        result("m1", 1, "d", 4, 2000, -58),
        result("m2", 2, "a", 1, 50000, 70),
        result("m2", 2, "b", 2, 20000, -10),
        result("m2", 2, "c", 3, 18000, -22),
        result("m2", 2, "d", 4, 12000, -38),
        result("m3", 3, "b", 1, 43000, 63),
        result("m3", 3, "a", 2, 32000, 12),
        result("m3", 3, "c", 3, 21000, -19),
        result("m3", 3, "d", 4, 4000, -56)
      ],
      2
    );

    expect(records.totalMatches).toBe(3);
    expect(records.highestRawScore).toMatchObject([{ userId: "a", value: 50000, matchId: "m2" }]);
    expect(records.highestPoint).toMatchObject([{ userId: "a", value: 70, matchId: "m2" }]);
    expect(records.largestRawScoreWinMargin).toMatchObject([{ userId: "a", secondUserId: "b", value: 30000, matchId: "m2" }]);
    expect(records.largestPointWinMargin).toMatchObject([{ userId: "a", secondUserId: "b", value: 80, matchId: "m2" }]);
    expect(records.mostTops).toEqual([{ userId: "a", value: 2 }]);
    expect(records.bestAverageRank).toEqual([{ userId: "a", value: 4 / 3 }]);
    expect(records.longestTopStreak).toEqual([{ userId: "a", value: 2 }]);
    expect(records.longestNoLastStreak).toEqual([
      { userId: "a", value: 3 },
      { userId: "b", value: 3 },
      { userId: "c", value: 3 }
    ]);
  });

  it("requires enough games for average rank records", () => {
    const records = calculateRecords("3p", [result("m1", 1, "a", 1, 50000, 30)], 2);

    expect(records.bestAverageRank).toEqual([]);
  });

  it("keeps tied records", () => {
    const records = calculateRecords(
      "3p",
      [
        result("m1", 1, "a", 1, 50000, 30),
        result("m1", 1, "b", 2, 35000, 0),
        result("m1", 1, "c", 3, 20000, -30),
        result("m2", 2, "b", 1, 50000, 30),
        result("m2", 2, "a", 2, 35000, 0),
        result("m2", 2, "c", 3, 20000, -30)
      ],
      1
    );

    expect(records.highestRawScore).toMatchObject([
      { userId: "a", value: 50000, matchId: "m1" },
      { userId: "b", value: 50000, matchId: "m2" }
    ]);
    expect(records.mostTops).toEqual([
      { userId: "a", value: 1 },
      { userId: "b", value: 1 }
    ]);
  });
});
