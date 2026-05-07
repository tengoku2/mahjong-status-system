import { describe, expect, it } from "vitest";
import { calculatePoint, calculateResults, expectedPlayerCount } from "../src/scoring.js";

describe("scoring", () => {
  it("calculates 4p points with uma", () => {
    expect(calculatePoint("4p", 1, 42000)).toBe(62);
    expect(calculatePoint("4p", 2, 31000)).toBe(11);
    expect(calculatePoint("4p", 3, 25000)).toBe(-15);
    expect(calculatePoint("4p", 4, 2000)).toBe(-58);
  });

  it("calculates 3p points with uma", () => {
    expect(calculatePoint("3p", 1, 50000)).toBe(30);
    expect(calculatePoint("3p", 2, 35000)).toBe(0);
    expect(calculatePoint("3p", 3, 20000)).toBe(-30);
  });

  it("keeps calculated result fields", () => {
    expect(
      calculateResults("3p", [
        { userId: "1", rank: 1, rawScore: 50000 },
        { userId: "2", rank: 2, rawScore: 35000 },
        { userId: "3", rank: 3, rawScore: 20000 }
      ])
    ).toEqual([
      { userId: "1", rank: 1, rawScore: 50000, point: 30 },
      { userId: "2", rank: 2, rawScore: 35000, point: 0 },
      { userId: "3", rank: 3, rawScore: 20000, point: -30 }
    ]);
  });

  it("returns expected player counts", () => {
    expect(expectedPlayerCount("4p")).toBe(4);
    expect(expectedPlayerCount("3p")).toBe(3);
  });
});
