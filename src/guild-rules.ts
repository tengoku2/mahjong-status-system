import type { MahjongType } from "./types.js";

export type GuildProfile = "hakuhokai" | "standard";

export interface GuildRules {
  profile: GuildProfile;
  displayName: string;
  useMvpRanking: boolean;
  defaultRankType: MahjongType;
  mvpTypes: MahjongType[];
  useSeasonPenalty: boolean;
  useSeasonLock: boolean;
  useSeasonBonus: boolean;
  awardsEnabled: boolean;
}

export const HAKUHOKAI_GUILD_ID = "1499090620373929984";
export const MADOROMI_GUILD_ID = "1479381180146257950";

const standardRules: GuildRules = {
  profile: "standard",
  displayName: "standard",
  useMvpRanking: false,
  defaultRankType: "4p",
  mvpTypes: ["3p", "4p"],
  useSeasonPenalty: false,
  useSeasonLock: false,
  useSeasonBonus: false,
  awardsEnabled: false
};

const hakuhokaiRules: GuildRules = {
  profile: "hakuhokai",
  displayName: "白鳳会",
  useMvpRanking: true,
  defaultRankType: "4p",
  mvpTypes: ["3p", "4p"],
  useSeasonPenalty: true,
  useSeasonLock: true,
  useSeasonBonus: true,
  awardsEnabled: true
};

const rulesByGuildId = new Map<string, GuildRules>([
  [HAKUHOKAI_GUILD_ID, hakuhokaiRules],
  [MADOROMI_GUILD_ID, standardRules]
]);

export function guildRulesFor(guildId: string): GuildRules {
  return rulesByGuildId.get(guildId) ?? standardRules;
}
