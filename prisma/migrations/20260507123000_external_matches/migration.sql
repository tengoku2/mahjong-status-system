-- CreateTable
CREATE TABLE "external_matches" (
    "external_source" TEXT NOT NULL,
    "external_match_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_matches_pkey" PRIMARY KEY ("external_source","external_match_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "external_matches_match_id_key" ON "external_matches"("match_id");

-- CreateIndex
CREATE INDEX "external_matches_guild_id_idx" ON "external_matches"("guild_id");

-- AddForeignKey
ALTER TABLE "external_matches" ADD CONSTRAINT "external_matches_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("match_id") ON DELETE CASCADE ON UPDATE CASCADE;
