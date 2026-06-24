import { describe, expect, test } from "vitest";

import { applyAdjustmentsToRankingEntries, buildAdjustmentMap, type RankingEntry } from "../src/services.js";

function entry(userId: string, totalPoint: number, games = 2): RankingEntry {
  return {
    userId,
    games,
    totalPoint,
    rankSum: 5,
    averageRank: 2.5,
    averagePoint: totalPoint / games
  };
}

describe("adjustments", () => {
  test("builds summed adjustment points by user", () => {
    const adjustments = buildAdjustmentMap([
      { userId: "a", amount: 10 },
      { userId: "a", amount: -3.5 },
      { userId: "b", amount: 2 }
    ]);

    expect(adjustments.get("a")).toBe(6.5);
    expect(adjustments.get("b")).toBe(2);
  });

  test("applies adjustments to ranking entries and resorts", () => {
    const adjusted = applyAdjustmentsToRankingEntries(
      [entry("a", 10), entry("b", 12)],
      new Map([
        ["a", 5],
        ["b", -3]
      ])
    );

    expect(adjusted.map((item) => item.userId)).toEqual(["a", "b"]);
    expect(adjusted[0]).toMatchObject({
      userId: "a",
      totalPoint: 15,
      averagePoint: 7.5
    });
    expect(adjusted[1]).toMatchObject({
      userId: "b",
      totalPoint: 9,
      averagePoint: 4.5
    });
  });
});
