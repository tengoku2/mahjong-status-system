# mjs v2 ローカル作業チェックリスト

作成日: 2026-06-25

## 前提

現在の優先は、開発者本人のPCと本人のVRChatワールドで mjs v2 を固めること。

他者PC向けの手順書、相手ワールド向けパッチ、ショートカット配布、Git導入手順は後回しにする。
実装が固まった後に、第三者へ渡せる形で別途まとめる。

## 現在のDB接続

`.env` の `DATABASE_URL` は Aiven PostgreSQL を向いている。

そのため、以下は本番相当DBへの変更になる。

```powershell
cmd /c scripts\with-node22.cmd run db:deploy
cmd /c scripts\with-node22.cmd run rules:seed
```

`prisma migrate dev` は開発DB向けのコマンドなので、Aivenに対しては使わない。

```powershell
# Aivenには使わない
cmd /c scripts\with-node22.cmd exec prisma migrate dev
```

## DBへ書き込まない確認

以下はDBへ変更を書き込まない確認。

```powershell
cmd /c scripts\with-node22.cmd run build
cmd /c scripts\with-node22.cmd test
cmd /c scripts\with-node22.cmd exec prisma validate
cmd /c scripts\with-node22.cmd exec prisma migrate status
```

`migrate status` は未適用マイグレーションがある場合に終了コード1になることがある。
これは異常ではなく、未適用のマイグレーションが残っているという意味。

## Aivenへv2を適用するとき

適用前に確認すること。

```text
1. 未コミット・未確認の変更が混ざっていない
2. build/test/prisma validate が通っている
3. 適用先が Aiven で問題ない
4. v2用テーブル追加を許容できる
```

適用コマンド。

```powershell
cmd /c scripts\with-node22.cmd run db:deploy
cmd /c scripts\with-node22.cmd run rules:seed
```

適用後のDiscord確認。

```text
/mjs event list
/mjs event rules
/mjs add
/mjs matches
/mjs rank
/mjs stats
/mjs adjust list
```

## ローカルBot起動

DB適用後、Discordコマンドを更新してからBotを起動する。

```powershell
cmd /c scripts\with-node22.cmd run register
cmd /c scripts\with-node22.cmd run dev
```

## TANKI監視

Event未指定なら種別に対応した通常Eventへ登録される。
大会やリーグに登録したい場合は `-EventName` を指定する。

```powershell
& "C:\Users\81906\Documents\GitHub\mahjong-status\scripts\start-tanki-watch-localonly.ps1"
```

```powershell
& "C:\Users\81906\Documents\GitHub\mahjong-status\scripts\start-tanki-watch-register.ps1" -EventName "まどろみリーグ第1節"
```

## 次にやること

まずはAivenへv2マイグレーションを適用するかを決める。

適用する場合は、`db:deploy` と `rules:seed` を実行し、Discord上で `/mjs event list` から確認する。
