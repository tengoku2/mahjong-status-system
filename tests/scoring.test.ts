import { describe, expect, it } from "vitest";
import { TieBreakType } from "@prisma/client";
import { calculatePoint, calculateResults, calculateResultsWithRuleSet, expectedPlayerCount, isEastGame, normalizeMahjongType } from "../src/scoring.js";

describe("scoring", () => {
  it("calculates 4p points with uma", () => {
    expect(calculatePoint("4p", 1, 42000)).toBe(62);
    expect(calculatePoint("4p", 2, 31000)).toBe(11);
    expect(calculatePoint("4p", 3, 25000)).toBe(-15);
    expect(calculatePoint("4p", 4, 2000)).toBe(-58);
  });

  it("calculates 3p points with uma", () => {
    expect(calculatePoint("3p", 1, 50000)).toBe(20);
    expect(calculatePoint("3p", 2, 35000)).toBe(0);
    expect(calculatePoint("3p", 3, 20000)).toBe(-35);
  });

  it("calculates east games as separate types with the same point rules", () => {
    expect(calculatePoint("4p_east", 1, 42000)).toBe(42);
    expect(calculatePoint("4p_east", 4, 2000)).toBe(-48);
    expect(calculatePoint("3p_east", 1, 50000)).toBe(25);
    expect(calculatePoint("3p_east", 3, 20000)).toBe(-25);
  });

  it("normalizes legacy and alias type values before scoring", () => {
    expect(normalizeMahjongType("4")).toBe("4p");
    expect(normalizeMahjongType("3")).toBe("3p");
    expect(normalizeMahjongType("4p_tonpu")).toBe("4p_east");
    expect(calculatePoint("4", 1, 42000)).toBe(62);
  });

  it("keeps calculated result fields", () => {
    expect(
      calculateResults("3p", [
        { userId: "1", rank: 1, rawScore: 50000 },
        { userId: "2", rank: 2, rawScore: 35000 },
        { userId: "3", rank: 3, rawScore: 20000 }
      ])
    ).toEqual([
      { userId: "1", rank: 1, rawScore: 50000, point: 20 },
      { userId: "2", rank: 2, rawScore: 35000, point: 0 },
      { userId: "3", rank: 3, rawScore: 20000, point: -35 }
    ]);
  });

  it("calculates points from a RuleSet for mjs v2 registrations", () => {
    expect(
      calculateResultsWithRuleSet(
        {
          returnScore: 35000,
          uma: [15, 0, -15],
          tieBreakType: TieBreakType.SEAT_ORDER
        },
        [
          { userId: "1", rank: 1, rawScore: 50000 },
          { userId: "2", rank: 2, rawScore: 35000 },
          { userId: "3", rank: 3, rawScore: 20000 }
        ]
      )
    ).toEqual([
      { userId: "1", rank: 1, rawScore: 50000, point: 30 },
      { userId: "2", rank: 2, rawScore: 35000, point: 0 },
      { userId: "3", rank: 3, rawScore: 20000, point: -30 }
    ]);
  });

  it("splits uma for tied raw scores when the RuleSet requires it", () => {
    expect(
      calculateResultsWithRuleSet(
        {
          returnScore: 30000,
          uma: [50, 10, -10, -30],
          tieBreakType: TieBreakType.SPLIT_UMA
        },
        [
          { userId: "1", rank: 1, rawScore: 35000 },
          { userId: "2", rank: 2, rawScore: 35000 },
          { userId: "3", rank: 3, rawScore: 20000 },
          { userId: "4", rank: 4, rawScore: 10000 }
        ]
      )
    ).toEqual([
      { userId: "1", rank: 1, rawScore: 35000, point: 35 },
      { userId: "2", rank: 2, rawScore: 35000, point: 35 },
      { userId: "3", rank: 3, rawScore: 20000, point: -20 },
      { userId: "4", rank: 4, rawScore: 10000, point: -50 }
    ]);
  });

  it("returns expected player counts", () => {
    expect(expectedPlayerCount("4p")).toBe(4);
    expect(expectedPlayerCount("3p")).toBe(3);
    expect(expectedPlayerCount("4p_east")).toBe(4);
    expect(expectedPlayerCount("3p_east")).toBe(3);
  });

  it("identifies east games", () => {
    expect(isEastGame("4p")).toBe(false);
    expect(isEastGame("4p_east")).toBe(true);
  });
});
