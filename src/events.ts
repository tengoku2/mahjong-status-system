import { EventKind, EventStatus, GameType, type RuleSet } from "@prisma/client";
import { prisma } from "./prisma.js";
import { seedStandardEvents } from "./rule-sets.js";
import type { MahjongType } from "./types.js";

export type EventListStatus = "active" | "closed" | "archived" | "all";

export function parseEventKind(value: string | null): EventKind {
  switch (value) {
    case "normal":
      return EventKind.NORMAL;
    case "tournament":
      return EventKind.TOURNAMENT;
    case "league":
      return EventKind.LEAGUE;
    case "test":
      return EventKind.TEST;
    default:
      throw new Error("event kind must be normal, tournament, league, or test.");
  }
}

export function parseEventListStatus(value: string | null): EventListStatus {
  const status = value ?? "active";
  switch (status) {
    case "active":
    case "closed":
    case "archived":
    case "all":
      return status;
    default:
      throw new Error("event status must be active, closed, archived, or all.");
  }
}

export async function ensureStandardEvents(guildId: string) {
  await seedStandardEvents(prisma, guildId);
}

export async function listRuleSets(guildId: string): Promise<RuleSet[]> {
  return prisma.ruleSet.findMany({
    where: {
      guildId,
      isActive: true
    },
    orderBy: [{ gameType: "asc" }, { name: "asc" }]
  });
}

export async function listEvents(guildId: string, status: EventListStatus = "active") {
  return prisma.event.findMany({
    where: {
      guildId,
      ...(status === "all" ? {} : { status: eventStatus(status) })
    },
    include: {
      ruleSet: true
    },
    orderBy: [{ status: "asc" }, { kind: "asc" }, { name: "asc" }]
  });
}

export async function resolveEventForMatch(guildId: string, type: MahjongType, eventName?: string) {
  await ensureStandardEvents(guildId);

  const name = normalizeEventName(eventName) ?? defaultEventNameForMahjongType(type);
  const event = await prisma.event.findUnique({
    where: {
      guildId_name: {
        guildId,
        name
      }
    },
    include: {
      ruleSet: true
    }
  });

  if (!event) {
    throw new Error(`Event \`${name}\` が見つかりません。先に /mjs event list で確認してください。`);
  }
  if (event.status !== EventStatus.ACTIVE) {
    throw new Error(`Event \`${name}\` は有効ではありません。`);
  }

  const expectedGameType = gameTypeForMahjongType(type);
  if (event.ruleSet.gameType !== expectedGameType) {
    throw new Error(
      `Event \`${name}\` は ${gameTypeLabel(event.ruleSet.gameType)} 用です。${gameTypeLabel(expectedGameType)} の対局には使用できません。`
    );
  }

  return event;
}

export async function createEventByRuleSetName(
  guildId: string,
  input: {
    name: string;
    kind: EventKind;
    ruleSetName: string;
  }
) {
  const name = input.name.trim();
  const ruleSetName = input.ruleSetName.trim();
  if (!name) {
    throw new Error("イベント名を入力してください。");
  }
  if (!ruleSetName) {
    throw new Error("RuleSet名を入力してください。");
  }

  await ensureStandardEvents(guildId);
  const ruleSet = await prisma.ruleSet.findUnique({
    where: {
      guildId_name: {
        guildId,
        name: ruleSetName
      }
    }
  });
  if (!ruleSet) {
    throw new Error(`RuleSet \`${ruleSetName}\` が見つかりません。先に /mjs event rules で確認してください。`);
  }

  return prisma.event.upsert({
    where: {
      guildId_name: {
        guildId,
        name
      }
    },
    create: {
      guildId,
      ruleSetId: ruleSet.ruleSetId,
      name,
      kind: input.kind,
      status: EventStatus.ACTIVE
    },
    update: {
      ruleSetId: ruleSet.ruleSetId,
      kind: input.kind,
      status: EventStatus.ACTIVE
    },
    include: {
      ruleSet: true
    }
  });
}

export async function closeEvent(guildId: string, name: string) {
  const eventName = name.trim();
  if (!eventName) {
    throw new Error("イベント名を入力してください。");
  }

  const event = await prisma.event.findUnique({
    where: {
      guildId_name: {
        guildId,
        name: eventName
      }
    }
  });
  if (!event) {
    throw new Error(`Event \`${eventName}\` が見つかりません。`);
  }

  return prisma.event.update({
    where: {
      eventId: event.eventId
    },
    data: {
      status: EventStatus.CLOSED
    },
    include: {
      ruleSet: true
    }
  });
}

export function gameTypeLabel(gameType: GameType): string {
  switch (gameType) {
    case GameType.FOUR_PLAYER_HANCHAN:
      return "4人半荘";
    case GameType.THREE_PLAYER_HANCHAN:
      return "3人半荘";
    case GameType.FOUR_PLAYER_TONPU:
      return "4人東風";
    case GameType.THREE_PLAYER_TONPU:
      return "3人東風";
  }
}

export function gameTypeForMahjongType(type: MahjongType): GameType {
  switch (type) {
    case "4p":
      return GameType.FOUR_PLAYER_HANCHAN;
    case "3p":
      return GameType.THREE_PLAYER_HANCHAN;
    case "4p_east":
      return GameType.FOUR_PLAYER_TONPU;
    case "3p_east":
      return GameType.THREE_PLAYER_TONPU;
  }
}

export function defaultEventNameForMahjongType(type: MahjongType): string {
  switch (type) {
    case "4p":
      return "通常4人半荘";
    case "3p":
      return "通常3人半荘";
    case "4p_east":
      return "通常4人東風";
    case "3p_east":
      return "通常3人東風";
  }
}

export function eventKindLabel(kind: EventKind): string {
  switch (kind) {
    case EventKind.NORMAL:
      return "通常戦";
    case EventKind.TOURNAMENT:
      return "大会";
    case EventKind.LEAGUE:
      return "リーグ";
    case EventKind.TEST:
      return "テスト";
  }
}

export function eventStatusLabel(status: EventStatus): string {
  switch (status) {
    case EventStatus.ACTIVE:
      return "有効";
    case EventStatus.CLOSED:
      return "終了";
    case EventStatus.ARCHIVED:
      return "保管";
  }
}

function eventStatus(status: Exclude<EventListStatus, "all">): EventStatus {
  switch (status) {
    case "active":
      return EventStatus.ACTIVE;
    case "closed":
      return EventStatus.CLOSED;
    case "archived":
      return EventStatus.ARCHIVED;
  }
}

function normalizeEventName(value?: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
