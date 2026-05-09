import { describe, expect, it } from "vitest";
import { parsePlayedAtInput } from "../src/date-input.js";

const now = new Date(2026, 4, 10, 9, 30, 0, 0);

function ymd(date: Date) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes()];
}

describe("parsePlayedAtInput", () => {
  it("defaults to now when empty", () => {
    expect(parsePlayedAtInput(undefined, now)).toBe(now);
  });

  it("parses slash month/day with the current year", () => {
    expect(ymd(parsePlayedAtInput("5/5", now))).toEqual([2026, 5, 5, 12, 0]);
  });

  it("parses compact month/day with the current year", () => {
    expect(ymd(parsePlayedAtInput("505", now))).toEqual([2026, 5, 5, 12, 0]);
    expect(ymd(parsePlayedAtInput("0505", now))).toEqual([2026, 5, 5, 12, 0]);
  });

  it("parses relative day words", () => {
    expect(ymd(parsePlayedAtInput("昨日", now))).toEqual([2026, 5, 9, 12, 0]);
    expect(ymd(parsePlayedAtInput("今日", now))).toEqual([2026, 5, 10, 12, 0]);
    expect(ymd(parsePlayedAtInput("明日", now))).toEqual([2026, 5, 11, 12, 0]);
  });

  it("keeps existing ISO-like date input", () => {
    expect(ymd(parsePlayedAtInput("2026-05-07", now))).toEqual([2026, 5, 7, 12, 0]);
  });

  it("rejects invalid dates", () => {
    expect(() => parsePlayedAtInput("2/30", now)).toThrow("存在する日付");
    expect(() => parsePlayedAtInput("abc", now)).toThrow("対局日");
  });
});
