import type { RecordInput } from "./records.js";

export interface AwardSummary {
  userId: string;
  value: number;
}

export interface SeasonAwards {
  minGames: number;
  eligibleGames: Map<string, number>;
  mvp: AwardSummary[];
  topPrize: AwardSummary[];
  stabilityPrize: AwardSummary[];
  highestScorePrize: AwardSummary[];
  topStreakPrize: AwardSummary[];
  noLastStreakPrize: AwardSummary[];
  participationPrize: AwardSummary[];
}

function selectHighest(entries: AwardSummary[]): AwardSummary[] {
  if (entries.length === 0) {
    return [];
  }
  const best = Math.max(...entries.map((entry) => entry.value));
  return entries.filter((entry) => entry.value === best).sort((a, b) => a.userId.localeCompare(b.userId));
}

function selectLowest(entries: AwardSummary[]): AwardSummary[] {
  if (entries.length === 0) {
    return [];
  }
  const best = Math.min(...entries.map((entry) => entry.value));
  return entries.filter((entry) => entry.value === best).sort((a, b) => a.userId.localeCompare(b.userId));
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function resolveMvpTie(results: RecordInput[], tiedUserIds: string[]): string[] {
  if (tiedUserIds.length <= 1) {
    return tiedUserIds;
  }

  const tieSet = new Set(tiedUserIds);
  const matches = new Map<string, RecordInput[]>();
  for (const result of results) {
    const list = matches.get(result.match.matchId) ?? [];
    list.push(result);
    matches.set(result.match.matchId, list);
  }

  const headToHead = new Map<string, number[]>();
  for (const userId of tiedUserIds) {
    headToHead.set(userId, []);
  }

  for (const matchResults of matches.values()) {
    const tiedResults = matchResults.filter((result) => tieSet.has(result.userId));
    if (tiedResults.length < 2) {
      continue;
    }

    for (const result of tiedResults) {
      headToHead.get(result.userId)?.push(result.rank);
    }
  }

  const comparable = tiedUserIds.filter((userId) => (headToHead.get(userId)?.length ?? 0) > 0);
  if (comparable.length !== tiedUserIds.length) {
    return tiedUserIds;
  }

  const averages = comparable.map((userId) => ({
    userId,
    value: average(headToHead.get(userId) ?? [])
  }));
  const winners = selectLowest(averages).map((entry) => entry.userId);
  return winners.length > 0 ? winners : tiedUserIds;
}

export function calculateSeasonAwards(results: RecordInput[], minGames = 5): SeasonAwards {
  const gamesByUser = new Map<string, number>();
  const pointByUser = new Map<string, number>();
  const topsByUser = new Map<string, number>();
  const rankSumByUser = new Map<string, number>();
  const highScoreByUser = new Map<string, number>();
  const streakTopByUser = new Map<string, number>();
  const streakNoLastByUser = new Map<string, number>();
  const maxRankByMatch = new Map<string, number>();

  for (const result of results) {
    gamesByUser.set(result.userId, (gamesByUser.get(result.userId) ?? 0) + 1);
    pointByUser.set(result.userId, (pointByUser.get(result.userId) ?? 0) + result.point);
    topsByUser.set(result.userId, (topsByUser.get(result.userId) ?? 0) + (result.rank === 1 ? 1 : 0));
    rankSumByUser.set(result.userId, (rankSumByUser.get(result.userId) ?? 0) + result.rank);
    highScoreByUser.set(result.userId, Math.max(highScoreByUser.get(result.userId) ?? 0, result.rawScore));
    maxRankByMatch.set(result.match.matchId, Math.max(maxRankByMatch.get(result.match.matchId) ?? 0, result.rank));
  }

  const eligibleUsers = [...gamesByUser.entries()].filter(([, games]) => games >= minGames).map(([userId]) => userId);
  const eligibleSet = new Set(eligibleUsers);
  const eligibleResults = results.filter((result) => eligibleSet.has(result.userId));

  const sortedByUser = new Map<string, RecordInput[]>();
  for (const result of eligibleResults) {
    const list = sortedByUser.get(result.userId) ?? [];
    list.push(result);
    sortedByUser.set(result.userId, list);
  }

  for (const entries of sortedByUser.values()) {
    entries.sort((a, b) => a.match.playedAt.getTime() - b.match.playedAt.getTime() || a.match.matchId.localeCompare(b.match.matchId));
  }

  for (const [userId, entries] of sortedByUser.entries()) {
    let topStreak = 0;
    let noLastStreak = 0;
    let bestTopStreak = 0;
    let bestNoLastStreak = 0;
    for (const entry of entries) {
      topStreak = entry.rank === 1 ? topStreak + 1 : 0;
      const maxRank = maxRankByMatch.get(entry.match.matchId) ?? entry.rank;
      noLastStreak = entry.rank !== maxRank ? noLastStreak + 1 : 0;
      bestTopStreak = Math.max(bestTopStreak, topStreak);
      bestNoLastStreak = Math.max(bestNoLastStreak, noLastStreak);
    }
    streakTopByUser.set(userId, bestTopStreak);
    streakNoLastByUser.set(userId, bestNoLastStreak);
  }

  const eligibleGames = new Map<string, number>(eligibleUsers.map((userId) => [userId, gamesByUser.get(userId) ?? 0]));
  const mvpCandidates = eligibleUsers.map((userId) => ({ userId, value: pointByUser.get(userId) ?? 0 }));
  const rawMvp = selectHighest(mvpCandidates);
  const resolvedMvpIds = resolveMvpTie(eligibleResults, rawMvp.map((entry) => entry.userId));
  const mvp = rawMvp.filter((entry) => resolvedMvpIds.includes(entry.userId));

  return {
    minGames,
    eligibleGames,
    mvp,
    topPrize: selectHighest(eligibleUsers.map((userId) => ({ userId, value: topsByUser.get(userId) ?? 0 }))),
    stabilityPrize: selectLowest(
      eligibleUsers.map((userId) => ({
        userId,
        value: (rankSumByUser.get(userId) ?? 0) / (gamesByUser.get(userId) ?? 1)
      }))
    ),
    highestScorePrize: selectHighest(eligibleUsers.map((userId) => ({ userId, value: highScoreByUser.get(userId) ?? 0 }))),
    topStreakPrize: selectHighest(
      eligibleUsers
        .map((userId) => ({ userId, value: streakTopByUser.get(userId) ?? 0 }))
        .filter((entry) => entry.value >= 2)
    ),
    noLastStreakPrize: selectHighest(
      eligibleUsers
        .map((userId) => ({ userId, value: streakNoLastByUser.get(userId) ?? 0 }))
        .filter((entry) => entry.value >= 2)
    ),
    participationPrize: selectHighest(eligibleUsers.map((userId) => ({ userId, value: gamesByUser.get(userId) ?? 0 })))
  };
}
