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
    expect(calendarStart("month", now)?.toISOString()).toBe(new Date(2026, 4, 1).toISOString());
    expect(calendarStart("three_months", now)?.toISOString()).toBe(new Date(2026, 1, 1).toISOString());
    expect(calendarStart("half_year", now)?.toISOString()).toBe(new Date(2025, 10, 1).toISOString());
    expect(calendarStart("year", now)?.toISOString()).toBe(new Date(2025, 4, 1).toISOString());
  });

  it("formats the current month label", () => {
    const now = new Date(2026, 4, 7, 12, 0, 0);
    expect(formatPeriodLabel("month", now)).toBe("2026年05月");
    expect(formatPeriodLabel("all", now)).toBe("累計");
  });

  it("builds season windows on a spring-based cycle", () => {
    const season = currentSeason(new Date(2026, 4, 12, 12, 0, 0));
    expect(formatSeasonLabel(season)).toBe("蘭鳳季 26シーズン");
    expect(season.start.toISOString()).toBe(new Date(2026, 2, 1).toISOString());
    expect(season.end.toISOString()).toBe(new Date(2026, 5, 1).toISOString());

    const winter = seasonWindow("baioh", 26);
    expect(formatSeasonLabel(winter)).toBe("梅鳳季 26シーズン");
    expect(winter.start.toISOString()).toBe(new Date(2026, 11, 1).toISOString());
    expect(winter.end.toISOString()).toBe(new Date(2027, 2, 1).toISOString());
  });

  it("supports current and previous season period labels and windows", () => {
    const now = new Date(2026, 4, 12, 12, 0, 0);
    expect(formatPeriodLabel("current_season", now)).toBe("今シーズン (蘭鳳季 26シーズン)");
    expect(formatPeriodLabel("previous_season", now)).toBe("前シーズン (梅鳳季 25シーズン)");

    const previous = previousSeason(now);
    expect(formatSeasonLabel(previous)).toBe("梅鳳季 25シーズン");

    const range = periodDateRange("previous_season", now);
    expect(range?.start?.toISOString()).toBe(new Date(2025, 11, 1).toISOString());
    expect(range?.end?.toISOString()).toBe(new Date(2026, 2, 1).toISOString());
  });
});
