import "dotenv/config";

import { prisma } from "../src/prisma.js";
import { calculateResults, calculateResultsWithRuleSet } from "../src/scoring.js";

type Args = {
  matchId?: string;
  userId?: string;
  rawScore?: number;
  apply: boolean;
  syncLastHand: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    apply: false,
    syncLastHand: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--match-id") {
      args.matchId = requireValue(arg, next);
      index += 1;
      continue;
    }

    if (arg === "--user-id") {
      args.userId = requireValue(arg, next);
      index += 1;
      continue;
    }

    if (arg === "--raw-score") {
      const value = Number(requireValue(arg, next));
      if (!Number.isInteger(value)) {
        throw new Error("--raw-score must be an integer.");
      }
      args.rawScore = value;
      index += 1;
      continue;
    }

    if (arg === "--apply") {
      args.apply = true;
      continue;
    }

    if (arg === "--sync-last-hand") {
      args.syncLastHand = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.matchId) {
    throw new Error("--match-id is required.");
  }
  if (!args.userId) {
    throw new Error("--user-id is required.");
  }
  if (args.rawScore === undefined) {
    throw new Error("--raw-score is required.");
  }

  return args;
}

function requireValue(name: string, value: string | undefined): string {
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

function printUsage() {
  console.log(`Usage:
  tsx scripts/admin-fix-match-result.ts --match-id <matchId> --user-id <discordUserId> --raw-score <score> [--sync-last-hand] [--apply]

Options:
  --match-id         Target match ID.
  --user-id          Target Discord user ID in the match.
  --raw-score        Correct final raw score.
  --sync-last-hand   Also update the target user's endScore in the latest hand.
  --apply            Actually write changes. Without this, dry-run only.
`);
}

function formatPoint(point: number): string {
  return point.toFixed(1);
}

function expectedTotalForType(type: string): number | null {
  if (type === "4p" || type === "4p_east") return 100000;
  if (type === "3p" || type === "3p_east") return 105000;
  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const match = await prisma.match.findUnique({
    where: {
      matchId: args.matchId
    },
    include: {
      ruleSet: true,
      event: true,
      externalMatch: true,
      results: {
        orderBy: {
          rank: "asc"
        }
      },
      hands: {
        orderBy: {
          handIndex: "desc"
        },
        take: 1,
        include: {
          playerStats: true
        }
      }
    }
  });

  if (!match) {
    throw new Error(`Match not found: ${args.matchId}`);
  }

  const target = match.results.find((result) => result.userId === args.userId);
  if (!target) {
    throw new Error(`User ${args.userId} is not in match ${args.matchId}.`);
  }

  const nextPlayers = match.results.map((result) => ({
    userId: result.userId,
    rank: result.rank,
    rawScore: result.userId === args.userId ? args.rawScore! : result.rawScore
  }));

  const nextResults = match.ruleSet
    ? calculateResultsWithRuleSet(match.ruleSet, nextPlayers)
    : calculateResults(match.type, nextPlayers);

  const beforeTotal = match.results.reduce((sum, result) => sum + result.rawScore, 0);
  const afterTotal = nextResults.reduce((sum, result) => sum + result.rawScore, 0);
  const latestHand = match.hands[0];
  const expectedBaseTotal = expectedTotalForType(match.type);
  const expectedAfterTotal =
    expectedBaseTotal === null || !latestHand ? null : expectedBaseTotal - latestHand.kyotaku * 1000;

  console.log("Match");
  console.log(`  matchId: ${match.matchId}`);
  console.log(`  guildId: ${match.guildId}`);
  console.log(`  type: ${match.type}`);
  console.log(`  event: ${match.event?.name ?? "-"}`);
  console.log(`  ruleSet: ${match.ruleSet?.name ?? "-"}`);
  console.log(`  external: ${match.externalMatch ? `${match.externalMatch.externalSource}/${match.externalMatch.externalMatchId}` : "-"}`);
  console.log("");
  console.log("Changes");
  console.log(`  target userId: ${args.userId}`);
  console.log(`  rawScore: ${target.rawScore} -> ${args.rawScore}`);
  console.log(`  score total: ${beforeTotal} -> ${afterTotal}`);
  if (expectedAfterTotal !== null) {
    console.log(`  expected total from latest kyotaku: ${expectedAfterTotal}`);
    if (afterTotal !== expectedAfterTotal) {
      console.log("  warning: score total does not match expected total.");
    }
  }
  console.log("");
  console.log("Result preview");
  for (const result of nextResults) {
    const current = match.results.find((item) => item.userId === result.userId);
    console.log(
      `  rank ${result.rank}: ${result.userId} ${current?.rawScore ?? "-"} -> ${result.rawScore}, ` +
        `${formatPoint(current?.point ?? 0)}pt -> ${formatPoint(result.point)}pt`
    );
  }

  if (args.syncLastHand) {
    if (!latestHand) {
      console.log("");
      console.log("Last hand sync: skipped because this match has no hands.");
    } else {
      const handTarget = latestHand.playerStats.find((stat) => stat.userId === args.userId);
      console.log("");
      if (!handTarget) {
        console.log("Last hand sync: skipped because target user is not in the latest hand.");
      } else {
        console.log(`Last hand sync: handIndex ${latestHand.handIndex}, endScore ${handTarget.endScore ?? "-"} -> ${args.rawScore}`);
      }
    }
  }

  if (!args.apply) {
    console.log("");
    console.log("Dry-run only. Add --apply to write changes.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const result of nextResults) {
      await tx.result.update({
        where: {
          matchId_userId: {
            matchId: match.matchId,
            userId: result.userId
          }
        },
        data: {
          rawScore: result.rawScore,
          point: result.point
        }
      });
    }

    if (args.syncLastHand && latestHand) {
      const handTarget = latestHand.playerStats.find((stat) => stat.userId === args.userId);
      if (handTarget) {
        await tx.handPlayerStat.update({
          where: {
            handPlayerStatId: handTarget.handPlayerStatId
          },
          data: {
            endScore: args.rawScore
          }
        });
      }
    }
  });

  console.log("");
  console.log("Applied.");
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
