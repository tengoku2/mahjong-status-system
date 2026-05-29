import { describe, expect, it } from "vitest";
import { buildMvpRankingFromResults } from "../src/services.js";

describe("season bonuses", () => {
  it("adds season bonuses before MVP penalty calculation", () => {
    const results = [
      { userId: "a", rank: 1, point: 40, match: { type: "4p", matchId: "m1" } },
      { userId: "a", rank: 2, point: 0, match: { type: "4p", matchId: "m2" } },
      { userId: "a", rank: 1, point: 40, match: { type: "4p", matchId: "m3" } },
      { userId: "a", rank: 2, point: 0, match: { type: "4p", matchId: "m4" } },
      { userId: "a", rank: 1, point: 40, match: { type: "4p", matchId: "m5" } },
      { userId: "b", rank: 1, point: 30, match: { type: "4p", matchId: "m1" } },
      { userId: "b", rank: 2, point: 0, match: { type: "4p", matchId: "m2" } },
      { userId: "b", rank: 1, point: 30, match: { type: "4p", matchId: "m3" } },
      { userId: "b", rank: 2, point: 0, match: { type: "4p", matchId: "m4" } },
      { userId: "b", rank: 1, point: 30, match: { type: "4p", matchId: "m5" } }
    ] as any;

    const ranking = buildMvpRankingFromResults(results, new Map([["b", 40]]));

    expect(ranking[0].userId).toBe("b");
    expect(ranking[0].rawTotalPoint).toBe(130);
    expect(ranking[0].penaltyPoint).toBe(35);
    expect(ranking[0].totalPoint).toBe(95);
  });
});
