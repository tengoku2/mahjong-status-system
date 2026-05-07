import "dotenv/config";
import { REST, Routes } from "discord.js";
import { commands } from "./commands.js";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildIds = (process.env.DISCORD_GUILD_IDS ?? process.env.DISCORD_GUILD_ID ?? "")
  .split(",")
  .map((guildId) => guildId.trim())
  .filter(Boolean);

if (!token || !clientId) {
  throw new Error("DISCORD_TOKEN and DISCORD_CLIENT_ID are required.");
}

const rest = new REST({ version: "10" }).setToken(token);

if (guildIds.length > 0) {
  const failedGuildIds: string[] = [];
  for (const guildId of guildIds) {
    try {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
      console.log(`Registered guild commands for ${guildId}.`);
    } catch (error) {
      failedGuildIds.push(guildId);
      console.error(`Failed to register guild commands for ${guildId}.`);
      console.error(error);
    }
  }

  if (failedGuildIds.length > 0) {
    console.warn(`Some guild command registrations failed: ${failedGuildIds.join(", ")}`);
  }
} else {
  await rest.put(Routes.applicationCommands(clientId), { body: commands });
  console.log("Registered global commands.");
}
