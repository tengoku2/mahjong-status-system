import type { MahjongType } from "./types.js";
import { expectedPlayerCount } from "./scoring.js";

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
  mostTops: PlayerRecord[];
  bestAverageRank: PlayerRecord[];
  longestTopStreak: PlayerRecord[];
  bestLastAvoidanceRate: PlayerRecord[];
}

interface PlayerAggregate {
  userId: string;
  games: number;
  tops: number;
  rankSum: number;
  lasts: number;
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
  const maxRank = expectedPlayerCount(type);
  const matches = new Map<string, RecordInput[]>();
  const players = new Map<string, PlayerAggregate>();
  const rawScoreRecords: MatchRecord[] = [];

  for (const result of results) {
    const group = matches.get(result.match.matchId) ?? [];
    group.push(result);
    matches.set(result.match.matchId, group);

    const aggregate = players.get(result.userId) ?? {
      userId: result.userId,
      games: 0,
      tops: 0,
      rankSum: 0,
      lasts: 0
    };
    aggregate.games += 1;
    aggregate.tops += result.rank === 1 ? 1 : 0;
    aggregate.rankSum += result.rank;
    aggregate.lasts += result.rank === maxRank ? 1 : 0;
    players.set(result.userId, aggregate);

    rawScoreRecords.push({
      matchId: result.match.matchId,
      userId: result.userId,
      value: result.rawScore,
      playedAt: result.match.playedAt
    });
  }

  const topRecords: PlayerRecord[] = [];
  const averageRankRecords: PlayerRecord[] = [];
  const lastAvoidanceRateRecords: PlayerRecord[] = [];

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
      lastAvoidanceRateRecords.push({
        userId: player.userId,
        value: ((player.games - player.lasts) / player.games) * 100
      });
    }
  }

  const topStreakRecords: PlayerRecord[] = [];

  for (const userId of players.keys()) {
    const sorted = results
      .filter((result) => result.userId === userId)
      .sort((a, b) => a.match.playedAt.getTime() - b.match.playedAt.getTime() || a.match.matchId.localeCompare(b.match.matchId));
    let topStreak = 0;

    for (const result of sorted) {
      topStreak = result.rank === 1 ? topStreak + 1 : 0;

      topStreakRecords.push({
        userId,
        value: topStreak
      });
    }
  }

  return {
    totalMatches: matches.size,
    qualifiedMinGames,
    highestRawScore: sortMatchRecords(selectBestRecords(rawScoreRecords)),
    mostTops: sortPlayerRecords(selectBestRecords(topRecords)),
    bestAverageRank: sortPlayerRecords(selectBestRecords(averageRankRecords, true)),
    longestTopStreak: sortPlayerRecords(selectBestRecords(topStreakRecords.filter((record) => record.value >= 2))),
    bestLastAvoidanceRate: sortPlayerRecords(selectBestRecords(lastAvoidanceRateRecords))
  };
}
