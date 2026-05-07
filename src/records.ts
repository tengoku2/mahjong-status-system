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
  highestRawScore: MatchRecord | null;
  highestPoint: MatchRecord | null;
  largestRawScoreWinMargin: MarginRecord | null;
  largestPointWinMargin: MarginRecord | null;
  mostTops: PlayerRecord | null;
  bestAverageRank: PlayerRecord | null;
  longestTopStreak: PlayerRecord | null;
  longestNoLastStreak: PlayerRecord | null;
}

interface PlayerAggregate {
  userId: string;
  games: number;
  tops: number;
  rankSum: number;
}

function compareMatchRecord<T extends MatchRecord>(a: T | null, b: T): T {
  if (!a) {
    return b;
  }
  if (b.value !== a.value) {
    return b.value > a.value ? b : a;
  }
  return b.playedAt < a.playedAt ? b : a;
}

function comparePlayerRecord(a: PlayerRecord | null, b: PlayerRecord, lowerIsBetter = false): PlayerRecord {
  if (!a) {
    return b;
  }
  if (b.value !== a.value) {
    return lowerIsBetter ? (b.value < a.value ? b : a) : b.value > a.value ? b : a;
  }
  return b.userId < a.userId ? b : a;
}

export function calculateRecords(type: MahjongType, results: RecordInput[], qualifiedMinGames = 5): MahjongRecords {
  const maxRank = type === "4p" ? 4 : 3;
  const matches = new Map<string, RecordInput[]>();
  const players = new Map<string, PlayerAggregate>();
  let highestRawScore: MatchRecord | null = null;
  let highestPoint: MatchRecord | null = null;

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

    highestRawScore = compareMatchRecord(highestRawScore, {
      matchId: result.match.matchId,
      userId: result.userId,
      value: result.rawScore,
      playedAt: result.match.playedAt
    });
    highestPoint = compareMatchRecord(highestPoint, {
      matchId: result.match.matchId,
      userId: result.userId,
      value: result.point,
      playedAt: result.match.playedAt
    });
  }

  let largestRawScoreWinMargin: MarginRecord | null = null;
  let largestPointWinMargin: MarginRecord | null = null;

  for (const matchResults of matches.values()) {
    const first = matchResults.find((result) => result.rank === 1);
    const second = matchResults.find((result) => result.rank === 2);
    if (!first || !second) {
      continue;
    }

    largestRawScoreWinMargin = compareMatchRecord(largestRawScoreWinMargin, {
      matchId: first.match.matchId,
      userId: first.userId,
      secondUserId: second.userId,
      value: first.rawScore - second.rawScore,
      playedAt: first.match.playedAt
    }) as MarginRecord;
    largestPointWinMargin = compareMatchRecord(largestPointWinMargin, {
      matchId: first.match.matchId,
      userId: first.userId,
      secondUserId: second.userId,
      value: first.point - second.point,
      playedAt: first.match.playedAt
    }) as MarginRecord;
  }

  let mostTops: PlayerRecord | null = null;
  let bestAverageRank: PlayerRecord | null = null;

  for (const player of players.values()) {
    mostTops = comparePlayerRecord(mostTops, {
      userId: player.userId,
      value: player.tops
    });

    if (player.games >= qualifiedMinGames) {
      bestAverageRank = comparePlayerRecord(
        bestAverageRank,
        {
          userId: player.userId,
          value: player.rankSum / player.games
        },
        true
      );
    }
  }

  let longestTopStreak: PlayerRecord | null = null;
  let longestNoLastStreak: PlayerRecord | null = null;

  for (const userId of players.keys()) {
    const sorted = results
      .filter((result) => result.userId === userId)
      .sort((a, b) => a.match.playedAt.getTime() - b.match.playedAt.getTime() || a.match.matchId.localeCompare(b.match.matchId));
    let topStreak = 0;
    let noLastStreak = 0;

    for (const result of sorted) {
      topStreak = result.rank === 1 ? topStreak + 1 : 0;
      noLastStreak = result.rank !== maxRank ? noLastStreak + 1 : 0;

      longestTopStreak = comparePlayerRecord(longestTopStreak, {
        userId,
        value: topStreak
      });
      longestNoLastStreak = comparePlayerRecord(longestNoLastStreak, {
        userId,
        value: noLastStreak
      });
    }
  }

  return {
    totalMatches: matches.size,
    qualifiedMinGames,
    highestRawScore,
    highestPoint,
    largestRawScoreWinMargin,
    largestPointWinMargin,
    mostTops,
    bestAverageRank,
    longestTopStreak,
    longestNoLastStreak
  };
}
