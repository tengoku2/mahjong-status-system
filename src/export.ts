import { AttachmentBuilder } from "discord.js";
import { buildRankingFromResults, getResultsForDateRange } from "./services.js";
import { prisma } from "./prisma.js";
import { calculateRankMovements, type RankMovement } from "./rank-movement.js";
import type { SeasonWindow } from "./periods.js";
import type { MahjongType } from "./types.js";

type ExportableResult = Awaited<ReturnType<typeof getResultsForDateRange>>[number];

interface MatchSummary {
  matchId: string;
  playedAt: Date;
  createdAt: Date;
  type: MahjongType;
  tournamentName: string | null;
}

export interface ResultCsvRow {
  played_at: string;
  match_id: string;
  type: MahjongType;
  tournament_name: string;
  season_code: string;
  season_year: number;
  user_id: string;
  display_name: string;
  rank: number;
  raw_score: number;
  point: string;
}

export interface RankSnapshotCsvRow {
  snapshot_match_id: string;
  snapshot_played_at: string;
  type: MahjongType;
  trigger_tournament_name: string;
  season_code: string;
  season_year: number;
  user_id: string;
  display_name: string;
  rank_position: number;
  games: number;
  total_point: string;
  average_rank: string;
  average_point: string;
  movement: RankMovement;
}

export interface SeasonExportBundle {
  resultRows: ResultCsvRow[];
  rankSnapshotRows: RankSnapshotCsvRow[];
  resultCsv: string;
  rankSnapshotsCsv: string;
  resultFileName: string;
  rankSnapshotFileName: string;
}

const exportTypes: MahjongType[] = ["4p", "3p", "4p_east", "3p_east"];

export async function buildSeasonExportBundle(guildId: string, season: SeasonWindow): Promise<SeasonExportBundle> {
  const results = await getResultsForDateRange(guildId, exportTypes, season.start, season.end);
  const displayNames = await loadDisplayNames(guildId, [...new Set(results.map((result) => result.userId))]);
  const resultRows = buildResultCsvRows(results, displayNames, season);
  const rankSnapshotRows = buildRankSnapshotCsvRows(results, displayNames, season);
  const token = `${season.code}_${season.seasonYear}`;

  return {
    resultRows,
    rankSnapshotRows,
    resultCsv: serializeCsv(resultRows, [
      "played_at",
      "match_id",
      "type",
      "tournament_name",
      "season_code",
      "season_year",
      "user_id",
      "display_name",
      "rank",
      "raw_score",
      "point"
    ]),
    rankSnapshotsCsv: serializeCsv(rankSnapshotRows, [
      "snapshot_match_id",
      "snapshot_played_at",
      "type",
      "trigger_tournament_name",
      "season_code",
      "season_year",
      "user_id",
      "display_name",
      "rank_position",
      "games",
      "total_point",
      "average_rank",
      "average_point",
      "movement"
    ]),
    resultFileName: `mjs_results_${token}.csv`,
    rankSnapshotFileName: `mjs_rank_snapshots_${token}.csv`
  };
}

export function buildResultCsvRows(
  results: ExportableResult[],
  displayNames: Map<string, string>,
  season: Pick<SeasonWindow, "code" | "seasonYear">
): ResultCsvRow[] {
  return [...results]
    .sort(compareResultsAscending)
    .map((result) => ({
      played_at: result.match.playedAt.toISOString(),
      match_id: result.match.matchId,
      type: result.match.type as MahjongType,
      tournament_name: result.match.tournamentName ?? "",
      season_code: season.code,
      season_year: season.seasonYear,
      user_id: result.userId,
      display_name: displayNames.get(result.userId) ?? result.userId,
      rank: result.rank,
      raw_score: result.rawScore,
      point: result.point.toFixed(1)
    }));
}

export function buildRankSnapshotCsvRows(
  results: ExportableResult[],
  displayNames: Map<string, string>,
  season: Pick<SeasonWindow, "code" | "seasonYear">
): RankSnapshotCsvRow[] {
  const matchesByType = new Map<MahjongType, Array<{ match: MatchSummary; results: ExportableResult[] }>>();

  for (const result of [...results].sort(compareResultsAscending)) {
    const type = result.match.type as MahjongType;
    const matches = matchesByType.get(type) ?? [];
    const current = matches.at(-1);
    if (current && current.match.matchId === result.match.matchId) {
      current.results.push(result);
    } else {
      matches.push({
        match: {
          matchId: result.match.matchId,
          playedAt: result.match.playedAt,
          createdAt: result.match.createdAt,
          type,
          tournamentName: result.match.tournamentName ?? null
        },
        results: [result]
      });
    }
    matchesByType.set(type, matches);
  }

  const rows: RankSnapshotCsvRow[] = [];

  for (const [type, matches] of matchesByType.entries()) {
    let cumulative: ExportableResult[] = [];
    for (const { match, results: matchResults } of matches) {
      const previousRanking = buildRankingFromResults(cumulative);
      cumulative = [...cumulative, ...matchResults];
      const currentRanking = buildRankingFromResults(cumulative);
      const movements = calculateRankMovements(currentRanking, previousRanking, true);

      for (const [index, entry] of currentRanking.entries()) {
        rows.push({
          snapshot_match_id: match.matchId,
          snapshot_played_at: match.playedAt.toISOString(),
          type,
          trigger_tournament_name: match.tournamentName ?? "",
          season_code: season.code,
          season_year: season.seasonYear,
          user_id: entry.userId,
          display_name: displayNames.get(entry.userId) ?? entry.userId,
          rank_position: index + 1,
          games: entry.games,
          total_point: entry.totalPoint.toFixed(1),
          average_rank: entry.averageRank.toFixed(2),
          average_point: entry.averagePoint.toFixed(1),
          movement: movements.get(entry.userId) ?? "same"
        });
      }
    }
  }

  return rows;
}

export function serializeCsv<T extends object>(rows: T[], headers: Array<keyof T>): string {
  const lines = [headers.join(",")];

  for (const row of rows) {
    lines.push(headers.map((header) => escapeCsvValue(row[header] as string | number)).join(","));
  }

  return lines.join("\n");
}

export function csvAttachment(name: string, content: string): AttachmentBuilder {
  return new AttachmentBuilder(Buffer.from(`\uFEFF${content}`, "utf8"), { name });
}

async function loadDisplayNames(guildId: string, userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) {
    return new Map();
  }

  const profiles = await prisma.userProfile.findMany({
    where: {
      guildId,
      userId: {
        in: userIds
      }
    }
  });

  const displayNames = new Map<string, string>();
  for (const profile of profiles) {
    displayNames.set(profile.userId, profile.vrcName);
  }

  for (const userId of userIds) {
    if (!displayNames.has(userId)) {
      displayNames.set(userId, userId);
    }
  }

  return displayNames;
}

function compareResultsAscending(a: ExportableResult, b: ExportableResult): number {
  return (
    a.match.playedAt.getTime() - b.match.playedAt.getTime() ||
    a.match.createdAt.getTime() - b.match.createdAt.getTime() ||
    a.match.matchId.localeCompare(b.match.matchId) ||
    a.rank - b.rank
  );
}

function escapeCsvValue(value: string | number): string {
  const text = String(value);
  if (!/[",\n]/.test(text)) {
    return text;
  }
  return `"${text.replaceAll("\"", "\"\"")}"`;
}
