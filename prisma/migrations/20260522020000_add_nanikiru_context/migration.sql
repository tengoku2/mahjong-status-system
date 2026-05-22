ALTER TABLE "nanikiru_problems" ADD COLUMN "best_discard_count" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "nanikiru_problems" ADD COLUMN "dora_tile" INTEGER;
ALTER TABLE "nanikiru_problems" ADD COLUMN "turn_number" INTEGER;
ALTER TABLE "nanikiru_problems" ADD COLUMN "seat_wind" TEXT;
ALTER TABLE "nanikiru_problems" ADD COLUMN "round_wind" TEXT;
