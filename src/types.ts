export type MahjongType = "3p" | "4p";

export type Period =
  | "recent_5"
  | "recent_10"
  | "recent_50"
  | "recent_100"
  | "month"
  | "three_months"
  | "half_year"
  | "year"
  | "all";

export interface PlayerInput {
  userId: string;
  rank: number;
  rawScore: number;
}

export interface CalculatedResult extends PlayerInput {
  point: number;
}
