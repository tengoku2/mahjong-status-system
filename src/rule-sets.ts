import { EventKind, EventStatus, GameType, RoundExtension, TieBreakType, type PrismaClient } from "@prisma/client";

export type StandardRuleSetDefinition = {
  name: string;
  gameType: GameType;
  startScore: number;
  returnScore: number;
  uma: number[];
  allowBust: boolean;
  bustThreshold: number | null;
  allowAgariYame: boolean;
  roundExtension: RoundExtension;
  tieBreakType: TieBreakType;
};

export type StandardEventDefinition = {
  name: string;
  kind: EventKind;
  ruleSetName: string;
};

export const standardRuleSets = [
  {
    name: "通常4人半荘",
    gameType: GameType.FOUR_PLAYER_HANCHAN,
    startScore: 25000,
    returnScore: 30000,
    uma: [50, 10, -10, -30],
    allowBust: true,
    bustThreshold: -1,
    allowAgariYame: true,
    roundExtension: RoundExtension.WEST,
    tieBreakType: TieBreakType.SEAT_ORDER
  },
  {
    name: "通常3人半荘",
    gameType: GameType.THREE_PLAYER_HANCHAN,
    startScore: 35000,
    returnScore: 35000,
    uma: [15, 0, -15],
    allowBust: true,
    bustThreshold: -1,
    allowAgariYame: true,
    roundExtension: RoundExtension.WEST,
    tieBreakType: TieBreakType.SEAT_ORDER
  },
  {
    name: "通常4人東風",
    gameType: GameType.FOUR_PLAYER_TONPU,
    startScore: 25000,
    returnScore: 30000,
    uma: [20, 5, -5, -20],
    allowBust: true,
    bustThreshold: -1,
    allowAgariYame: true,
    roundExtension: RoundExtension.SOUTH,
    tieBreakType: TieBreakType.SEAT_ORDER
  },
  {
    name: "通常3人東風",
    gameType: GameType.THREE_PLAYER_TONPU,
    startScore: 35000,
    returnScore: 35000,
    uma: [5, 0, -5],
    allowBust: true,
    bustThreshold: -1,
    allowAgariYame: true,
    roundExtension: RoundExtension.SOUTH,
    tieBreakType: TieBreakType.SEAT_ORDER
  },
  {
    name: "大会4人半荘",
    gameType: GameType.FOUR_PLAYER_HANCHAN,
    startScore: 25000,
    returnScore: 30000,
    uma: [50, 10, -10, -30],
    allowBust: false,
    bustThreshold: null,
    allowAgariYame: false,
    roundExtension: RoundExtension.NONE,
    tieBreakType: TieBreakType.SPLIT_UMA
  }
] satisfies StandardRuleSetDefinition[];

export const standardEvents = [
  {
    name: "通常4人半荘",
    kind: EventKind.NORMAL,
    ruleSetName: "通常4人半荘"
  },
  {
    name: "通常3人半荘",
    kind: EventKind.NORMAL,
    ruleSetName: "通常3人半荘"
  },
  {
    name: "通常4人東風",
    kind: EventKind.NORMAL,
    ruleSetName: "通常4人東風"
  },
  {
    name: "通常3人東風",
    kind: EventKind.NORMAL,
    ruleSetName: "通常3人東風"
  }
] satisfies StandardEventDefinition[];

export async function seedStandardRuleSets(prisma: PrismaClient, guildId: string) {
  await prisma.guild.upsert({
    where: { guildId },
    create: { guildId },
    update: {}
  });

  for (const ruleSet of standardRuleSets) {
    const data = ruleSetToPrismaData(ruleSet);
    await prisma.ruleSet.upsert({
      where: {
        guildId_name: {
          guildId,
          name: ruleSet.name
        }
      },
      create: {
        guildId,
        ...data
      },
      update: data
    });
  }
}

export async function seedStandardEvents(prisma: PrismaClient, guildId: string) {
  await seedStandardRuleSets(prisma, guildId);

  const ruleSets = await prisma.ruleSet.findMany({
    where: {
      guildId,
      name: {
        in: standardEvents.map((event) => event.ruleSetName)
      }
    }
  });
  const ruleSetIdsByName = new Map(ruleSets.map((ruleSet) => [ruleSet.name, ruleSet.ruleSetId]));

  for (const event of standardEvents) {
    const ruleSetId = ruleSetIdsByName.get(event.ruleSetName);
    if (!ruleSetId) {
      throw new Error(`RuleSet not found for standard event: ${event.name}`);
    }

    await prisma.event.upsert({
      where: {
        guildId_name: {
          guildId,
          name: event.name
        }
      },
      create: {
        guildId,
        ruleSetId,
        name: event.name,
        kind: event.kind,
        status: EventStatus.ACTIVE
      },
      update: {
        ruleSetId,
        kind: event.kind,
        status: EventStatus.ACTIVE
      }
    });
  }
}

function ruleSetToPrismaData(ruleSet: StandardRuleSetDefinition) {
  return {
    name: ruleSet.name,
    gameType: ruleSet.gameType,
    startScore: ruleSet.startScore,
    returnScore: ruleSet.returnScore,
    uma: ruleSet.uma,
    allowBust: ruleSet.allowBust,
    bustThreshold: ruleSet.bustThreshold,
    allowAgariYame: ruleSet.allowAgariYame,
    roundExtension: ruleSet.roundExtension,
    tieBreakType: ruleSet.tieBreakType,
    isActive: true
  };
}
