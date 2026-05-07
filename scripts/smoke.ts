import "dotenv/config";

process.env.DATABASE_URL ??= "file:./dev.db";

const { prisma } = await import("../src/prisma.js");
const { aggregateStats, createMatch, ranking } = await import("../src/services.js");

const guildId = "local-guild";
const players = [
  { userId: "100000000000000001", rank: 1, rawScore: 42000 },
  { userId: "100000000000000002", rank: 2, rawScore: 31000 },
  { userId: "100000000000000003", rank: 3, rawScore: 25000 },
  { userId: "100000000000000004", rank: 4, rawScore: 2000 }
];

const tournamentName = "local-tournament";
const match = await createMatch(guildId, "4p", players, tournamentName);
const stats = await aggregateStats(guildId, "4p", "all", players[0].userId);
const tournamentStats = await aggregateStats(guildId, "4p", "all", players[0].userId, tournamentName);
const ranks = await ranking(guildId, "4p", "all");
const tournamentRanks = await ranking(guildId, "4p", "all", tournamentName);

console.log(`created_match=${match.matchId}`);
console.log(`user1_total_games=${stats.totalGames}`);
console.log(`user1_total_point=${stats.totalPoint.toFixed(1)}`);
console.log(`user1_tournament_games=${tournamentStats.totalGames}`);
console.log(`ranking_top=${ranks[0]?.userId ?? "none"}`);
console.log(`tournament_ranking_top=${tournamentRanks[0]?.userId ?? "none"}`);

await prisma.match.deleteMany({ where: { guildId } });
await prisma.userProfile.deleteMany({ where: { guildId } });
await prisma.user.deleteMany({ where: { guildId } });
await prisma.guild.deleteMany({ where: { guildId } });
await prisma.$disconnect();
