import { describe, expect, it } from "vitest";
import { guildRulesFor, HAKUHOKAI_GUILD_ID, MADOROMI_GUILD_ID } from "../src/guild-rules.js";

describe("guild rules", () => {
  it("keeps Hakuhokai-specific season features enabled", () => {
    const rules = guildRulesFor(HAKUHOKAI_GUILD_ID);

    expect(rules.profile).toBe("hakuhokai");
    expect(rules.useMvpRanking).toBe(true);
    expect(rules.useSeasonPenalty).toBe(true);
    expect(rules.useSeasonLock).toBe(true);
    expect(rules.useSeasonBonus).toBe(true);
    expect(rules.useSeasonWindows).toBe(true);
    expect(rules.defaultLeaderboardPeriod).toBe("current_season");
    expect(rules.awardsEnabled).toBe(true);
  });

  it("uses standard ranking rules for Madoromi and unknown guilds", () => {
    for (const guildId of [MADOROMI_GUILD_ID, "unknown-guild"]) {
      const rules = guildRulesFor(guildId);

      expect(rules.profile).toBe("standard");
      expect(rules.defaultRankType).toBe("4p");
      expect(rules.useMvpRanking).toBe(false);
      expect(rules.useSeasonPenalty).toBe(false);
      expect(rules.useSeasonLock).toBe(false);
      expect(rules.useSeasonBonus).toBe(false);
      expect(rules.useSeasonWindows).toBe(false);
      expect(rules.defaultLeaderboardPeriod).toBe("all");
      expect(rules.awardsEnabled).toBe(false);
    }
  });
});
