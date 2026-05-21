import type { HandEndType } from "./types.js";

export interface HandStatRow {
  endType: HandEndType;
  declaredRiichi: boolean;
  calledOpenMeld: boolean;
  won: boolean;
  wonByTsumo: boolean;
  dealtIn: boolean;
  isTenpaiAtRyukyoku: boolean | null;
  winScore: number | null;
  dealInScore: number | null;
  winOrder: number | null;
  isDama: boolean | null;
  ippatsuWin: boolean | null;
  uraDoraCount: number | null;
}

export interface HandStatsSummary {
  totalHands: number;
  totalGames: number;
  bustCount: number;
  winCount: number;
  damaWinCount: number;
  callCount: number;
  averageWinScore: number | null;
  bustRate: number | null;
  dealInCount: number;
  drawCount: number;
  riichiCount: number;
  averageDealInScore: number | null;
  ippatsuRate: number | null;
  averageUraDoraCount: number | null;
  averageWinOrder: number | null;
  winRate: number | null;
  dealInRate: number | null;
  drawRate: number | null;
  callRate: number | null;
  riichiRate: number | null;
  damaRate: number | null;
  tsumoWinCount: number;
  tsumoRate: number | null;
  ryukyokuParticipationCount: number;
  ryukyokuTenpaiCount: number;
  ryukyokuTenpaiRate: number | null;
}

interface HandStatsOptions {
  totalGames: number;
  bustCount: number;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function average(total: number, denominator: number): number | null {
  return denominator > 0 ? total / denominator : null;
}

export function calculateHandStats(rows: HandStatRow[], options: HandStatsOptions): HandStatsSummary {
  const totalHands = rows.length;
  const winRows = rows.filter((row) => row.won);
  const winCount = winRows.length;
  const damaWinCount = winRows.filter((row) => row.isDama === true).length;
  const callCount = rows.filter((row) => row.calledOpenMeld).length;
  const dealInRows = rows.filter((row) => row.dealtIn);
  const dealInCount = dealInRows.length;
  const drawRows = rows.filter((row) => row.endType === "RYUKYOKU");
  const drawCount = drawRows.length;
  const riichiCount = rows.filter((row) => row.declaredRiichi).length;
  const tsumoWinCount = winRows.filter((row) => row.wonByTsumo).length;
  const ryukyokuParticipationCount = drawRows.length;
  const ryukyokuTenpaiCount = drawRows.filter((row) => row.isTenpaiAtRyukyoku === true).length;
  const ippatsuWinCount = winRows.filter((row) => row.ippatsuWin === true).length;
  const winScoreTotal = winRows.reduce((sum, row) => sum + (row.winScore ?? 0), 0);
  const dealInScoreTotal = dealInRows.reduce((sum, row) => sum + (row.dealInScore ?? 0), 0);
  const winOrderTotal = winRows.reduce((sum, row) => sum + (row.winOrder ?? 0), 0);
  const uraDoraTotal = winRows.reduce((sum, row) => sum + (row.uraDoraCount ?? 0), 0);

  return {
    totalHands,
    totalGames: options.totalGames,
    bustCount: options.bustCount,
    winCount,
    damaWinCount,
    callCount,
    averageWinScore: average(winScoreTotal, winCount),
    bustRate: ratio(options.bustCount, options.totalGames),
    dealInCount,
    drawCount,
    riichiCount,
    averageDealInScore: average(dealInScoreTotal, dealInCount),
    ippatsuRate: ratio(ippatsuWinCount, winCount),
    averageUraDoraCount: average(uraDoraTotal, winCount),
    averageWinOrder: average(winOrderTotal, winCount),
    winRate: ratio(winCount, totalHands),
    dealInRate: ratio(dealInCount, totalHands),
    drawRate: ratio(drawCount, totalHands),
    callRate: ratio(callCount, totalHands),
    riichiRate: ratio(riichiCount, totalHands),
    damaRate: ratio(damaWinCount, winCount),
    tsumoWinCount,
    tsumoRate: ratio(tsumoWinCount, winCount),
    ryukyokuParticipationCount,
    ryukyokuTenpaiCount,
    ryukyokuTenpaiRate: ratio(ryukyokuTenpaiCount, ryukyokuParticipationCount)
  };
}
