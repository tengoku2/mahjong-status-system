import { describe, expect, it } from "vitest";
import { calendarStart, currentSeason, formatPeriodLabel, formatSeasonLabel, periodDateRange, previousSeason, recentLimit, seasonWindow } from "../src/periods.js";

describe("periods", () => {
  it("returns recent limits", () => {
    expect(recentLimit("recent_5")).toBe(5);
    expect(recentLimit("recent_100")).toBe(100);
    expect(recentLimit("all")).toBeNull();
  });

  it("uses calendar month starts", () => {
    const now = new Date(2026, 4, 7, 12, 0, 0);
    expect(calendarStart("month", now)?.toISOString()).toBe("2026-04-30T21:00:00.000Z");
    expect(calendarStart("three_months", now)?.toISOString()).toBe("2026-01-31T21:00:00.000Z");
    expect(calendarStart("half_year", now)?.toISOString()).toBe("2025-10-31T21:00:00.000Z");
    expect(calendarStart("year", now)?.toISOString()).toBe("2025-04-30T21:00:00.000Z");
  });

  it("formats the current month label", () => {
    const now = new Date(2026, 4, 7, 12, 0, 0);
    expect(formatPeriodLabel("month", now)).toBe("2026年05月");
    expect(formatPeriodLabel("all", now)).toBe("累計");
  });

  it("builds season windows on a spring-based cycle", () => {
    const season = currentSeason(new Date(2026, 4, 12, 12, 0, 0));
    expect(formatSeasonLabel(season)).toBe("蘭鳳季 26シーズン");
    expect(season.start.toISOString()).toBe("2026-02-28T21:00:00.000Z");
    expect(season.end.toISOString()).toBe("2026-05-31T21:00:00.000Z");

    const winter = seasonWindow("baioh", 26);
    expect(formatSeasonLabel(winter)).toBe("梅鳳季 26シーズン");
    expect(winter.start.toISOString()).toBe("2026-11-30T21:00:00.000Z");
    expect(winter.end.toISOString()).toBe("2027-02-28T21:00:00.000Z");
  });

  it("supports current and previous season period labels and windows", () => {
    const now = new Date(2026, 4, 12, 12, 0, 0);
    expect(formatPeriodLabel("current_season", now)).toBe("今シーズン (蘭鳳季 26シーズン)");
    expect(formatPeriodLabel("previous_season", now)).toBe("前シーズン (梅鳳季 25シーズン)");

    const previous = previousSeason(now);
    expect(formatSeasonLabel(previous)).toBe("梅鳳季 25シーズン");

    const range = periodDateRange("previous_season", now);
    expect(range?.start?.toISOString()).toBe("2025-11-30T21:00:00.000Z");
    expect(range?.end?.toISOString()).toBe("2026-02-28T21:00:00.000Z");
  });

  it("switches business dates and seasons at JST 6:00", () => {
    const beforeBoundary = new Date(Date.UTC(2026, 4, 31, 20, 59, 59));
    const afterBoundary = new Date(Date.UTC(2026, 4, 31, 21, 0, 0));

    expect(formatPeriodLabel("month", beforeBoundary)).toBe("2026年05月");
    expect(formatPeriodLabel("month", afterBoundary)).toBe("2026年06月");
    expect(formatSeasonLabel(currentSeason(beforeBoundary))).toBe("蘭鳳季 26シーズン");
    expect(formatSeasonLabel(currentSeason(afterBoundary))).toBe("竹鳳季 26シーズン");
  });
});
