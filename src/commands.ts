import {
  SlashCommandBuilder,
  SlashCommandIntegerOption,
  SlashCommandStringOption,
  SlashCommandSubcommandBuilder,
  SlashCommandUserOption
} from "discord.js";
import { periodChoices } from "./periods.js";

const typeChoices = [
  { name: "4人半荘", value: "4p" },
  { name: "3人半荘", value: "3p" }
] as const;

function addUserOption(command: SlashCommandSubcommandBuilder, required = false) {
  return command.addUserOption((option: SlashCommandUserOption) =>
    option.setName("user").setDescription("対象ユーザー").setRequired(required)
  );
}

function addTypeOption(command: SlashCommandSubcommandBuilder, required = false) {
  return command.addStringOption((option: SlashCommandStringOption) =>
    option.setName("type").setDescription("種別").setRequired(required).addChoices(...typeChoices)
  );
}

function addPeriodOption(command: SlashCommandSubcommandBuilder, required = false) {
  return command.addStringOption((option: SlashCommandStringOption) =>
    option
      .setName("period")
      .setDescription("集計期間")
      .setRequired(required)
      .addChoices(...periodChoices)
  );
}

function addTournamentOption(command: SlashCommandSubcommandBuilder, required = false) {
  return command.addStringOption((option: SlashCommandStringOption) =>
    option.setName("tournament_name").setDescription("大会名").setRequired(required).setMaxLength(100)
  );
}

function addDateOption(command: SlashCommandSubcommandBuilder) {
  return command.addStringOption((option: SlashCommandStringOption) =>
    option.setName("date").setDescription("対局日。例: 2026-05-07").setRequired(false).setMaxLength(10)
  );
}

function addRecordUserOptions(command: SlashCommandSubcommandBuilder) {
  return command
    .addUserOption((option: SlashCommandUserOption) =>
      option.setName("player1").setDescription("1位のプレイヤー").setRequired(true)
    )
    .addUserOption((option: SlashCommandUserOption) =>
      option.setName("player2").setDescription("2位のプレイヤー").setRequired(true)
    )
    .addUserOption((option: SlashCommandUserOption) =>
      option.setName("player3").setDescription("3位のプレイヤー").setRequired(true)
    )
    .addUserOption((option: SlashCommandUserOption) =>
      option.setName("player4").setDescription("4位のプレイヤー。4人半荘のみ指定").setRequired(false)
    );
}

export const mahjongCommand = new SlashCommandBuilder()
  .setName("mahjong")
  .setDescription("VRChat麻雀の成績を管理します")
  .addSubcommand((command) =>
    addTournamentOption(
      addDateOption(addRecordUserOptions(addTypeOption(command.setName("record").setDescription("対局結果を登録します"), true)))
    )
  )
  .addSubcommand((command) =>
    addTournamentOption(addPeriodOption(addTypeOption(addUserOption(command.setName("stats").setDescription("成績を表示します")))))
  )
  .addSubcommand((command) =>
    addTypeOption(
      addUserOption(command.setName("history").setDescription("対局履歴を表示します")).addIntegerOption(
        (option: SlashCommandIntegerOption) =>
          option.setName("count").setDescription("表示件数").setMinValue(1).setMaxValue(50)
      )
    )
  )
  .addSubcommand((command) =>
    addTournamentOption(addPeriodOption(addTypeOption(command.setName("ranking").setDescription("ランキングを表示します"))))
  )
  .addSubcommand((command) =>
    command
      .setName("delete")
      .setDescription("指定した対局を削除します")
      .addStringOption((option: SlashCommandStringOption) =>
        option.setName("match_id").setDescription("削除するMatch ID").setRequired(true)
      )
  )
  .addSubcommand((command) => command.setName("undo").setDescription("このサーバーの最新対局を削除します"))
  .addSubcommand((command) =>
    command
      .setName("setname")
      .setDescription("管理者または開発者がDiscordユーザーとVRC名を紐づけます")
      .addUserOption((option: SlashCommandUserOption) =>
        option.setName("user").setDescription("対象のサーバーメンバー").setRequired(true)
      )
      .addStringOption((option: SlashCommandStringOption) =>
        option.setName("vrc_name").setDescription("VRC名").setRequired(true).setMaxLength(100)
      )
  )
  .addSubcommand((command) =>
    command
      .setName("editname")
      .setDescription("管理者または開発者がVRC名の紐づけを変更します")
      .addUserOption((option: SlashCommandUserOption) =>
        option.setName("user").setDescription("対象のサーバーメンバー").setRequired(true)
      )
      .addStringOption((option: SlashCommandStringOption) =>
        option.setName("vrc_name").setDescription("変更後のVRC名").setRequired(true).setMaxLength(100)
      )
  )
  .addSubcommand((command) => command.setName("members").setDescription("VRC名が登録されているメンバーを表示します"));

export const commands = [mahjongCommand.toJSON()];
