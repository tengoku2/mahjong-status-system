CREATE TABLE "season_lock_settings" (
    "guild_id" TEXT NOT NULL,
    "admin_channel_id" TEXT,
    "unlocked_season_code" TEXT,
    "unlocked_season_year" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "season_lock_settings_pkey" PRIMARY KEY ("guild_id"),
    CONSTRAINT "season_lock_settings_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("guild_id") ON DELETE CASCADE ON UPDATE CASCADE
);
