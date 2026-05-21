export type MahjongType = "3p" | "4p" | "3p_east" | "4p_east";
export type HandEndType = "AGARI" | "RYUKYOKU" | "ABORTIVE" | "FORCED_END";

export type Period =
  | "recent_5"
  | "recent_10"
  | "recent_50"
  | "recent_100"
  | "current_season"
  | "previous_season"
  | "month"
  | "three_months"
  | "half_year"
  | "year"
  | "all";

export type SeasonCode = "ranoh" | "chikuoh" | "kikuoh" | "baioh";

export interface PlayerInput {
  userId: string;
  rank: number;
  rawScore: number;
}

export interface CalculatedResult extends PlayerInput {
  point: number;
}

export interface HandPlayerStatInput {
  userId: string;
  seat?: number;
  startScore?: number;
  endScore?: number;
  isTenpaiAtRyukyoku?: boolean;
  declaredRiichi?: boolean;
  calledOpenMeld?: boolean;
  won?: boolean;
  wonByTsumo?: boolean;
  dealtIn?: boolean;
  winScore?: number;
  dealInScore?: number;
  winOrder?: number;
  isDama?: boolean;
  ippatsuWin?: boolean;
  uraDoraCount?: number;
}

export interface HandInput {
  handIndex: number;
  roundWind: string;
  roundNumber: number;
  honba?: number;
  kyotaku?: number;
  dealerUserId?: string;
  endType: HandEndType;
  abortReason?: string;
  playerStats: HandPlayerStatInput[];
}
