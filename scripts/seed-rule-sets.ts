import "dotenv/config";

import { prisma } from "../src/prisma.js";
import { seedStandardEvents, standardEvents, standardRuleSets } from "../src/rule-sets.js";

const guildIds = [
  ...(process.env.DISCORD_GUILD_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  process.env.DISCORD_GUILD_ID?.trim()
].filter((value): value is string => Boolean(value));

const uniqueGuildIds = [...new Set(guildIds)];

if (uniqueGuildIds.length === 0) {
  throw new Error("DISCORD_GUILD_IDS or DISCORD_GUILD_ID is required.");
}

for (const guildId of uniqueGuildIds) {
  await seedStandardEvents(prisma, guildId);
  console.log(`Seeded ${standardRuleSets.length} rule sets and ${standardEvents.length} events for guild ${guildId}.`);
}

await prisma.$disconnect();
