CREATE TABLE "MortalReview" (
  "id" TEXT PRIMARY KEY, "played_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "MortalBatch" (
  "id" TEXT PRIMARY KEY, "mode" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "MortalCandidate" (
  "id" TEXT PRIMARY KEY, "review_id" TEXT NOT NULL, "gap" DOUBLE PRECISION NOT NULL,
  "data" JSONB NOT NULL, "rule_version" TEXT NOT NULL, "batch_id" TEXT,
  "delivery" TEXT NOT NULL DEFAULT 'ready', "attempt_at" TIMESTAMP(3), "channel_id" TEXT,
  "result_channel_id" TEXT, "result_delivery" TEXT NOT NULL DEFAULT 'ready', "result_message_id" TEXT,
  "result_attempt_at" TIMESTAMP(3), "message_id" TEXT, "issued_at" TIMESTAMP(3), "closes_at" TIMESTAMP(3),
  "closed_at" TIMESTAMP(3), "close_synced" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MortalCandidate_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "MortalReview"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MortalCandidate_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "MortalBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MortalCandidate_message_id_key" ON "MortalCandidate"("message_id");
CREATE INDEX "MortalCandidate_review_id_idx" ON "MortalCandidate"("review_id");
CREATE INDEX "MortalCandidate_batch_id_issued_at_idx" ON "MortalCandidate"("batch_id", "issued_at");
CREATE INDEX "MortalCandidate_closes_at_close_synced_idx" ON "MortalCandidate"("closes_at", "close_synced");
CREATE TABLE "MortalAnswer" (
  "interaction_id" TEXT PRIMARY KEY, "candidate_id" TEXT NOT NULL, "user_id" TEXT NOT NULL,
  "tile" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MortalAnswer_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "MortalCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "MortalAnswer_candidate_id_user_id_created_at_idx" ON "MortalAnswer"("candidate_id", "user_id", "created_at");
CREATE TABLE "MortalFeedback" (
  "interaction_id" TEXT PRIMARY KEY, "candidate_id" TEXT NOT NULL, "user_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MortalFeedback_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "MortalCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "MortalFeedback_candidate_id_user_id_idx" ON "MortalFeedback"("candidate_id", "user_id");
