import type { MahjongType } from "./types.js";

export interface RecordInput {
  userId: string;
  rank: number;
  rawScore: number;
  point: number;
  match: {
    matchId: string;
    playedAt: Date;
  };
}

export interface PlayerRecord {
  userId: string;
  value: number;
}

export interface MatchRecord {
  matchId: string;
  userId: string;
  value: number;
  playedAt: Date;
}

export interface MarginRecord extends MatchRecord {
  secondUserId: string;
}

export interface MahjongRecords {
  totalMatches: number;
  qualifiedMinGames: number;
  highestRawScore: MatchRecord[];
  highestPoint: MatchRecord[];
  largestRawScoreWinMargin: MarginRecord[];
  largestPointWinMargin: MarginRecord[];
  mostTops: PlayerRecord[];
  bestAverageRank: PlayerRecord[];
  longestTopStreak: PlayerRecord[];
  longestNoLastStreak: PlayerRecord[];
}

interface PlayerAggregate {
  userId: string;
  games: number;
  tops: number;
  rankSum: number;
}

function selectBestRecords<T extends { value: number }>(records: T[], lowerIsBetter = false): T[] {
  const best = records.reduce<number | null>((current, record) => {
    if (current === null) {
      return record.value;
    }
    if (record.value === current) {
      return current;
    }
    return lowerIsBetter ? Math.min(current, record.value) : Math.max(current, record.value);
  }, null);

  if (best === null) {
    return [];
  }

  return records.filter((record) => record.value === best);
}

function sortMatchRecords<T extends MatchRecord>(records: T[]): T[] {
  return [...records].sort(
    (a, b) =>
      a.playedAt.getTime() - b.playedAt.getTime() ||
      a.userId.localeCompare(b.userId) ||
      a.matchId.localeCompare(b.matchId)
  );
}

function sortPlayerRecords<T extends PlayerRecord>(records: T[]): T[] {
  return [...records].sort((a, b) => a.userId.localeCompare(b.userId));
}

export function calculateRecords(type: MahjongType, results: RecordInput[], qualifiedMinGames = 5): MahjongRecords {
  const maxRank = type === "4p" ? 4 : 3;
  const matches = new Map<string, RecordInput[]>();
  const players = new Map<string, PlayerAggregate>();
  const rawScoreRecords: MatchRecord[] = [];
  const pointRecords: MatchRecord[] = [];

  for (const result of results) {
    const group = matches.get(result.match.matchId) ?? [];
    group.push(result);
    matches.set(result.match.matchId, group);

    const aggregate = players.get(result.userId) ?? {
      userId: result.userId,
      games: 0,
      tops: 0,
      rankSum: 0
    };
    aggregate.games += 1;
    aggregate.tops += result.rank === 1 ? 1 : 0;
    aggregate.rankSum += result.rank;
    players.set(result.userId, aggregate);

    rawScoreRecords.push({
      matchId: result.match.matchId,
      userId: result.userId,
      value: result.rawScore,
      playedAt: result.match.playedAt
    });
    pointRecords.push({
      matchId: result.match.matchId,
      userId: result.userId,
      value: result.point,
      playedAt: result.match.playedAt
    });
  }

  const rawScoreWinMargins: MarginRecord[] = [];
  const pointWinMargins: MarginRecord[] = [];

  for (const matchResults of matches.values()) {
    const first = matchResults.find((result) => result.rank === 1);
    const second = matchResults.find((result) => result.rank === 2);
    if (!first || !second) {
      continue;
    }

    rawScoreWinMargins.push({
      matchId: first.match.matchId,
      userId: first.userId,
      secondUserId: second.userId,
      value: first.rawScore - second.rawScore,
      playedAt: first.match.playedAt
    });
    pointWinMargins.push({
      matchId: first.match.matchId,
      userId: first.userId,
      secondUserId: second.userId,
      value: first.point - second.point,
      playedAt: first.match.playedAt
    });
  }

  const topRecords: PlayerRecord[] = [];
  const averageRankRecords: PlayerRecord[] = [];

  for (const player of players.values()) {
    topRecords.push({
      userId: player.userId,
      value: player.tops
    });

    if (player.games >= qualifiedMinGames) {
      averageRankRecords.push({
        userId: player.userId,
        value: player.rankSum / player.games
      });
    }
  }

  const topStreakRecords: PlayerRecord[] = [];
  const noLastStreakRecords: PlayerRecord[] = [];

  for (const userId of players.keys()) {
    const sorted = results
      .filter((result) => result.userId === userId)
      .sort((a, b) => a.match.playedAt.getTime() - b.match.playedAt.getTime() || a.match.matchId.localeCompare(b.match.matchId));
    let topStreak = 0;
    let noLastStreak = 0;

    for (const result of sorted) {
      topStreak = result.rank === 1 ? topStreak + 1 : 0;
      noLastStreak = result.rank !== maxRank ? noLastStreak + 1 : 0;

      topStreakRecords.push({
        userId,
        value: topStreak
      });
      noLastStreakRecords.push({
        userId,
        value: noLastStreak
      });
    }
  }

  return {
    totalMatches: matches.size,
    qualifiedMinGames,
    highestRawScore: sortMatchRecords(selectBestRecords(rawScoreRecords)),
    highestPoint: sortMatchRecords(selectBestRecords(pointRecords)),
    largestRawScoreWinMargin: sortMatchRecords(selectBestRecords(rawScoreWinMargins)),
    largestPointWinMargin: sortMatchRecords(selectBestRecords(pointWinMargins)),
    mostTops: sortPlayerRecords(selectBestRecords(topRecords)),
    bestAverageRank: sortPlayerRecords(selectBestRecords(averageRankRecords, true)),
    longestTopStreak: sortPlayerRecords(selectBestRecords(topStreakRecords)),
    longestNoLastStreak: sortPlayerRecords(selectBestRecords(noLastStreakRecords))
  };
}
