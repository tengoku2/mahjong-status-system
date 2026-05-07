# Discord Mahjong Status Bot

Discord上でVRChat麻雀の対局結果を記録し、サーバー単位で成績を集計するBotです。

## Requirements

- Node.js 18.18+
- npm
- Discord Bot token

このPCではNode 22を使うラッパーを用意しています。

```bat
scripts\with-node22.cmd install
scripts\with-node22.cmd run build
```

## Setup

```bat
scripts\with-node22.cmd install
scripts\setup-env.cmd YOUR_DISCORD_CLIENT_ID GUILD_ID_1,GUILD_ID_2
scripts\with-node22.cmd run prisma:generate
scripts\with-node22.cmd run db:deploy
scripts\with-node22.cmd run register
scripts\with-node22.cmd run dev
```

## Local Test

```bat
scripts\with-node22.cmd run test
scripts\with-node22.cmd run build
scripts\with-node22.cmd run prisma:generate
scripts\with-node22.cmd run local:smoke
```

## Commands

- `/mahjong record` 対局登録モーダルを開く
- `/mahjong stats user type period` 成績確認
- `/mahjong history user count type` 履歴表示
- `/mahjong ranking type period` ランキング
- `/mahjong delete match_id` 対局削除
- `/mahjong undo` サーバー内の最新対局を削除
- `/mahjong setname user vrc_name` 管理者がDiscordユーザーとVRC名を紐づける
- `/mahjong editname user vrc_name` 管理者または開発者がVRC名の紐づけを変更する
- `/mahjong members` VRC名が登録されているメンバーを表示する

`delete` と `undo` は誰でも実行できます。名前紐づけ系コマンドはサーバー管理権限、または `.env` の `DEVELOPER_USER_IDS` に含まれるDiscordユーザーIDが必要です。

## Record Modal Format

`record` はSlash Command側で種別とプレイヤーを選びます。Discord標準のユーザー候補から選択できます。

```text
/mahjong record type:4人半荘 player1:@1位 player2:@2位 player3:@3位 player4:@4位
```

3人半荘では `player4` を指定しません。

```text
/mahjong record type:3人半荘 player1:@1位 player2:@2位 player3:@3位
```

大会の対局として登録する場合は、`record` 実行時に大会名も指定します。

```text
/mahjong record type:4人半荘 player1:@1位 player2:@2位 player3:@3位 player4:@4位 tournament_name:大会名
```

後から入力する場合は、対局日を `YYYY-MM-DD` 形式で指定できます。

```text
/mahjong record type:4人半荘 player1:@1位 player2:@2位 player3:@3位 player4:@4位 date:2026-05-07
```

その後に開くモーダルでは、各順位の最終持ち点だけを入力します。

```text
1位 最終持ち点: 39400
2位 最終持ち点: 31200
```

選択したユーザーがサーバー内メンバーでない場合は「サーバー内での対戦のみ有効です。」として登録を中止します。集計期間、履歴、ランキングは記録日時ではなく対局日を基準にします。

## VRC Name Mapping

管理者は次のコマンドで、サーバーメンバーとVRC名を紐づけできます。

```text
/mahjong setname user:@DiscordUser vrc_name:VRC名
```

間違えた場合やVRC名が変わった場合は、同じ形式で `editname` を使います。内部処理は上書き保存です。

```text
/mahjong editname user:@DiscordUser vrc_name:新しいVRC名
```

開発者権限を付与する場合は `.env` にDiscordユーザーIDをカンマ区切りで設定します。

```env
DEVELOPER_USER_IDS=あなたのDiscordユーザーID
```

登録後は対局登録や集計表示でVRC名が優先表示されます。

## Tournament Filter

大会名を指定して登録した対局は、通常集計とは同じサーバー内データとして保存されます。`stats` と `ranking` では同じ大会名を指定すると、その大会だけに絞り込めます。

```text
/mahjong stats user:@DiscordUser type:4p period:累計 tournament_name:大会名
/mahjong ranking type:4p period:累計 tournament_name:大会名
```

大会名を省略した場合は、大会対局も含めた通常の全体集計になります。

`/mahjong ranking` の期間未指定時は、当月（1ヶ月）がデフォルトです。
表示上の種別は `4人半荘` / `3人半荘`、当月の期間は `2026年05月` のように表示します。

## Database Choice

現在はAiven PostgreSQLを前提にしています。`.env` の `DATABASE_URL` にAivenの接続URIを設定してください。

## Aiven PostgreSQL

Aivenへmigrationを適用します。

```bat
scripts\with-node22.cmd run db:deploy
```

SQLiteから既存データを移す場合は、`SQLITE_DATABASE_PATH` を指定してから実行します。

```bat
scripts\with-node22.cmd run db:migrate:sqlite-to-postgres
```

## Koyeb

KoyebではDockerfileを使ってWeb Serviceとしてデプロイします。Bot本体と同じプロセスで `/health` を公開します。

必要な環境変数:

```env
DATABASE_URL=postgres://...
DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...
DISCORD_GUILD_IDS=GUILD_ID_1,GUILD_ID_2
DEVELOPER_USER_IDS=...
PORT=8000
```

起動時に `prisma migrate deploy` を実行してからBotを起動します。UptimeRobotでは `https://<koyeb-app>/health` を監視してください。
