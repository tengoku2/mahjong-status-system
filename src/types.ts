export type MahjongType = "3p" | "4p" | "3p_east" | "4p_east";

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
