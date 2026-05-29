CREATE TABLE "season_bonuses" (
    "season_bonus_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "season_code" TEXT NOT NULL,
    "season_year" INTEGER NOT NULL,
    "target" TEXT NOT NULL,
    "point" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "season_bonuses_pkey" PRIMARY KEY ("season_bonus_id")
);

CREATE INDEX "season_bonuses_guild_id_type_season_code_season_year_idx" ON "season_bonuses"("guild_id", "type", "season_code", "season_year");
CREATE INDEX "season_bonuses_guild_id_user_id_season_code_season_year_idx" ON "season_bonuses"("guild_id", "user_id", "season_code", "season_year");

ALTER TABLE "season_bonuses" ADD CONSTRAINT "season_bonuses_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;
