import { describe, expect, it } from "vitest";
import {
  bestShantenAfterDiscard,
  calculateShanten,
  createNanikiruContext,
  createNanikiruQuestionFromHand,
  evaluateDiscardShanten,
  formatNanikiruContext,
  formatHand,
  generateNanikiruQuestion,
  parseHandInput,
  parseHonorTileMode,
  parseTileInput,
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
    expect(formatHand([33, 0, 1, 9, 18])).toBe("12m 1p 1s 中");
    expect(formatHand([0, 1, 9, 10, 18, 19, 27, 28])).toBe("12m 12p 12s 東南");
  });

  it("parses honor tile modes", () => {
    expect(parseHonorTileMode(null)).toBe("include");
    expect(parseHonorTileMode("include")).toBe("include");
    expect(parseHonorTileMode("exclude")).toBe("exclude");
  });

  it("deduplicates discard choices", () => {
    expect(uniqueDiscardTiles([0, 0, 1, 9, 9, 27])).toEqual([0, 1, 9, 27]);
  });

  it("parses manual hand input", () => {
    expect(formatHand(parseHandInput("123m456p3566s東南白中"))).toBe("123m 456p 3566s 東南白中");
    expect(formatHand(parseHandInput("123萬456筒3566索東南白中"))).toBe("123m 456p 3566s 東南白中");
    expect(formatHand(parseHandInput("123m 456p 3566s 東南白中"))).toBe("123m 456p 3566s 東南白中");
  });

  it("parses single tile input for dora", () => {
    expect(parseTileInput("5s")).toBe(22);
    expect(parseTileInput("東")).toBe(27);
    expect(() => parseTileInput("55s")).toThrow("1枚");
  });

  it("formats nanikiru context", () => {
    expect(formatNanikiruContext({ dora: 22, turn: 8, seatWind: "south", roundWind: "east" })).toBe(
      "ドラ: 5s / 赤ドラ: 5m 5p 5s / 巡目: 8巡目 / 自風: 南 / 場風: 東"
    );
  });

  it("creates nanikiru context with overrides", () => {
    expect(createNanikiruContext({ dora: "東", turn: 9, seatWind: "west", roundWind: "south" })).toEqual({
      dora: 27,
      turn: 9,
      seatWind: "west",
      roundWind: "south"
    });
  });

  it("rejects invalid manual hand input", () => {
    expect(() => parseHandInput("123m456p356s東南")).toThrow("14枚");
    expect(() => parseHandInput("11111m234p3566s東南")).toThrow("5枚以上");
    expect(() => parseHandInput("123m456p3566s東南白中12")).toThrow("数字の後に m/p/s");
  });

  it("calculates shanten for complete-adjacent 13 tile hands", () => {
    expect(calculateShanten([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 27])).toBe(0);
    expect(calculateShanten([0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 27, 28])).toBe(1);
  });

  it("calculates best shanten after discard from a 14 tile hand", () => {
    const hand = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 27, 28];
    expect(bestShantenAfterDiscard(hand)).toBe(0);
  });

  it("returns best discard candidates", () => {
    const evaluation = evaluateDiscardShanten([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 27, 28]);
    expect(evaluation.bestShanten).toBe(0);
    expect(evaluation.bestDiscardTiles.length).toBeGreaterThanOrEqual(1);
  });

  it("creates a manual nanikiru question", () => {
    const question = createNanikiruQuestionFromHand("123m456p3566s東南白中");
    expect(formatHand(question.hand)).toBe("123m 456p 3566s 東南白中");
    expect(question.bestShanten).toBeGreaterThanOrEqual(0);
    expect(question.bestDiscardCount).toBeGreaterThanOrEqual(1);
  });

  it("generates filtered hands", () => {
    const question = generateNanikiruQuestion("iishanten");
    expect(question.hand).toHaveLength(14);
    expect(question.bestShanten).toBe(1);
    expect(question.bestDiscardCount).toBeGreaterThanOrEqual(2);
  });

  it("generates hands without honor tiles", () => {
    const question = generateNanikiruQuestion("any", "exclude");
    expect(question.hand).toHaveLength(14);
    expect(question.hand.every((tile) => tile < 27)).toBe(true);
  });
});
