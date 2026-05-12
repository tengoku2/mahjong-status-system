import {
  SlashCommandBuilder,
  SlashCommandIntegerOption,
  SlashCommandStringOption,
  SlashCommandSubcommandBuilder,
  SlashCommandUserOption
} from "discord.js";
import { periodChoices, seasonChoices } from "./periods.js";

const typeChoices = [
  { name: "4人半荘", value: "4p" },
  { name: "3人半荘", value: "3p" },
  { name: "4人東風", value: "4p_east" },
  { name: "3人東風", value: "3p_east" }
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
    option.setName("period").setDescription("集計期間").setRequired(required).addChoices(...periodChoices)
  );
}

function addSeasonOption(command: SlashCommandSubcommandBuilder, required = false) {
  return command.addStringOption((option: SlashCommandStringOption) =>
    option.setName("season").setDescription("シーズン").setRequired(required).addChoices(...seasonChoices)
  );
}

function addSeasonYearOption(command: SlashCommandSubcommandBuilder, required = false) {
  return command.addIntegerOption((option: SlashCommandIntegerOption) =>
    option.setName("season_year").setDescription("シーズン年。例: 26").setRequired(required).setMinValue(1).setMaxValue(99)
  );
}

function addTournamentOption(command: SlashCommandSubcommandBuilder, required = false) {
  return command.addStringOption((option: SlashCommandStringOption) =>
    option.setName("tournament_name").setDescription("大会名").setRequired(required).setMaxLength(100)
  );
}

function addDateOption(command: SlashCommandSubcommandBuilder) {
  return command.addStringOption((option: SlashCommandStringOption) =>
    option.setName("date").setDescription("対局日。例: 5/5, 0505, 昨日, 2026-05-07").setRequired(true).setMaxLength(20)
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
      option.setName("player4").setDescription("4位のプレイヤー。4人麻雀のみ指定").setRequired(false)
    );
}

function addCountOption(command: SlashCommandSubcommandBuilder, max = 50) {
  return command.addIntegerOption((option: SlashCommandIntegerOption) =>
    option.setName("count").setDescription("表示件数").setMinValue(1).setMaxValue(max)
  );
}

export const mjsCommand = new SlashCommandBuilder()
  .setName("mjs")
  .setDescription("麻雀成績システム")
  .addSubcommand((command) =>
    addTournamentOption(addRecordUserOptions(addDateOption(addTypeOption(command.setName("add").setDescription("対局結果を登録します"), true))))
  )
  .addSubcommand((command) =>
    addTournamentOption(addPeriodOption(addTypeOption(addUserOption(command.setName("stats").setDescription("成績を表示します")))))
  )
  .addSubcommand((command) =>
    addTypeOption(addCountOption(addUserOption(command.setName("log").setDescription("ユーザー別の対局履歴を表示します"))))
  )
  .addSubcommand((command) =>
    addTournamentOption(
      addTypeOption(addCountOption(command.setName("matches").setDescription("サーバー内の対局一覧を表示します"), 25))
    )
  )
  .addSubcommand((command) =>
    addTournamentOption(addSeasonYearOption(addSeasonOption(addPeriodOption(addTypeOption(command.setName("rank").setDescription("ランキングを表示します"))))))
  )
  .addSubcommand((command) =>
    addTournamentOption(addSeasonYearOption(addSeasonOption(addPeriodOption(addTypeOption(command.setName("best").setDescription("レコードを表示します"))))))
  )
  .addSubcommand((command) =>
    addSeasonYearOption(addSeasonOption(command.setName("awards").setDescription("シーズン表彰を表示します")))
  )
  .addSubcommand((command) =>
    command
      .setName("del")
      .setDescription("指定した対局を削除します")
      .addStringOption((option: SlashCommandStringOption) =>
        option.setName("match_id").setDescription("削除するMatch ID").setRequired(true)
      )
  )
  .addSubcommand((command) => command.setName("undo").setDescription("このサーバーの最新対局を削除します"))
  .addSubcommand((command) =>
    command
      .setName("name")
      .setDescription("管理者、または開発者がDiscordユーザーとVRC名を紐付けます")
      .addUserOption((option: SlashCommandUserOption) =>
        option.setName("user").setDescription("対象のサーバーメンバー").setRequired(true)
      )
      .addStringOption((option: SlashCommandStringOption) =>
        option.setName("vrc_name").setDescription("VRC名").setRequired(true).setMaxLength(100)
      )
  )
  .addSubcommand((command) => command.setName("members").setDescription("VRC名が登録されているメンバーを表示します"))
  .addSubcommand((command) => command.setName("help").setDescription("使えるコマンドを表示します"));

export const commands = [mjsCommand.toJSON()];
