import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ModalActionRowComponentBuilder
} from "discord.js";
import type { MahjongType } from "./types.js";

export function recordModal(type: MahjongType, customId = "mahjong:record"): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(customId).setTitle("麻雀対局登録");
  const count = type === "4p" ? 4 : 3;
  const rows: ActionRowBuilder<ModalActionRowComponentBuilder>[] = [];

  for (let index = 1; index <= count; index += 1) {
    rows.push(
      new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(`score_${index}`)
          .setLabel(`${index}位 最終持ち点`)
          .setPlaceholder("39400")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
  }

  return modal.addComponents(...rows);
}
