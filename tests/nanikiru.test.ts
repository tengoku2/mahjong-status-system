import { describe, expect, it } from "vitest";
import {
  bestShantenAfterDiscard,
  calculateShanten,
  formatHand,
  generateNanikiruQuestion,
  tileLabel,
  uniqueDiscardTiles
} from "../src/nanikiru.js";

describe("nanikiru", () => {
  it("formats tiles and hands", () => {
    expect(tileLabel(0)).toBe("1m");
    expect(tileLabel(8)).toBe("9m");
    expect(tileLabel(17)).toBe("9p");
    expect(tileLabel(26)).toBe("9s");
    expect(tileLabel(27)).toBe("東");
    expect(tileLabel(33)).toBe("中");
    expect(formatHand([33, 0, 9, 18])).toBe("1m 1p 1s 中");
  });

  it("deduplicates discard choices", () => {
    expect(uniqueDiscardTiles([0, 0, 1, 9, 9, 27])).toEqual([0, 1, 9, 27]);
  });

  it("calculates shanten for complete-adjacent 13 tile hands", () => {
    expect(calculateShanten([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 27])).toBe(0);
    expect(calculateShanten([0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 27, 28])).toBe(1);
  });

  it("calculates best shanten after discard from a 14 tile hand", () => {
    const hand = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 27, 28];
    expect(bestShantenAfterDiscard(hand)).toBe(0);
  });

  it("generates filtered hands", () => {
    const question = generateNanikiruQuestion("iishanten");
    expect(question.hand).toHaveLength(14);
    expect(question.bestShanten).toBe(1);
  });
});
