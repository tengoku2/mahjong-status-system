import { currentSeason, previousSeason, seasonWindow, type SeasonWindow } from "./periods.js";
import type { Period, SeasonCode } from "./types.js";

export interface SeasonLockConfigLike {
  adminChannelId?: string | null;
  unlockedSeasonCode?: string | null;
  unlockedSeasonYear?: number | null;
}

export type LockScope = "ranking" | "self_stats_only" | "full_lock";

export interface LockState {
  locked: boolean;
  protectedSeason: Pick<SeasonWindow, "code" | "seasonYear" | "start" | "end"> | null;
}

const LOCK_DAYS = 14;

export function seasonLockStartsAt(season: SeasonWindow): Date {
  return new Date(season.end.getTime() - LOCK_DAYS * 24 * 60 * 60 * 1000);
}

export function isSeasonUnlocked(config: SeasonLockConfigLike | null | undefined, season: Pick<SeasonWindow, "code" | "seasonYear">): boolean {
  return config?.unlockedSeasonCode === season.code && config?.unlockedSeasonYear === season.seasonYear;
}

export function latestConcludedSeason(now = new Date()): SeasonWindow {
  return previousSeason(now);
}

export function isProtectedSeasonWindow(
  season: Pick<SeasonWindow, "code" | "seasonYear">,
  config: SeasonLockConfigLike | null | undefined,
  now = new Date()
): boolean {
  const current = currentSeason(now);
  if (current.code === season.code && current.seasonYear === season.seasonYear) {
    return now >= seasonLockStartsAt(current);
  }

  const latest = latestConcludedSeason(now);
  if (latest.code === season.code && latest.seasonYear === season.seasonYear) {
    return !isSeasonUnlocked(config, latest);
  }

  return false;
}

export function lockStateForSeason(
  season: Pick<SeasonWindow, "code" | "seasonYear" | "start" | "end">,
  config: SeasonLockConfigLike | null | undefined,
  now = new Date()
): LockState {
  return {
    locked: isProtectedSeasonWindow(season, config, now),
    protectedSeason: season
  };
}

export function lockStateForPeriod(
  period: Period | null,
  config: SeasonLockConfigLike | null | undefined,
  now = new Date()
): LockState {
  const current = currentSeason(now);
  const latest = latestConcludedSeason(now);

  if (period === "previous_season") {
    return {
      locked: isProtectedSeasonWindow(latest, config, now),
      protectedSeason: latest
    };
  }

  if (period === "current_season" || period === null) {
    return {
      locked: isProtectedSeasonWindow(current, config, now),
      protectedSeason: current
    };
  }

  if (period.startsWith("recent_") || ["month", "three_months", "half_year", "year", "all"].includes(period)) {
    const currentLocked = isProtectedSeasonWindow(current, config, now);
    const latestLocked = isProtectedSeasonWindow(latest, config, now);
    return {
      locked: currentLocked || latestLocked,
      protectedSeason: currentLocked ? current : latestLocked ? latest : null
    };
  }

  return {
    locked: false,
    protectedSeason: null
  };
}

export function formatPenaltySuffix(penaltyPoint: number): string {
  return penaltyPoint > 0 ? ` (-${penaltyPoint}pt)` : "";
}

export function seasonPenalty(games4p: number, games3p: number): number {
  const debt4p = Math.max(0, 25 - games4p * 5);
  const debt3p = games4p >= 5 && games4p + games3p >= 10 ? 0 : Math.max(0, 35 - games3p * 7);
  return debt4p + debt3p;
}

export function isManager(userId: string, hasManageGuild: boolean, developerIds: Set<string>): boolean {
  return hasManageGuild || developerIds.has(userId);
}
