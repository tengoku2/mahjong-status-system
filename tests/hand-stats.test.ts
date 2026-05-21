import { describe, expect, it } from "vitest";
import { calculateHandStats } from "../src/hand-stats.js";

describe("hand stats", () => {
  it("calculates primary hand stat rates and averages", () => {
    const stats = calculateHandStats(
      [
        {
          endType: "AGARI",
          declaredRiichi: true,
          calledOpenMeld: false,
          won: true,
          wonByTsumo: true,
          dealtIn: false,
          isTenpaiAtRyukyoku: null,
          winScore: 8000,
          dealInScore: null,
          winOrder: 10,
          isDama: false,
          ippatsuWin: true,
          uraDoraCount: 2
        },
        {
          endType: "AGARI",
          declaredRiichi: false,
          calledOpenMeld: false,
          won: true,
          wonByTsumo: false,
          dealtIn: false,
          isTenpaiAtRyukyoku: null,
          winScore: 5200,
          dealInScore: null,
          winOrder: 8,
          isDama: true,
          ippatsuWin: false,
          uraDoraCount: 0
        },
        {
          endType: "AGARI",
          declaredRiichi: false,
          calledOpenMeld: true,
          won: false,
          wonByTsumo: false,
          dealtIn: true,
          isTenpaiAtRyukyoku: null,
          winScore: null,
          dealInScore: 3900,
          winOrder: null,
          isDama: null,
          ippatsuWin: null,
          uraDoraCount: null
        },
        {
          endType: "RYUKYOKU",
          declaredRiichi: true,
          calledOpenMeld: true,
          won: false,
          wonByTsumo: false,
          dealtIn: false,
          isTenpaiAtRyukyoku: true,
          winScore: null,
          dealInScore: null,
          winOrder: null,
          isDama: null,
          ippatsuWin: null,
          uraDoraCount: null
        }
      ],
      {
        totalGames: 2,
        bustCount: 1
      }
    );

    expect(stats.totalHands).toBe(4);
    expect(stats.totalGames).toBe(2);
    expect(stats.winCount).toBe(2);
    expect(stats.dealInCount).toBe(1);
    expect(stats.drawCount).toBe(1);
    expect(stats.callCount).toBe(2);
    expect(stats.riichiCount).toBe(2);
    expect(stats.tsumoWinCount).toBe(1);
    expect(stats.ryukyokuTenpaiCount).toBe(1);
    expect(stats.winRate).toBe(0.5);
    expect(stats.dealInRate).toBe(0.25);
    expect(stats.drawRate).toBe(0.25);
    expect(stats.callRate).toBe(0.5);
    expect(stats.riichiRate).toBe(0.5);
    expect(stats.damaRate).toBe(0.5);
    expect(stats.tsumoRate).toBe(0.5);
    expect(stats.ryukyokuTenpaiRate).toBe(1);
    expect(stats.averageWinScore).toBe(6600);
    expect(stats.averageDealInScore).toBe(3900);
    expect(stats.averageWinOrder).toBe(9);
    expect(stats.ippatsuRate).toBe(0.5);
    expect(stats.averageUraDoraCount).toBe(1);
    expect(stats.bustRate).toBe(0.5);
  });

  it("returns null for zero-denominator rates", () => {
    const stats = calculateHandStats([], {
      totalGames: 0,
      bustCount: 0
    });

    expect(stats.winRate).toBeNull();
    expect(stats.dealInRate).toBeNull();
    expect(stats.drawRate).toBeNull();
    expect(stats.callRate).toBeNull();
    expect(stats.riichiRate).toBeNull();
    expect(stats.damaRate).toBeNull();
    expect(stats.tsumoRate).toBeNull();
    expect(stats.ryukyokuTenpaiRate).toBeNull();
    expect(stats.averageWinScore).toBeNull();
    expect(stats.averageDealInScore).toBeNull();
    expect(stats.averageWinOrder).toBeNull();
    expect(stats.ippatsuRate).toBeNull();
    expect(stats.averageUraDoraCount).toBeNull();
    expect(stats.bustRate).toBeNull();
  });
});
