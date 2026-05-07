import type { APIEmbedField, GuildMember, User } from "discord.js";
import { prisma } from "./prisma.js";

export function formatPoint(value: number): string {
  return value.toFixed(1);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export async function displayName(guildId: string, user: User | GuildMember | null, userId: string): Promise<string> {
  const profile = await prisma.userProfile.findUnique({
    where: {
      guildId_userId: {
        guildId,
        userId
      }
    }
  });

  if (profile) {
    return profile.vrcName;
  }

  if (user) {
    return user.displayName;
  }

  return `<@${userId}>`;
}

export function chunkFields(fields: APIEmbedField[], limit = 25): APIEmbedField[] {
  return fields.slice(0, limit);
}
