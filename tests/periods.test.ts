import { describe, expect, it } from "vitest";
import { calendarStart, formatPeriodLabel, recentLimit } from "../src/periods.js";

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
});
