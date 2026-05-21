CREATE TYPE "HandEndType" AS ENUM ('AGARI', 'RYUKYOKU', 'ABORTIVE', 'FORCED_END');

CREATE TABLE "hands" (
  "hand_id" TEXT NOT NULL,
  "match_id" TEXT NOT NULL,
  "hand_index" INTEGER NOT NULL,
  "round_wind" TEXT NOT NULL,
  "round_number" INTEGER NOT NULL,
  "honba" INTEGER NOT NULL DEFAULT 0,
  "kyotaku" INTEGER NOT NULL DEFAULT 0,
  "dealer_user_id" TEXT,
  "end_type" "HandEndType" NOT NULL,
  "abort_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "hands_pkey" PRIMARY KEY ("hand_id")
);

CREATE TABLE "hand_player_stats" (
  "hand_player_stat_id" TEXT NOT NULL,
  "hand_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "seat" INTEGER,
  "start_score" INTEGER,
  "end_score" INTEGER,
  "is_tenpai_at_ryukyoku" BOOLEAN,
  "declared_riichi" BOOLEAN NOT NULL DEFAULT false,
  "called_open_meld" BOOLEAN NOT NULL DEFAULT false,
  "won" BOOLEAN NOT NULL DEFAULT false,
  "won_by_tsumo" BOOLEAN NOT NULL DEFAULT false,
  "dealt_in" BOOLEAN NOT NULL DEFAULT false,
  "win_score" INTEGER,
  "deal_in_score" INTEGER,
  "win_order" INTEGER,
  "is_dama" BOOLEAN,
  "ippatsu_win" BOOLEAN,
  "ura_dora_count" INTEGER,

  CONSTRAINT "hand_player_stats_pkey" PRIMARY KEY ("hand_player_stat_id")
);

CREATE UNIQUE INDEX "hands_match_id_hand_index_key" ON "hands" ("match_id", "hand_index");
CREATE INDEX "hands_match_id_round_wind_round_number_idx" ON "hands" ("match_id", "round_wind", "round_number");
CREATE INDEX "hands_dealer_user_id_idx" ON "hands" ("dealer_user_id");

CREATE UNIQUE INDEX "hand_player_stats_hand_id_user_id_key" ON "hand_player_stats" ("hand_id", "user_id");
CREATE INDEX "hand_player_stats_user_id_idx" ON "hand_player_stats" ("user_id");
CREATE INDEX "hand_player_stats_won_dealt_in_idx" ON "hand_player_stats" ("won", "dealt_in");

ALTER TABLE "hands"
  ADD CONSTRAINT "hands_match_id_fkey"
  FOREIGN KEY ("match_id") REFERENCES "matches"("match_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hand_player_stats"
  ADD CONSTRAINT "hand_player_stats_hand_id_fkey"
  FOREIGN KEY ("hand_id") REFERENCES "hands"("hand_id")
  ON DELETE CASCADE ON UPDATE CASCADE;
