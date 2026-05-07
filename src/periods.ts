import type { Period } from "./types.js";

export const periodChoices = [
  { name: "直近5戦", value: "recent_5" },
  { name: "直近10戦", value: "recent_10" },
  { name: "直近50戦", value: "recent_50" },
  { name: "直近100戦", value: "recent_100" },
  { name: "当月", value: "month" },
  { name: "3ヶ月", value: "three_months" },
  { name: "半年", value: "half_year" },
  { name: "1年", value: "year" },
  { name: "累計", value: "all" }
] as const;

export const periodLabels: Record<Period, string> = {
  recent_5: "直近5戦",
  recent_10: "直近10戦",
  recent_50: "直近50戦",
  recent_100: "直近100戦",
  month: "当月",
  three_months: "3ヶ月",
  half_year: "半年",
  year: "1年",
  all: "累計"
};

export function formatPeriodLabel(period: Period, now = new Date()): string {
  if (period === "month") {
    const month = `${now.getMonth() + 1}`.padStart(2, "0");
    return `${now.getFullYear()}年${month}月`;
  }

  return periodLabels[period];
}

export function recentLimit(period: Period): number | null {
  const match = /^recent_(\d+)$/.exec(period);
  return match ? Number(match[1]) : null;
}

export function calendarStart(period: Period, now = new Date()): Date | null {
  const monthsByPeriod: Partial<Record<Period, number>> = {
    month: 0,
    three_months: 3,
    half_year: 6,
    year: 12
  };
  const months = monthsByPeriod[period];
  if (months === undefined) {
    return null;
  }

  return new Date(now.getFullYear(), now.getMonth() - months, 1, 0, 0, 0, 0);
}
