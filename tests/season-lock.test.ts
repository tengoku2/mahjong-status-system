import { describe, expect, it } from "vitest";
import { currentSeason, previousSeason } from "../src/periods.js";
import { formatPenaltySuffix, latestConcludedSeason, lockStateForPeriod, lockStateForSeason, seasonPenalty } from "../src/season-lock.js";

describe("season lock", () => {
  it("locks the current season during the final two weeks", () => {
    const now = new Date(2026, 4, 20, 12, 0, 0);
    const season = currentSeason(now);

    expect(lockStateForSeason(season, null, now)).toEqual({
      locked: true,
      protectedSeason: season
    });
    expect(lockStateForPeriod("current_season", null, now).locked).toBe(true);
    expect(lockStateForPeriod("recent_10", null, now).locked).toBe(true);
  });

  it("keeps the latest concluded season locked until manually unlocked", () => {
    const now = new Date(2026, 5, 2, 12, 0, 0);
    const latest = latestConcludedSeason(now);

    expect(lockStateForPeriod("previous_season", null, now)).toEqual({
      locked: true,
      protectedSeason: latest
    });
    expect(
      lockStateForPeriod(
        "previous_season",
        {
          unlockedSeasonCode: latest.code,
          unlockedSeasonYear: latest.seasonYear
        },
        now
      ).locked
    ).toBe(false);
  });

  it("does not lock older completed seasons", () => {
    const now = new Date(2026, 5, 2, 12, 0, 0);
    const olderSeason = previousSeason(previousSeason(now).start);

    expect(lockStateForSeason(olderSeason, null, now).locked).toBe(false);
  });

  it("calculates MVP penalties by game count", () => {
    expect(seasonPenalty(5, 5)).toBe(0);
    expect(seasonPenalty(3, 5)).toBe(10);
    expect(seasonPenalty(0, 0)).toBe(60);
    expect(formatPenaltySuffix(0)).toBe("");
    expect(formatPenaltySuffix(14)).toBe(" (-14pt)");
  });
});
