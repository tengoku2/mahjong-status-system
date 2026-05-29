import type { Prisma } from "@prisma/client";
import { calculateSeasonAwards } from "./awards.js";
import { calculateHandStats, type HandStatsSummary } from "./hand-stats.js";
import { calculateResults, expectedPlayerCount, normalizeMahjongType } from "./scoring.js";
import { calculateRecords } from "./records.js";
import { seasonPenalty } from "./season-lock.js";
import { periodDateRange, recentLimit, type SeasonWindow } from "./periods.js";
import { prisma } from "./prisma.js";
import type { HandInput, MahjongType, Period, PlayerInput, SeasonBonusTarget, SeasonCode } from "./types.js";

export interface ExternalMatchIdentity {
  externalSource: string;
  externalMatchId: string;
}

export interface RankingEntry {
  userId: string;
  games: number;
  totalPoint: number;
  rankSum: number;
  averageRank: number;
  averagePoint: number;
}

export interface MvpRankingEntry extends RankingEntry {
  rawTotalPoint: number;
  adjustedTotalPoint: number;
  penaltyPoint: number;
  games3p: number;
  games4p: number;
}

export interface SeasonBonusEntry {
  seasonBonusId: string;
  guildId: string;
  userId: string;
  type: MahjongType;
  seasonCode: SeasonCode;
  seasonYear: number;
  target: SeasonBonusTarget;
  point: number;
  createdAt: Date;
}

export type AggregatedHandStats = HandStatsSummary;

const transactionOptions = {
  maxWait: 10_000,
  timeout: 20_000
};

export async function ensureGuildAndUsers(guildId: string, userIds: string[], tx: Prisma.TransactionClient = prisma) {
  await tx.guild.upsert({
    where: { guildId },
    create: { guildId },
    update: {}
  });

  for (const userId of userIds) {
    await tx.user.upsert({
      where: {
        guildId_userId: {
          guildId,
          userId
        }
      },
      create: {
        guildId,
        userId
      },
      update: {}
    });
  }
}

export async function createSeasonBonus(
  guildId: string,
  userId: string,
  type: MahjongType,
  season: Pick<SeasonWindow, "code" | "seasonYear">,
  target: SeasonBonusTarget,
  point: number
) {
  await ensureGuildAndUsers(guildId, [userId]);
  return prisma.seasonBonus.create({
    data: {
      guildId,
      userId,
      type: normalizeMahjongType(type),
      seasonCode: season.code,
      seasonYear: season.seasonYear,
      target,
      point
    }
  });
}

export async function getSeasonBonuses(
  guildId: string,
  season: Pick<SeasonWindow, "code" | "seasonYear">,
  types?: MahjongType[]
): Promise<SeasonBonusEntry[]> {
  return prisma.seasonBonus.findMany({
    where: {
      guildId,
      seasonCode: season.code,
      seasonYear: season.seasonYear,
      type: types ? { in: types.map((type) => normalizeMahjongType(type)) } : undefined
    },
    orderBy: [{ createdAt: "asc" }]
  }) as Promise<SeasonBonusEntry[]>;
}

export function buildSeasonBonusMap(bonuses: SeasonBonusEntry[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const bonus of bonuses) {
    map.set(bonus.userId, (map.get(bonus.userId) ?? 0) + bonus.point);
  }
  return map;
}

export function applyBonusToRankingEntries<T extends RankingEntry>(entries: T[], bonusByUser: Map<string, number>): T[] {
  if (bonusByUser.size === 0) {
    return entries;
  }
  return [...entries]
    .map((entry) => {
      const bonus = bonusByUser.get(entry.userId) ?? 0;
      if (bonus === 0) {
        return entry;
      }
      const totalPoint = entry.totalPoint + bonus;
      return {
        ...entry,
        totalPoint,
        averagePoint: totalPoint / entry.games
      };
    })
    .sort((a, b) => b.totalPoint - a.totalPoint || b.averagePoint - a.averagePoint || a.userId.localeCompare(b.userId));
}

export async function createMatch(
  guildId: string,
  type: MahjongType,
  players: PlayerInput[],
  tournamentName?: string,
  playedAt?: Date,
  hands?: HandInput[]
) {
  const normalizedType = normalizeMahjongType(type);
  const calculated = calculateResults(normalizedType, players);
  const normalizedTournamentName = normalizeTournamentName(tournamentName);

  return prisma.$transaction(async (tx) => {
    await ensureGuildAndUsers(guildId, collectMatchUserIds(calculated, hands), tx);

    return tx.match.create({
      data: {
        guildId,
        type: normalizedType,
        tournamentName: normalizedTournamentName,
        playedAt,
        hands: hands
          ? {
              create: buildHandCreateInputs(hands)
            }
          : undefined,
        results: {
          create: calculated.map((result) => ({
            userId: result.userId,
            rank: result.rank,
            rawScore: result.rawScore,
            point: result.point
          }))
        }
      },
      include: {
        results: {
          orderBy: {
            rank: "asc"
          }
        }
      }
    });
  }, transactionOptions);
}

export async function createExternalMatch(
  guildId: string,
  type: MahjongType,
  players: PlayerInput[],
  tournamentName: string | undefined,
  playedAt: Date | undefined,
  identity: ExternalMatchIdentity,
  hands?: HandInput[]
) {
  const normalizedType = normalizeMahjongType(type);
  const calculated = calculateResults(normalizedType, players);
  const normalizedTournamentName = normalizeTournamentName(tournamentName);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.externalMatch.findUnique({
      where: {
        externalSource_externalMatchId: {
          externalSource: identity.externalSource,
          externalMatchId: identity.externalMatchId
        }
      },
      include: {
        match: {
          include: {
            results: {
              orderBy: {
                rank: "asc"
              }
            }
          }
        }
      }
    });

    if (existing) {
      return {
        duplicate: true,
        match: existing.match
      };
    }

    await ensureGuildAndUsers(guildId, collectMatchUserIds(calculated, hands), tx);

    const match = await tx.match.create({
      data: {
        guildId,
        type: normalizedType,
        tournamentName: normalizedTournamentName,
        playedAt,
        hands: hands
          ? {
              create: buildHandCreateInputs(hands)
            }
          : undefined,
        results: {
          create: calculated.map((result) => ({
            userId: result.userId,
            rank: result.rank,
            rawScore: result.rawScore,
            point: result.point
          }))
        }
      },
      include: {
        results: {
          orderBy: {
            rank: "asc"
          }
        }
      }
    });

    await tx.externalMatch.create({
      data: {
        externalSource: identity.externalSource,
        externalMatchId: identity.externalMatchId,
        guildId,
        matchId: match.matchId
      }
    });

    return {
      duplicate: false,
      match
    };
  }, transactionOptions);
}

export function normalizeTournamentName(value?: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function collectMatchUserIds(players: Array<{ userId: string }>, hands?: HandInput[]): string[] {
  const userIds = new Set(players.map((player) => player.userId));
  for (const hand of hands ?? []) {
    if (hand.dealerUserId) {
      userIds.add(hand.dealerUserId);
    }
    for (const stat of hand.playerStats) {
      userIds.add(stat.userId);
    }
  }
  return [...userIds];
}

function buildHandCreateInputs(hands: HandInput[]) {
  return hands.map((hand) => ({
    handIndex: hand.handIndex,
    roundWind: hand.roundWind,
    roundNumber: hand.roundNumber,
    honba: hand.honba ?? 0,
    kyotaku: hand.kyotaku ?? 0,
    dealerUserId: hand.dealerUserId,
    endType: hand.endType,
    abortReason: hand.abortReason,
    playerStats: {
      create: hand.playerStats.map((stat) => ({
        userId: stat.userId,
        seat: stat.seat,
        startScore: stat.startScore,
        endScore: stat.endScore,
        isTenpaiAtRyukyoku: stat.isTenpaiAtRyukyoku,
        declaredRiichi: stat.declaredRiichi ?? false,
        calledOpenMeld: stat.calledOpenMeld ?? false,
        won: stat.won ?? false,
        wonByTsumo: stat.wonByTsumo ?? false,
        dealtIn: stat.dealtIn ?? false,
        winScore: stat.winScore,
        dealInScore: stat.dealInScore,
        winOrder: stat.winOrder,
        isDama: stat.isDama,
        ippatsuWin: stat.ippatsuWin,
        uraDoraCount: stat.uraDoraCount
      }))
    }
  }));
}

async function periodMatchIdsForTypes(
  guildId: string,
  types: MahjongType[],
  period: Period,
  userId?: string,
  tournamentName?: string
): Promise<string[] | null> {
  const limit = recentLimit(period);
  const normalizedTournamentName = normalizeTournamentName(tournamentName);
  if (!limit) {
    return null;
  }

  const matches = await prisma.match.findMany({
    where: {
      guildId,
      type: {
        in: types.map((type) => normalizeMahjongType(type))
      },
      tournamentName: normalizedTournamentName,
      results: userId
        ? {
            some: {
              userId
            }
          }
        : undefined
    },
    orderBy: {
      playedAt: "desc"
    },
    take: limit,
    select: {
      matchId: true
    }
  });

  return matches.map((match) => match.matchId);
}

interface ResultQueryOptions {
  guildId: string;
  types: MahjongType[];
  userId?: string;
  tournamentName?: string;
  playedAtStart?: Date;
  playedAtEnd?: Date;
  matchIds?: string[] | null;
  excludeTournamentMatches?: boolean;
}

async function getResultsByOptions(options: ResultQueryOptions) {
  const normalizedTournamentName = normalizeTournamentName(options.tournamentName);

  return prisma.result.findMany({
    where: {
      userId: options.userId,
      match: {
        guildId: options.guildId,
        type: { in: options.types.map((type) => normalizeMahjongType(type)) },
        tournamentName:
          options.excludeTournamentMatches
            ? null
            : normalizedTournamentName,
        matchId: options.matchIds ? { in: options.matchIds } : undefined,
        playedAt:
          options.playedAtStart || options.playedAtEnd
            ? {
                gte: options.playedAtStart,
                lt: options.playedAtEnd
              }
            : undefined
      }
    },
    include: {
      match: true
    },
    orderBy: {
      match: {
        playedAt: "desc"
      }
    }
  });
}

export async function getResultsForPeriod(
  guildId: string,
  type: MahjongType,
  period: Period,
  userId?: string,
  tournamentName?: string
) {
  return getResultsForPeriodByTypes(guildId, [type], period, userId, tournamentName);
}

export async function getResultsForPeriodByTypes(
  guildId: string,
  types: MahjongType[],
  period: Period,
  userId?: string,
  tournamentName?: string
) {
  const normalizedTypes = types.map((type) => normalizeMahjongType(type));
  const matchIds = await periodMatchIdsForTypes(guildId, normalizedTypes, period, userId, tournamentName);
  const dateRange = periodDateRange(period);
  return getResultsByOptions({
    guildId,
    types: normalizedTypes,
    userId,
    tournamentName,
    playedAtStart: dateRange?.start,
    playedAtEnd: dateRange?.end,
    matchIds
  });
}

export async function getResultsForDateRange(
  guildId: string,
  types: MahjongType[],
  start: Date,
  end: Date,
  userId?: string,
  tournamentName?: string,
  excludeTournamentMatches = false
) {
  return getResultsByOptions({
    guildId,
    types,
    userId,
    tournamentName,
    playedAtStart: start,
    playedAtEnd: end,
    excludeTournamentMatches
  });
}

export async function aggregateStats(guildId: string, type: MahjongType, period: Period, userId: string, tournamentName?: string) {
  const normalizedType = normalizeMahjongType(type);
  const results = await getResultsForPeriod(guildId, type, period, userId, tournamentName);
  const totalGames = results.length;
  const totalPoint = results.reduce((sum, result) => sum + result.point, 0);
  const averageRank = totalGames ? results.reduce((sum, result) => sum + result.rank, 0) / totalGames : 0;
  const averagePoint = totalGames ? totalPoint / totalGames : 0;
  const maxRank = expectedPlayerCount(normalizedType);
  const rankCounts = new Map<number, number>();

  for (let rank = 1; rank <= maxRank; rank += 1) {
    rankCounts.set(rank, results.filter((result) => result.rank === rank).length);
  }

  return {
    results,
    totalGames,
    totalPoint,
    averageRank,
    averagePoint,
    rankCounts
  };
}

export async function aggregateHandStats(
  guildId: string,
  type: MahjongType,
  period: Period,
  userId: string,
  tournamentName?: string
): Promise<AggregatedHandStats> {
  const normalizedType = normalizeMahjongType(type);
  const matchIds = await periodMatchIdsForTypes(guildId, [type], period, userId, tournamentName);
  const dateRange = periodDateRange(period);
  const normalizedTournamentName = normalizeTournamentName(tournamentName);

  const [handRows, matchResults] = await Promise.all([
    prisma.handPlayerStat.findMany({
      where: {
        userId,
        hand: {
          endType: {
            in: ["AGARI", "RYUKYOKU"]
          },
          match: {
            guildId,
            type: normalizedType,
            tournamentName: normalizedTournamentName,
            matchId: matchIds ? { in: matchIds } : undefined,
            playedAt:
              dateRange
                ? {
                    gte: dateRange.start,
                    lt: dateRange.end
                  }
                : undefined
          }
        }
      },
      select: {
        hand: {
          select: {
            endType: true
          }
        },
        declaredRiichi: true,
        calledOpenMeld: true,
        won: true,
        wonByTsumo: true,
        dealtIn: true,
        isTenpaiAtRyukyoku: true,
        winScore: true,
        dealInScore: true,
        winOrder: true,
        isDama: true,
        ippatsuWin: true,
        uraDoraCount: true
      }
    }),
    getResultsByOptions({
      guildId,
      types: [normalizedType],
      userId,
      tournamentName,
      playedAtStart: dateRange?.start,
      playedAtEnd: dateRange?.end,
      matchIds
    })
  ]);

  return calculateHandStats(
    handRows.map((row) => ({
      endType: row.hand.endType,
      declaredRiichi: row.declaredRiichi,
      calledOpenMeld: row.calledOpenMeld,
      won: row.won,
      wonByTsumo: row.wonByTsumo,
      dealtIn: row.dealtIn,
      isTenpaiAtRyukyoku: row.isTenpaiAtRyukyoku,
      winScore: row.winScore,
      dealInScore: row.dealInScore,
      winOrder: row.winOrder,
      isDama: row.isDama,
      ippatsuWin: row.ippatsuWin,
      uraDoraCount: row.uraDoraCount
    })),
    {
      totalGames: matchResults.length,
      bustCount: matchResults.filter((result) => result.rawScore < 0).length
    }
  );
}

export async function ranking(guildId: string, type: MahjongType, period: Period, tournamentName?: string) {
  const results = await getResultsForPeriod(guildId, type, period, undefined, tournamentName);
  return buildRankingFromResults(results);
}

export async function rankingByTypes(
  guildId: string,
  types: MahjongType[],
  period: Period,
  tournamentName?: string
) {
  const results = await getResultsForPeriodByTypes(guildId, types, period, undefined, tournamentName);
  return buildRankingFromResults(results);
}

export function buildMvpRankingFromResults(
  results: Awaited<ReturnType<typeof getResultsForPeriodByTypes>>,
  bonusByUser = new Map<string, number>()
): MvpRankingEntry[] {
  const grouped = new Map<
    string,
    { userId: string; games: number; rawTotalPoint: number; rankSum: number; games3p: number; games4p: number }
  >();

  for (const result of results) {
    const current = grouped.get(result.userId) ?? {
      userId: result.userId,
      games: 0,
      rawTotalPoint: 0,
      rankSum: 0,
      games3p: 0,
      games4p: 0
    };
    current.games += 1;
    current.rawTotalPoint += result.point;
    current.rankSum += result.rank;
    if (result.match.type === "3p") {
      current.games3p += 1;
    } else if (result.match.type === "4p") {
      current.games4p += 1;
    }
    grouped.set(result.userId, current);
  }

  return [...grouped.values()]
    .map((entry) => {
      const penaltyPoint = seasonPenalty(entry.games4p, entry.games3p);
      const bonusPoint = bonusByUser.get(entry.userId) ?? 0;
      return {
        userId: entry.userId,
        games: entry.games,
        totalPoint: entry.rawTotalPoint + bonusPoint - penaltyPoint,
        rawTotalPoint: entry.rawTotalPoint + bonusPoint,
        adjustedTotalPoint: entry.rawTotalPoint + bonusPoint - penaltyPoint,
        penaltyPoint,
        games3p: entry.games3p,
        games4p: entry.games4p,
        rankSum: entry.rankSum,
        averageRank: entry.rankSum / entry.games,
        averagePoint: entry.rawTotalPoint / entry.games
      };
    })
    .sort(
      (a, b) =>
        b.adjustedTotalPoint - a.adjustedTotalPoint ||
        b.rawTotalPoint - a.rawTotalPoint ||
        a.averageRank - b.averageRank ||
        a.userId.localeCompare(b.userId)
    );
}

export function buildRankingFromResults(results: Awaited<ReturnType<typeof getResultsForPeriod>>): RankingEntry[] {
  const grouped = new Map<string, { userId: string; games: number; totalPoint: number; rankSum: number }>();

  for (const result of results) {
    const current = grouped.get(result.userId) ?? {
      userId: result.userId,
      games: 0,
      totalPoint: 0,
      rankSum: 0
    };
    current.games += 1;
    current.totalPoint += result.point;
    current.rankSum += result.rank;
    grouped.set(result.userId, current);
  }

  return [...grouped.values()]
    .map((entry) => ({
      ...entry,
      averageRank: entry.rankSum / entry.games,
      averagePoint: entry.totalPoint / entry.games
    }))
    .sort((a, b) => b.totalPoint - a.totalPoint || b.averagePoint - a.averagePoint || a.userId.localeCompare(b.userId));
}

export async function rankingForDateRange(
  guildId: string,
  type: MahjongType,
  start: Date,
  end: Date,
  tournamentName?: string
) {
  const results = await getResultsForDateRange(guildId, [type], start, end, undefined, tournamentName);
  return buildRankingFromResults(results);
}

export async function rankingForDateRangeByTypes(
  guildId: string,
  types: MahjongType[],
  start: Date,
  end: Date,
  tournamentName?: string
) {
  const results = await getResultsForDateRange(guildId, types, start, end, undefined, tournamentName);
  return buildRankingFromResults(results);
}

export async function rankingWithLatestMatchDeltaForDateRange(
  guildId: string,
  type: MahjongType,
  start: Date,
  end: Date,
  tournamentName?: string
) {
  return rankingWithLatestMatchDeltaForDateRangeByTypes(guildId, [type], start, end, tournamentName);
}

export async function rankingWithLatestMatchDeltaForDateRangeByTypes(
  guildId: string,
  types: MahjongType[],
  start: Date,
  end: Date,
  tournamentName?: string
) {
  const normalizedTypes = types.map((type) => normalizeMahjongType(type));
  const normalizedTournamentName = normalizeTournamentName(tournamentName);
  const latestMatch = await prisma.match.findFirst({
    where: {
      guildId,
      type: {
        in: normalizedTypes
      },
      tournamentName: normalizedTournamentName,
      playedAt: {
        gte: start,
        lt: end
      }
    },
    orderBy: [
      {
        playedAt: "desc"
      },
      {
        createdAt: "desc"
      }
    ],
    select: {
      matchId: true
    }
  });

  const results = await getResultsForDateRange(guildId, normalizedTypes, start, end, undefined, tournamentName);
  const current = buildRankingFromResults(results);
  if (!latestMatch) {
    return {
      current,
      previous: [],
      latestMatchId: null
    };
  }

  const previous = buildRankingFromResults(results.filter((result) => result.match.matchId !== latestMatch.matchId));
  return {
    current,
    previous,
    latestMatchId: latestMatch.matchId
  };
}

export async function resultsWithLatestMatchDeltaForDateRangeByTypes(
  guildId: string,
  types: MahjongType[],
  start: Date,
  end: Date,
  tournamentName?: string
) {
  const normalizedTypes = types.map((type) => normalizeMahjongType(type));
  const normalizedTournamentName = normalizeTournamentName(tournamentName);
  const latestMatch = await prisma.match.findFirst({
    where: {
      guildId,
      type: {
        in: normalizedTypes
      },
      tournamentName: normalizedTournamentName,
      playedAt: {
        gte: start,
        lt: end
      }
    },
    orderBy: [
      {
        playedAt: "desc"
      },
      {
        createdAt: "desc"
      }
    ],
    select: {
      matchId: true
    }
  });

  const currentResults = await getResultsForDateRange(guildId, normalizedTypes, start, end, undefined, tournamentName);
  return {
    currentResults,
    previousResults: latestMatch
      ? currentResults.filter((result) => result.match.matchId !== latestMatch.matchId)
      : [],
    latestMatchId: latestMatch?.matchId ?? null
  };
}

export async function records(guildId: string, type: MahjongType, period: Period, tournamentName?: string) {
  const normalizedType = normalizeMahjongType(type);
  const results = await getResultsForPeriod(guildId, type, period, undefined, tournamentName);
  const handRecords =
    normalizedType === "4p"
      ? await prisma.handPlayerStat.findMany({
          where: {
            hand: {
              match: {
                guildId,
                type: normalizedType,
                tournamentName: normalizeTournamentName(tournamentName),
                matchId: {
                  in: [...new Set(results.map((result) => result.match.matchId))]
                }
              }
            }
          },
          select: {
            userId: true,
            won: true,
            dealtIn: true,
            winScore: true
          }
        })
      : [];
  return calculateRecords(normalizedType, results, 5, handRecords);
}

export async function recordsForDateRange(
  guildId: string,
  type: MahjongType,
  start: Date,
  end: Date,
  tournamentName?: string
) {
  const normalizedType = normalizeMahjongType(type);
  const results = await getResultsForDateRange(guildId, [normalizedType], start, end, undefined, tournamentName);
  const handRecords =
    normalizedType === "4p"
      ? await prisma.handPlayerStat.findMany({
          where: {
            hand: {
              match: {
                guildId,
                type: normalizedType,
                tournamentName: normalizeTournamentName(tournamentName),
                matchId: {
                  in: [...new Set(results.map((result) => result.match.matchId))]
                }
              }
            }
          },
          select: {
            userId: true,
            won: true,
            dealtIn: true,
            winScore: true
          }
        })
      : [];
  return calculateRecords(normalizedType, results, 5, handRecords);
}

export async function seasonAwards(guildId: string, season: SeasonWindow) {
  const [results, fourPlayerResults, fourPlayerHands, bonuses] = await Promise.all([
    getResultsForDateRange(guildId, ["3p", "4p"], season.start, season.end, undefined, undefined, true),
    getResultsForDateRange(guildId, ["4p"], season.start, season.end, undefined, undefined, true),
    prisma.handPlayerStat.findMany({
      where: {
        hand: {
          match: {
            guildId,
            type: "4p",
            tournamentName: null,
            playedAt: {
              gte: season.start,
              lt: season.end
            }
          }
        }
      },
      select: {
        userId: true,
        won: true,
        dealtIn: true,
        winScore: true
      }
    }),
    getSeasonBonuses(guildId, season, ["3p", "4p"])
  ]);
  const bonusByUser = buildSeasonBonusMap(bonuses);
  return calculateSeasonAwards(results, fourPlayerResults, fourPlayerHands, 5, bonusByUser);
}

export async function deleteMatch(guildId: string, matchId: string) {
  return prisma.match.deleteMany({
    where: {
      matchId,
      guildId
    }
  });
}

export async function listMatches(guildId: string, count: number, type?: MahjongType, tournamentName?: string) {
  const normalizedTournamentName = normalizeTournamentName(tournamentName);
  return prisma.match.findMany({
    where: {
      guildId,
      type: type ? normalizeMahjongType(type) : undefined,
      tournamentName: normalizedTournamentName
    },
    orderBy: [
      {
        playedAt: "desc"
      },
      {
        createdAt: "desc"
      }
    ],
    take: count,
    include: {
      externalMatch: true,
      results: {
        orderBy: {
          rank: "asc"
        }
      }
    }
  });
}

export async function latestMatch(guildId: string) {
  return prisma.match.findFirst({
    where: {
      guildId
    },
    orderBy: {
      playedAt: "desc"
    },
    include: {
      results: {
        orderBy: {
          rank: "asc"
        }
      }
    }
  });
}
