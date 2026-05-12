# Discord Mahjong Status Bot

Discord上でVRChat麻雀の対局結果を記録し、サーバー単位で成績・ポイントを集計するBotです。

## 必要環境

- Node.js 18.18以上
- npm
- Discord Bot Token
- PostgreSQL

このPCではNode 22用のラッパーを用意しています。

```bat
scripts\with-node22.cmd install
scripts\with-node22.cmd run build
```

## セットアップ

```bat
scripts\with-node22.cmd install
scripts\setup-env.cmd YOUR_DISCORD_CLIENT_ID GUILD_ID_1,GUILD_ID_2
scripts\with-node22.cmd run prisma:generate
scripts\with-node22.cmd run db:deploy
scripts\with-node22.cmd run register
scripts\with-node22.cmd run dev
```

## ローカルテスト

```bat
scripts\with-node22.cmd run test
scripts\with-node22.cmd run build
scripts\with-node22.cmd run prisma:generate
scripts\with-node22.cmd run local:smoke
```

## Discordコマンド

- `/mjs add`: 対局を登録
- `/mjs stats user type period tournament_name`: 個人成績を表示
- `/mjs log user count type`: 履歴を表示
- `/mjs matches count type tournament_name`: サーバー内の対局一覧を表示
- `/mjs rank type period tournament_name`: ランキングを表示
- `/mjs best type period tournament_name`: レコードを表示
- `/mjs del match_id`: 指定Matchを確認付きで削除
- `/mjs undo`: サーバー内の最新Matchを確認付きで削除
- `/mjs name user vrc_name`: DiscordユーザーとVRC名を紐付け
- `/mjs members`: VRC名が登録済みのメンバーを表示
- `/mjs help`: 使えるコマンドを表示

`name` は、サーバー管理権限を持つユーザー、または `.env` の `DEVELOPER_USER_IDS` に含まれるユーザーだけが実行できます。`help` は実行ユーザーの権限に応じて表示内容を切り替えます。

## 対局登録

`add` はSlash Command側で種別、順位ごとのDiscordユーザー、任意の日付、大会名を選択します。続くモーダルで各順位の最終持ち点を入力します。

```text
/mjs add type:4人半荘 player1:@1位 player2:@2位 player3:@3位 player4:@4位 date:2026-05-07 tournament_name:大会名
```

参加者が対象サーバー内のメンバーではない場合は登録を止めます。

## 外部API

TANKIなど外部システムから対局結果を送るためのAPIです。`EXTERNAL_API_KEY` が設定されていると有効になります。

```http
POST /api/matches
Authorization: Bearer <EXTERNAL_API_KEY>
Content-Type: application/json
```

```json
{
  "guildId": "1499090620373929984",
  "type": "4",
  "playedAt": "2026-05-07",
  "tournamentName": "大会名",
  "externalSource": "tanki",
  "externalMatchId": "tanki-match-001",
  "dryRun": true,
  "players": [
    { "displayName": "VRC_PLAYER_001", "rank": 1, "rawScore": 39400 },
    { "displayName": "VRC_PLAYER_002", "rank": 2, "rawScore": 31200 },
    { "displayName": "VRC_PLAYER_003", "rank": 3, "rawScore": 22100 },
    { "displayName": "VRC_PLAYER_004", "rank": 4, "rawScore": 7300 }
  ]
}
```

`type` は `4`, `4p`, `3`, `3p`, `4p_east`, `3p_east` を受け付けます。TANKI連携では `displayName` を送ると、Botに登録済みの `UserProfile.vrcName` と照合してDiscordユーザーへ変換します。既存の手動連携では `discordUserId` も利用できます。

`dryRun: true` を付けると、名前照合、人数、順位、点数計算、サーバーメンバー確認だけを行い、DBへ登録しません。TANKI連携の初期テストではまず `dryRun: true` を使ってください。

`externalSource + externalMatchId` は重複登録防止キーです。同じキーで再送した場合は既存Matchを返し、二重登録しません。参加者が対象サーバーのメンバーではない場合はメンバー限定エラーを返します。

## TANKI Log Watcher

イベント当日のdryRun/本登録手順: [docs/tanki-event-test-runbook.md](docs/tanki-event-test-runbook.md)

検証協力者へ渡すマニュアル: [docs/tanki-tester-manual.md](docs/tanki-tester-manual.md)

VRChat Udonから任意の動的URLへ直接POSTする方式は制約が強いため、初期連携ではVRChatのログに許可済みの対局結果データを1行出し、ローカル補助スクリプトがBot APIへ送信します。

TANKI側で半荘・東風終了時に次の形式の1行をログへ出します。TANKI内部名や内部構造は含めません。

```text
MJS_RESULT:{"type":"4","playedAt":"2026-05-11","externalMatchId":"tanki-001","players":[{"displayName":"VRC_PLAYER_001","rank":1,"rawScore":39400}]}
```

ローカル監視を起動します。初期値は `dryRun` なのでDB登録は行いません。

```bat
set TANKI_GUILD_ID=1499090620373929984
set TANKI_DRY_RUN=true
scripts\with-node22.cmd run tanki:watch
```

任意の環境変数:

```env
TANKI_API_URL=https://mjs-tengoku2-a8a007d5.koyeb.app/api/matches
TANKI_GUILD_ID=DiscordサーバーID
TANKI_DRY_RUN=true
TANKI_LOG_PATH=C:\Users\...\AppData\LocalLow\VRChat\VRChat\output_log_....
TANKI_LOG_PREFIX=MJS_RESULT:
TANKI_READ_EXISTING=false
TANKI_LOCAL_ONLY=false
TANKI_ALLOW_PLACEHOLDER_PLAYERS=false
```

1人だけでVRChatログの読み取りを確認する場合は、APIへ送信しないローカル検証モードを使います。このモードでは `EXTERNAL_API_KEY` は不要で、空席の `-` が含まれていても読み取ったJSONだけを表示します。

```bat
set TANKI_LOCAL_ONLY=true
set TANKI_ALLOW_PLACEHOLDER_PLAYERS=true
set TANKI_READ_EXISTING=true
scripts\with-node22.cmd run tanki:watch
```

レスポンス例:

```json
{
  "ok": true,
  "duplicate": false,
  "matchId": "clx...",
  "guildId": "1499090620373929984",
  "type": "4p",
  "tournamentName": "大会名",
  "playedAt": "2026-05-07T03:00:00.000Z",
  "results": [
    { "userId": "111111111111111111", "rank": 1, "rawScore": 39400, "point": 59.4 }
  ]
}
```

## Aiven PostgreSQL

`.env` の `DATABASE_URL` にAiven PostgreSQLの接続URIを設定します。

```bat
scripts\with-node22.cmd run db:deploy
```

SQLiteから既存データを移す場合は、`SQLITE_DATABASE_PATH` を指定してから実行します。

```bat
scripts\with-node22.cmd run db:migrate:sqlite-to-postgres
```

## Koyeb

KoyebではDockerfileを使ってWeb Serviceとしてデプロイします。起動時に `prisma migrate deploy` を実行してからBotを起動します。UptimeRobotでは `/health` を監視します。

必要な環境変数:

```env
DATABASE_URL=...
DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...
DISCORD_GUILD_IDS=...
EXTERNAL_API_KEY=...
DEVELOPER_USER_IDS=...
```
