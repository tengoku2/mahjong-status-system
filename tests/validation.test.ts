import { describe, expect, it } from "vitest";
import { parseMahjongType, parsePlayerLine, validatePlayers } from "../src/validation.js";

describe("validation", () => {
  it("parses mahjong types", () => {
    expect(parseMahjongType("4p")).toBe("4p");
    expect(parseMahjongType("4人")).toBe("4p");
    expect(parseMahjongType("3p")).toBe("3p");
    expect(parseMahjongType("3人")).toBe("3p");
    expect(parseMahjongType("4p_east")).toBe("4p_east");
    expect(parseMahjongType("4人東風")).toBe("4p_east");
    expect(parseMahjongType("3p_east")).toBe("3p_east");
    expect(parseMahjongType("3人東風")).toBe("3p_east");
  });

  it("parses player lines with explicit ranks", () => {
    expect(parsePlayerLine("<@123456789012345678> 1 42000")).toEqual({
      userRef: "<@123456789012345678>",
      userId: "123456789012345678",
      rank: 1,
      rawScore: 42000
    });
    expect(parsePlayerLine("123456789012345678 2 -1000")).toEqual({
      userRef: "123456789012345678",
      userId: "123456789012345678",
      rank: 2,
      rawScore: -1000
    });
  });

  it("parses player lines with default rank from modal position", () => {
    expect(parsePlayerLine("@mdxu 39400", 1)).toEqual({
      userRef: "@mdxu",
      userId: undefined,
      rank: 1,
      rawScore: 39400
    });
    expect(parsePlayerLine("tengoku_ 39400", 2)).toEqual({
      userRef: "tengoku_",
      userId: undefined,
      rank: 2,
      rawScore: 39400
    });
  });

  it("validates duplicate users and ranks", () => {
    expect(() =>
      validatePlayers("3p", [
        { userId: "1", rank: 1, rawScore: 50000 },
        { userId: "1", rank: 2, rawScore: 35000 },
        { userId: "3", rank: 3, rawScore: 20000 }
      ])
    ).toThrow("同一ユーザー");

    expect(() =>
      validatePlayers("3p", [
        { userId: "1", rank: 1, rawScore: 50000 },
        { userId: "2", rank: 1, rawScore: 35000 },
        { userId: "3", rank: 3, rawScore: 20000 }
      ])
    ).toThrow("順位");
  });
});
