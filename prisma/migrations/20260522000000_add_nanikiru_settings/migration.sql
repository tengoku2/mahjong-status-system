CREATE TABLE "nanikiru_guild_settings" (
    "guild_id" TEXT NOT NULL,
    "question_channel_id" TEXT,
    "result_channel_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nanikiru_guild_settings_pkey" PRIMARY KEY ("guild_id")
);

CREATE TABLE "nanikiru_problems" (
    "question_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "hand" TEXT NOT NULL,
    "best_shanten" INTEGER NOT NULL,
    "shanten_filter" TEXT NOT NULL,
    "honor_tile_mode" TEXT NOT NULL,
    "question_channel_id" TEXT NOT NULL,
    "result_channel_id" TEXT,
    "message_id" TEXT NOT NULL,
    "closes_at" TIMESTAMP(3) NOT NULL,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nanikiru_problems_pkey" PRIMARY KEY ("question_id")
);

CREATE TABLE "nanikiru_answers" (
    "question_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tile" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nanikiru_answers_pkey" PRIMARY KEY ("question_id","user_id")
);

CREATE INDEX "nanikiru_problems_guild_id_closes_at_idx" ON "nanikiru_problems"("guild_id", "closes_at");
CREATE INDEX "nanikiru_problems_closed_at_closes_at_idx" ON "nanikiru_problems"("closed_at", "closes_at");

ALTER TABLE "nanikiru_guild_settings" ADD CONSTRAINT "nanikiru_guild_settings_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "nanikiru_problems" ADD CONSTRAINT "nanikiru_problems_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "nanikiru_answers" ADD CONSTRAINT "nanikiru_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "nanikiru_problems"("question_id") ON DELETE CASCADE ON UPDATE CASCADE;
