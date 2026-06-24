CREATE TYPE "GameType" AS ENUM ('4p_hanchan', '3p_hanchan', '4p_tonpu', '3p_tonpu');
CREATE TYPE "EventKind" AS ENUM ('NORMAL', 'TOURNAMENT', 'LEAGUE', 'TEST');
CREATE TYPE "EventStatus" AS ENUM ('ACTIVE', 'CLOSED', 'ARCHIVED');
CREATE TYPE "TieBreakType" AS ENUM ('SEAT_ORDER', 'SPLIT_UMA');
CREATE TYPE "RoundExtension" AS ENUM ('NONE', 'SOUTH', 'WEST');

CREATE TABLE "rule_sets" (
    "rule_set_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "game_type" "GameType" NOT NULL,
    "start_score" INTEGER NOT NULL,
    "return_score" INTEGER NOT NULL,
    "uma" JSONB NOT NULL,
    "allow_bust" BOOLEAN NOT NULL,
    "bust_threshold" INTEGER,
    "allow_agari_yame" BOOLEAN NOT NULL,
    "round_extension" "RoundExtension" NOT NULL,
    "tie_break_type" "TieBreakType" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rule_sets_pkey" PRIMARY KEY ("rule_set_id")
);

CREATE TABLE "events" (
    "event_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "rule_set_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "EventKind" NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'ACTIVE',
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("event_id")
);

CREATE TABLE "adjustments" (
    "adjustment_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "game_type" "GameType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "adjustments_pkey" PRIMARY KEY ("adjustment_id")
);

ALTER TABLE "matches"
  ADD COLUMN "game_type" "GameType",
  ADD COLUMN "event_id" TEXT,
  ADD COLUMN "rule_set_id" TEXT,
  ADD COLUMN "aborted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "abort_reason" TEXT;

ALTER TABLE "results"
  ADD COLUMN "seat" INTEGER;

CREATE UNIQUE INDEX "rule_sets_guild_id_name_key" ON "rule_sets"("guild_id", "name");
CREATE INDEX "rule_sets_guild_id_game_type_is_active_idx" ON "rule_sets"("guild_id", "game_type", "is_active");

CREATE UNIQUE INDEX "events_guild_id_name_key" ON "events"("guild_id", "name");
CREATE INDEX "events_guild_id_kind_status_idx" ON "events"("guild_id", "kind", "status");
CREATE INDEX "events_guild_id_rule_set_id_idx" ON "events"("guild_id", "rule_set_id");

CREATE INDEX "adjustments_guild_id_event_id_game_type_idx" ON "adjustments"("guild_id", "event_id", "game_type");
CREATE INDEX "adjustments_guild_id_user_id_game_type_idx" ON "adjustments"("guild_id", "user_id", "game_type");
CREATE INDEX "adjustments_deleted_at_idx" ON "adjustments"("deleted_at");

CREATE INDEX "matches_guild_id_game_type_played_at_idx" ON "matches"("guild_id", "game_type", "played_at");
CREATE INDEX "matches_guild_id_event_id_game_type_played_at_idx" ON "matches"("guild_id", "event_id", "game_type", "played_at");
CREATE INDEX "matches_guild_id_rule_set_id_played_at_idx" ON "matches"("guild_id", "rule_set_id", "played_at");

ALTER TABLE "rule_sets"
  ADD CONSTRAINT "rule_sets_guild_id_fkey"
  FOREIGN KEY ("guild_id") REFERENCES "guilds"("guild_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "events"
  ADD CONSTRAINT "events_guild_id_fkey"
  FOREIGN KEY ("guild_id") REFERENCES "guilds"("guild_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "events"
  ADD CONSTRAINT "events_rule_set_id_fkey"
  FOREIGN KEY ("rule_set_id") REFERENCES "rule_sets"("rule_set_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "adjustments"
  ADD CONSTRAINT "adjustments_guild_id_fkey"
  FOREIGN KEY ("guild_id") REFERENCES "guilds"("guild_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "adjustments"
  ADD CONSTRAINT "adjustments_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("event_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "matches"
  ADD CONSTRAINT "matches_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("event_id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "matches"
  ADD CONSTRAINT "matches_rule_set_id_fkey"
  FOREIGN KEY ("rule_set_id") REFERENCES "rule_sets"("rule_set_id")
  ON DELETE SET NULL ON UPDATE CASCADE;
