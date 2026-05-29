import {
  ChannelType,
  SlashCommandBuilder,
  SlashCommandChannelOption,
  SlashCommandIntegerOption,
  SlashCommandNumberOption,
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
    option.setName("type").setDescription("対局種別").setRequired(required).addChoices(...typeChoices)
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

function addPointOption(command: SlashCommandSubcommandBuilder, required = false) {
  return command.addNumberOption((option: SlashCommandNumberOption) =>
    option.setName("point").setDescription("加点ポイント").setRequired(required)
  );
}

function addBonusTargetOption(command: SlashCommandSubcommandBuilder, required = false) {
  return command.addStringOption((option: SlashCommandStringOption) =>
    option
      .setName("target")
      .setDescription("加点対象")
      .setRequired(required)
      .addChoices({ name: "役満ボーナス", value: "yakuman_bonus" })
  );
}

function addTournamentOption(command: SlashCommandSubcommandBuilder, required = false) {
  return command.addStringOption((option: SlashCommandStringOption) =>
    option.setName("tournament_name").setDescription("大会名").setRequired(required).setMaxLength(100)
  );
}

function addDateOption(command: SlashCommandSubcommandBuilder) {
  return command.addStringOption((option: SlashCommandStringOption) =>
    option.setName("date").setDescription("対局日。例: 5/5, 0505, 今日, 2026-05-07").setRequired(true).setMaxLength(20)
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
      option.setName("player4").setDescription("4位のプレイヤー。3人麻雀では不要").setRequired(false)
    );
}

function addCountOption(command: SlashCommandSubcommandBuilder, max = 50) {
  return command.addIntegerOption((option: SlashCommandIntegerOption) =>
    option.setName("count").setDescription("表示件数").setMinValue(1).setMaxValue(max)
  );
}

function addChannelOption(
  command: SlashCommandSubcommandBuilder,
  name: string,
  description: string,
  required = false
) {
  return command.addChannelOption((option: SlashCommandChannelOption) =>
    option
      .setName(name)
      .setDescription(description)
      .setRequired(required)
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
  );
}

function addNanikiruOptions(command: SlashCommandSubcommandBuilder) {
  return command
    .addStringOption((option: SlashCommandStringOption) =>
      option
        .setName("hand")
        .setDescription("手動出題する14枚手牌。赤5は0m/0p/0s。例: 123m456p3506s東南白")
        .setMaxLength(80)
    )
    .addStringOption((option: SlashCommandStringOption) =>
      option
        .setName("shanten")
        .setDescription("ランダム出題する向聴数。hand指定時は表示用に自動計算します")
        .addChoices(
          { name: "指定なし", value: "any" },
          { name: "一向聴", value: "iishanten" },
          { name: "二向聴", value: "ryanshanten" }
        )
    )
    .addStringOption((option: SlashCommandStringOption) =>
      option
        .setName("honors")
        .setDescription("字牌を出題に含めるか")
        .addChoices(
          { name: "字牌あり", value: "include" },
          { name: "字牌なし", value: "exclude" }
        )
    )
    .addStringOption((option: SlashCommandStringOption) =>
      option.setName("dora").setDescription("ドラ。カン後ドラはカンマ区切りで4枚まで。例: 4p,5s,東").setMaxLength(40)
    )
    .addIntegerOption((option: SlashCommandIntegerOption) =>
      option.setName("turn").setDescription("巡目。未指定ならランダム").setMinValue(1)
    )
    .addStringOption((option: SlashCommandStringOption) =>
      option
        .setName("seat_wind")
        .setDescription("自風。未指定ならランダム")
        .addChoices(
          { name: "東", value: "east" },
          { name: "南", value: "south" },
          { name: "西", value: "west" },
          { name: "北", value: "north" }
        )
    )
    .addStringOption((option: SlashCommandStringOption) =>
      option
        .setName("round_wind")
        .setDescription("場風。未指定ならランダム")
        .addChoices(
          { name: "東", value: "east" },
          { name: "南", value: "south" },
          { name: "西", value: "west" }
        )
    )
    .addIntegerOption((option: SlashCommandIntegerOption) =>
      option.setName("round_number").setDescription("局数。西入は1のみ。未指定ならランダム").setMinValue(1).setMaxValue(4)
    )
    .addStringOption((option: SlashCommandStringOption) =>
      option.setName("note").setDescription("備考。例: 3sカン済み、上家が中ポン").setMaxLength(200)
    )
    .addChannelOption((option: SlashCommandChannelOption) =>
      option
        .setName("channel")
        .setDescription("今回だけ問題を投稿するチャンネル。未指定なら設定チャンネルまたは現在のチャンネル")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    );
}

function addNanikiruConfigOptions(command: SlashCommandSubcommandBuilder) {
  return addChannelOption(
    addChannelOption(command, "question_channel", "問題を投稿するチャンネル"),
    "result_channel",
    "結果を投稿するチャンネル。未指定なら未設定のまま"
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
    addTournamentOption(addTypeOption(addCountOption(command.setName("matches").setDescription("サーバー全体の対局一覧を表示します"), 25)))
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
    addSeasonYearOption(addSeasonOption(command.setName("export").setDescription("CSVをエクスポートします")))
  )
  .addSubcommand((command) =>
    addSeasonYearOption(
      addSeasonOption(
        addPointOption(
          addBonusTargetOption(
            addTypeOption(addUserOption(command.setName("bonus").setDescription("シーズン加点を登録します"), true), true),
            true
          ),
          true
        )
      )
    )
  )
  .addSubcommand((command) =>
    addChannelOption(command.setName("season_lock").setDescription("シーズンロック中に運営が閲覧するチャンネルを設定します"), "channel", "運営閲覧チャンネル", true)
  )
  .addSubcommand((command) =>
    command.setName("season_unlock").setDescription("直前シーズンのロックを解除します")
  )
  .addSubcommand((command) => addNanikiruOptions(command.setName("nanikiru").setDescription("何切る問題を出題します")))
  .addSubcommand((command) => addNanikiruConfigOptions(command.setName("nanikiru_config").setDescription("何切る問題の設定先を保存します")))
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
      .setDescription("管理者向け。DiscordユーザーとVRC名を紐づけます")
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
