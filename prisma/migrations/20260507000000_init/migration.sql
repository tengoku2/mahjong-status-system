CREATE TABLE "guilds" (
  "guild_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "guilds_pkey" PRIMARY KEY ("guild_id")
);

CREATE TABLE "users" (
  "guild_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_pkey" PRIMARY KEY ("guild_id", "user_id")
);

CREATE TABLE "user_profiles" (
  "guild_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "vrc_name" TEXT NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("guild_id", "user_id")
);

CREATE TABLE "matches" (
  "match_id" TEXT NOT NULL,
  "guild_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "tournament_name" TEXT,
  "played_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "matches_pkey" PRIMARY KEY ("match_id")
);

CREATE TABLE "results" (
  "result_id" TEXT NOT NULL,
  "match_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "rank" INTEGER NOT NULL,
  "raw_score" INTEGER NOT NULL,
  "point" DOUBLE PRECISION NOT NULL,
  CONSTRAINT "results_pkey" PRIMARY KEY ("result_id")
);

CREATE INDEX "matches_guild_id_type_played_at_idx" ON "matches" ("guild_id", "type", "played_at");
CREATE INDEX "matches_guild_id_type_tournament_name_played_at_idx" ON "matches" ("guild_id", "type", "tournament_name", "played_at");
CREATE INDEX "results_user_id_idx" ON "results" ("user_id");
CREATE UNIQUE INDEX "results_match_id_user_id_key" ON "results" ("match_id", "user_id");
CREATE UNIQUE INDEX "results_match_id_rank_key" ON "results" ("match_id", "rank");

ALTER TABLE "users" ADD CONSTRAINT "users_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds" ("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds" ("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "matches" ADD CONSTRAINT "matches_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds" ("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "results" ADD CONSTRAINT "results_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches" ("match_id") ON DELETE CASCADE ON UPDATE CASCADE;
