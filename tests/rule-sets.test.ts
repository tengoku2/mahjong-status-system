import { EventKind, GameType, RoundExtension, TieBreakType } from "@prisma/client";
import { describe, expect, test } from "vitest";

import { standardEvents, standardRuleSets } from "../src/rule-sets.js";
import { defaultEventNameForMahjongType, gameTypeForMahjongType } from "../src/events.js";

describe("standardRuleSets", () => {
  test("defines the initial mjs v2 rule sets", () => {
    expect(standardRuleSets.map((ruleSet) => ruleSet.name)).toEqual([
      "通常4人半荘",
      "通常3人半荘",
      "通常4人東風",
      "通常3人東風",
      "大会4人半荘"
    ]);
  });

  test("defines normal games as bust and agari-yame enabled", () => {
    const normalRuleSets = standardRuleSets.filter((ruleSet) => ruleSet.name.startsWith("通常"));

    expect(normalRuleSets).toHaveLength(4);
    expect(normalRuleSets.every((ruleSet) => ruleSet.allowBust)).toBe(true);
    expect(normalRuleSets.every((ruleSet) => ruleSet.bustThreshold === -1)).toBe(true);
    expect(normalRuleSets.every((ruleSet) => ruleSet.allowAgariYame)).toBe(true);
    expect(normalRuleSets.every((ruleSet) => ruleSet.tieBreakType === TieBreakType.SEAT_ORDER)).toBe(true);
  });

  test("separates hanchan and tonpu extensions", () => {
    expect(standardRuleSets.find((ruleSet) => ruleSet.name === "通常4人半荘")?.roundExtension).toBe(RoundExtension.WEST);
    expect(standardRuleSets.find((ruleSet) => ruleSet.name === "通常3人半荘")?.roundExtension).toBe(RoundExtension.WEST);
    expect(standardRuleSets.find((ruleSet) => ruleSet.name === "通常4人東風")?.roundExtension).toBe(RoundExtension.SOUTH);
    expect(standardRuleSets.find((ruleSet) => ruleSet.name === "通常3人東風")?.roundExtension).toBe(RoundExtension.SOUTH);
  });

  test("defines the agreed uma values", () => {
    expect(standardRuleSets.find((ruleSet) => ruleSet.name === "通常4人半荘")?.uma).toEqual([50, 10, -10, -30]);
    expect(standardRuleSets.find((ruleSet) => ruleSet.name === "通常3人半荘")?.uma).toEqual([15, 0, -15]);
    expect(standardRuleSets.find((ruleSet) => ruleSet.name === "通常4人東風")?.uma).toEqual([20, 5, -5, -20]);
    expect(standardRuleSets.find((ruleSet) => ruleSet.name === "通常3人東風")?.uma).toEqual([5, 0, -5]);
  });

  test("defines tournament 4-player hanchan as split-uma and no-bust", () => {
    const tournament = standardRuleSets.find((ruleSet) => ruleSet.name === "大会4人半荘");

    expect(tournament).toMatchObject({
      gameType: GameType.FOUR_PLAYER_HANCHAN,
      startScore: 25000,
      returnScore: 30000,
      uma: [50, 10, -10, -30],
      allowBust: false,
      bustThreshold: null,
      allowAgariYame: false,
      roundExtension: RoundExtension.NONE,
      tieBreakType: TieBreakType.SPLIT_UMA
    });
  });
});

describe("standardEvents", () => {
  test("defines normal events for each standard normal rule set", () => {
    expect(standardEvents).toEqual([
      {
        name: "通常4人半荘",
        kind: EventKind.NORMAL,
        ruleSetName: "通常4人半荘"
      },
      {
        name: "通常3人半荘",
        kind: EventKind.NORMAL,
        ruleSetName: "通常3人半荘"
      },
      {
        name: "通常4人東風",
        kind: EventKind.NORMAL,
        ruleSetName: "通常4人東風"
      },
      {
        name: "通常3人東風",
        kind: EventKind.NORMAL,
        ruleSetName: "通常3人東風"
      }
    ]);
  });

  test("does not create a tournament event by default", () => {
    expect(standardEvents.some((event) => event.kind === EventKind.TOURNAMENT)).toBe(false);
  });

  test("maps mahjong types to default normal events", () => {
    expect(defaultEventNameForMahjongType("4p")).toBe("通常4人半荘");
    expect(defaultEventNameForMahjongType("3p")).toBe("通常3人半荘");
    expect(defaultEventNameForMahjongType("4p_east")).toBe("通常4人東風");
    expect(defaultEventNameForMahjongType("3p_east")).toBe("通常3人東風");
  });

  test("maps mahjong types to v2 game types", () => {
    expect(gameTypeForMahjongType("4p")).toBe(GameType.FOUR_PLAYER_HANCHAN);
    expect(gameTypeForMahjongType("3p")).toBe(GameType.THREE_PLAYER_HANCHAN);
    expect(gameTypeForMahjongType("4p_east")).toBe(GameType.FOUR_PLAYER_TONPU);
    expect(gameTypeForMahjongType("3p_east")).toBe(GameType.THREE_PLAYER_TONPU);
  });
});
