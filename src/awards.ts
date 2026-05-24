import type { HandRecordInput, RecordInput } from "./records.js";

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
  lowestDealInRatePrize: AwardSummary[];
  mostYakumanPrize: AwardSummary[];
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

function resolveMvpTie(results: RecordInput[], tiedUserIds: string[], averageRankByUser: Map<string, number>): string[] {
  if (tiedUserIds.length <= 1) {
    return tiedUserIds;
  }

  const averageRankTiebreak = selectLowest(
    tiedUserIds.map((userId) => ({
      userId,
      value: averageRankByUser.get(userId) ?? Number.POSITIVE_INFINITY
    }))
  ).map((entry) => entry.userId);

  if (averageRankTiebreak.length === 1) {
    return averageRankTiebreak;
  }

  tiedUserIds = averageRankTiebreak;
  const tieSet = new Set(tiedUserIds);
  const matches = new Map<string, RecordInput[]>();
  for (const result of results) {
    const list = matches.get(result.match.matchId) ?? [];
    list.push(result);
    matches.set(result.match.matchId, list);
  }

  if (tiedUserIds.length >= 3) {
    const comparedPairs = new Set<string>();
    for (const matchResults of matches.values()) {
      const tiedResults = matchResults.filter((result) => tieSet.has(result.userId));
      for (let i = 0; i < tiedResults.length; i += 1) {
        for (let j = i + 1; j < tiedResults.length; j += 1) {
          const pair = [tiedResults[i].userId, tiedResults[j].userId].sort().join(":");
          comparedPairs.add(pair);
        }
      }
    }

    for (let i = 0; i < tiedUserIds.length; i += 1) {
      for (let j = i + 1; j < tiedUserIds.length; j += 1) {
        const pair = [tiedUserIds[i], tiedUserIds[j]].sort().join(":");
        if (!comparedPairs.has(pair)) {
          return tiedUserIds;
        }
      }
    }
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

export function calculateSeasonAwards(
  results: RecordInput[],
  fourPlayerResultsOrMinGames: RecordInput[] | number = [],
  fourPlayerHands: HandRecordInput[] = [],
  minGames = 5
): SeasonAwards {
  const fourPlayerResults = Array.isArray(fourPlayerResultsOrMinGames) ? fourPlayerResultsOrMinGames : results;
  minGames = typeof fourPlayerResultsOrMinGames === "number" ? fourPlayerResultsOrMinGames : minGames;
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
  const averageRankByUser = new Map(
    eligibleUsers.map((userId) => [userId, (rankSumByUser.get(userId) ?? 0) / (gamesByUser.get(userId) ?? 1)])
  );
  const mvpCandidates = eligibleUsers.map((userId) => ({ userId, value: pointByUser.get(userId) ?? 0 }));
  const rawMvp = selectHighest(mvpCandidates);
  const resolvedMvpIds = resolveMvpTie(eligibleResults, rawMvp.map((entry) => entry.userId), averageRankByUser);
  const mvp = rawMvp.filter((entry) => resolvedMvpIds.includes(entry.userId));

  const games4pByUser = new Map<string, number>();
  for (const result of fourPlayerResults) {
    games4pByUser.set(result.userId, (games4pByUser.get(result.userId) ?? 0) + 1);
  }
  const eligibleUsers4p = [...games4pByUser.entries()].filter(([, games]) => games >= minGames).map(([userId]) => userId);
  const eligibleSet4p = new Set(eligibleUsers4p);
  const handSummaryByUser = new Map<string, { totalHands: number; dealInCount: number; yakumanCount: number }>();
  for (const hand of fourPlayerHands) {
    if (!eligibleSet4p.has(hand.userId)) {
      continue;
    }
    const summary = handSummaryByUser.get(hand.userId) ?? {
      totalHands: 0,
      dealInCount: 0,
      yakumanCount: 0
    };
    summary.totalHands += 1;
    summary.dealInCount += hand.dealtIn ? 1 : 0;
    summary.yakumanCount += hand.won && (hand.winScore ?? 0) >= 32000 ? 1 : 0;
    handSummaryByUser.set(hand.userId, summary);
  }

  const lowestDealInRatePrize = selectLowest(
    eligibleUsers4p
      .map((userId) => {
        const summary = handSummaryByUser.get(userId);
        return summary && summary.totalHands > 0
          ? {
              userId,
              value: (summary.dealInCount / summary.totalHands) * 100
            }
          : null;
      })
      .filter((entry): entry is AwardSummary => entry !== null)
  );
  const mostYakumanPrize = selectHighest(
    eligibleUsers4p
      .map((userId) => ({
        userId,
        value: handSummaryByUser.get(userId)?.yakumanCount ?? 0
      }))
      .filter((entry) => entry.value > 0)
  );

  return {
    minGames,
    eligibleGames,
    mvp,
    topPrize: selectHighest(eligibleUsers.map((userId) => ({ userId, value: topsByUser.get(userId) ?? 0 }))),
    stabilityPrize: selectLowest(
      eligibleUsers.map((userId) => ({
        userId,
        value: averageRankByUser.get(userId) ?? 0
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
    participationPrize: selectHighest(eligibleUsers.map((userId) => ({ userId, value: gamesByUser.get(userId) ?? 0 }))),
    lowestDealInRatePrize,
    mostYakumanPrize
  };
}
