import type { Prisma } from "@prisma/client";
import { calculateResults } from "./scoring.js";
import { calendarStart, recentLimit } from "./periods.js";
import { prisma } from "./prisma.js";
import type { MahjongType, Period, PlayerInput } from "./types.js";

export interface ExternalMatchIdentity {
  externalSource: string;
  externalMatchId: string;
}

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

export async function createMatch(
  guildId: string,
  type: MahjongType,
  players: PlayerInput[],
  tournamentName?: string,
  playedAt?: Date
) {
  const calculated = calculateResults(type, players);
  const normalizedTournamentName = normalizeTournamentName(tournamentName);

  return prisma.$transaction(async (tx) => {
    await ensureGuildAndUsers(guildId, calculated.map((player) => player.userId), tx);

    return tx.match.create({
      data: {
        guildId,
        type,
        tournamentName: normalizedTournamentName,
        playedAt,
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
  });
}

export async function createExternalMatch(
  guildId: string,
  type: MahjongType,
  players: PlayerInput[],
  tournamentName: string | undefined,
  playedAt: Date | undefined,
  identity: ExternalMatchIdentity
) {
  const calculated = calculateResults(type, players);
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

    await ensureGuildAndUsers(guildId, calculated.map((player) => player.userId), tx);

    const match = await tx.match.create({
      data: {
        guildId,
        type,
        tournamentName: normalizedTournamentName,
        playedAt,
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
  });
}

export function normalizeTournamentName(value?: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

async function periodMatchIds(
  guildId: string,
  type: MahjongType,
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
      type,
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

export async function getResultsForPeriod(
  guildId: string,
  type: MahjongType,
  period: Period,
  userId?: string,
  tournamentName?: string
) {
  const normalizedTournamentName = normalizeTournamentName(tournamentName);
  const matchIds = await periodMatchIds(guildId, type, period, userId, normalizedTournamentName);
  const start = calendarStart(period);

  return prisma.result.findMany({
    where: {
      userId,
      match: {
        guildId,
        type,
        tournamentName: normalizedTournamentName,
        matchId: matchIds ? { in: matchIds } : undefined,
        playedAt: start ? { gte: start } : undefined
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

export async function aggregateStats(guildId: string, type: MahjongType, period: Period, userId: string, tournamentName?: string) {
  const results = await getResultsForPeriod(guildId, type, period, userId, tournamentName);
  const totalGames = results.length;
  const totalPoint = results.reduce((sum, result) => sum + result.point, 0);
  const averageRank = totalGames ? results.reduce((sum, result) => sum + result.rank, 0) / totalGames : 0;
  const averagePoint = totalGames ? totalPoint / totalGames : 0;
  const maxRank = type === "4p" ? 4 : 3;
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

export async function ranking(guildId: string, type: MahjongType, period: Period, tournamentName?: string) {
  const results = await getResultsForPeriod(guildId, type, period, undefined, tournamentName);
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
    .sort((a, b) => b.totalPoint - a.totalPoint);
}

export async function deleteMatch(guildId: string, matchId: string) {
  return prisma.match.deleteMany({
    where: {
      matchId,
      guildId
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
