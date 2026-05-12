import type { Period, SeasonCode } from "./types.js";

export interface SeasonWindow {
  code: SeasonCode;
  label: string;
  seasonYear: number;
  start: Date;
  end: Date;
}

export const periodChoices = [
  { name: "直近5戦", value: "recent_5" },
  { name: "直近10戦", value: "recent_10" },
  { name: "直近50戦", value: "recent_50" },
  { name: "直近100戦", value: "recent_100" },
  { name: "今シーズン", value: "current_season" },
  { name: "前シーズン", value: "previous_season" },
  { name: "当月", value: "month" },
  { name: "3ヶ月", value: "three_months" },
  { name: "半年", value: "half_year" },
  { name: "1年", value: "year" },
  { name: "累計", value: "all" }
] as const;

export const seasonChoices = [
  { name: "蘭鳳季", value: "ranoh" },
  { name: "竹鳳季", value: "chikuoh" },
  { name: "菊鳳季", value: "kikuoh" },
  { name: "梅鳳季", value: "baioh" }
] as const;

export const periodLabels: Record<Period, string> = {
  recent_5: "直近5戦",
  recent_10: "直近10戦",
  recent_50: "直近50戦",
  recent_100: "直近100戦",
  current_season: "今シーズン",
  previous_season: "前シーズン",
  month: "当月",
  three_months: "3ヶ月",
  half_year: "半年",
  year: "1年",
  all: "累計"
};

const seasonMetadata: Record<SeasonCode, { label: string; startMonth: number }> = {
  ranoh: { label: "蘭鳳季", startMonth: 2 },
  chikuoh: { label: "竹鳳季", startMonth: 5 },
  kikuoh: { label: "菊鳳季", startMonth: 8 },
  baioh: { label: "梅鳳季", startMonth: 11 }
};

export function formatPeriodLabel(period: Period, now = new Date()): string {
  if (period === "current_season") {
    return `今シーズン (${formatSeasonLabel(currentSeason(now))})`;
  }

  if (period === "previous_season") {
    return `前シーズン (${formatSeasonLabel(previousSeason(now))})`;
  }

  if (period === "month") {
    const month = `${now.getMonth() + 1}`.padStart(2, "0");
    return `${now.getFullYear()}年${month}月`;
  }

  return periodLabels[period];
}

export function formatSeasonLabel(window: SeasonWindow): string {
  return `${window.label} ${window.seasonYear}シーズン`;
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

export function currentSeason(now = new Date()): SeasonWindow {
  const month = now.getMonth();
  if (month >= 2 && month <= 4) {
    return seasonWindow("ranoh", now.getFullYear() - 2000);
  }
  if (month >= 5 && month <= 7) {
    return seasonWindow("chikuoh", now.getFullYear() - 2000);
  }
  if (month >= 8 && month <= 10) {
    return seasonWindow("kikuoh", now.getFullYear() - 2000);
  }

  const seasonYear = month >= 11 ? now.getFullYear() - 2000 : now.getFullYear() - 2001;
  return seasonWindow("baioh", seasonYear);
}

export function previousSeason(now = new Date()): SeasonWindow {
  const current = currentSeason(now);
  if (current.code === "ranoh") {
    return seasonWindow("baioh", current.seasonYear - 1);
  }
  if (current.code === "chikuoh") {
    return seasonWindow("ranoh", current.seasonYear);
  }
  if (current.code === "kikuoh") {
    return seasonWindow("chikuoh", current.seasonYear);
  }
  return seasonWindow("kikuoh", current.seasonYear);
}

export function periodDateRange(period: Period, now = new Date()): { start?: Date; end?: Date } | null {
  if (period === "current_season") {
    const season = currentSeason(now);
    return { start: season.start, end: season.end };
  }

  if (period === "previous_season") {
    const season = previousSeason(now);
    return { start: season.start, end: season.end };
  }

  const start = calendarStart(period, now);
  return start ? { start } : null;
}

export function seasonWindow(code: SeasonCode, seasonYear: number): SeasonWindow {
  const meta = seasonMetadata[code];
  const startYear = code === "baioh" ? 2000 + seasonYear : 2000 + seasonYear;
  const start = new Date(startYear, meta.startMonth, 1, 0, 0, 0, 0);
  const end = new Date(startYear, meta.startMonth + 3, 1, 0, 0, 0, 0);

  return {
    code,
    label: meta.label,
    seasonYear,
    start,
    end
  };
}
