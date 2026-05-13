import { describe, expect, it } from "vitest";
import { buildRankSnapshotCsvRows, buildResultCsvRows, serializeCsv } from "../src/export.js";

type ExportableResult = Parameters<typeof buildResultCsvRows>[0][number];

function makeResult(input: {
  matchId: string;
  playedAt: Date;
  createdAt?: Date;
  type: "4p" | "3p" | "4p_east" | "3p_east";
  tournamentName?: string | null;
  userId: string;
  rank: number;
  rawScore: number;
  point: number;
}): ExportableResult {
  return {
    resultId: `${input.matchId}-${input.userId}`,
    matchId: input.matchId,
    userId: input.userId,
    rank: input.rank,
    rawScore: input.rawScore,
    point: input.point,
    match: {
      matchId: input.matchId,
      guildId: "guild-1",
      type: input.type,
      tournamentName: input.tournamentName ?? null,
      playedAt: input.playedAt,
      createdAt: input.createdAt ?? input.playedAt
    }
  } as ExportableResult;
}

describe("export", () => {
  it("builds season result rows in chronological order", () => {
    const displayNames = new Map([
      ["u1", "Alice"],
      ["u2", "Bob"]
    ]);
    const rows = buildResultCsvRows(
      [
        makeResult({
          matchId: "m2",
          playedAt: new Date("2026-03-02T12:00:00.000Z"),
          type: "4p",
          userId: "u2",
          rank: 1,
          rawScore: 35000,
          point: 45
        }),
        makeResult({
          matchId: "m1",
          playedAt: new Date("2026-03-01T12:00:00.000Z"),
          type: "4p",
          userId: "u1",
          rank: 1,
          rawScore: 40000,
          point: 50
        })
      ],
      displayNames,
      { code: "ranoh", seasonYear: 26 }
    );

    expect(rows.map((row) => row.match_id)).toEqual(["m1", "m2"]);
    expect(rows[0]).toMatchObject({
      season_code: "ranoh",
      season_year: 26,
      display_name: "Alice",
      point: "50.0"
    });
  });

  it("builds rank snapshots with same and new movements", () => {
    const displayNames = new Map([
      ["u1", "Alice"],
      ["u2", "Bob"],
      ["u3", "Carol"]
    ]);
    const rows = buildRankSnapshotCsvRows(
      [
        makeResult({
          matchId: "m1",
          playedAt: new Date("2026-03-01T12:00:00.000Z"),
          type: "4p",
          userId: "u1",
          rank: 1,
          rawScore: 40000,
          point: 50
        }),
        makeResult({
          matchId: "m1",
          playedAt: new Date("2026-03-01T12:00:00.000Z"),
          type: "4p",
          userId: "u2",
          rank: 2,
          rawScore: 30000,
          point: 10
        }),
        makeResult({
          matchId: "m2",
          playedAt: new Date("2026-03-02T12:00:00.000Z"),
          type: "4p",
          userId: "u3",
          rank: 1,
          rawScore: 45000,
          point: 60
        })
      ],
      displayNames,
      { code: "ranoh", seasonYear: 26 }
    );

    const firstMatchRows = rows.filter((row) => row.snapshot_match_id === "m1");
    expect(firstMatchRows).toHaveLength(2);
    expect(firstMatchRows.every((row) => row.movement === "same")).toBe(true);

    const secondMatchRows = rows.filter((row) => row.snapshot_match_id === "m2");
    const newRows = secondMatchRows.filter((row) => row.user_id === "u3");
    expect(newRows).toHaveLength(1);
    expect(newRows[0]?.movement).toBe("new");
  });

  it("serializes CSV with escaping", () => {
    const csv = serializeCsv(
      [
        {
          name: 'Alice "Ace"',
          tournament: "Spring, Cup"
        }
      ],
      ["name", "tournament"]
    );

    expect(csv).toBe('name,tournament\n"Alice ""Ace""","Spring, Cup"');
  });
});
