# mjs v2 ローカル作業チェックリスト

作成日: 2026-06-25
最終更新: 2026-06-26

## 前提

現在の優先は、開発者本人のPCと本人のVRChatワールドで mjs v2 を固めること。

他者PC向けの手順書、相手ワールド向けパッチ、ショートカット配布、Git導入手順は後回しにする。
実装が固まった後に、第三者へ渡せる形で別途まとめる。

現在の active target はまどろみサーバー。
旧コミュニティ向けの設定やデータは legacy として残すが、新規検証の主対象にはしない。

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
& "C:\Users\81906\Documents\GitHub\mahjong-status\scripts\start-tanki-watch-register.ps1" -GuildId "1479381180146257950"
```

大会やリーグに登録したい場合。

```powershell
& "C:\Users\81906\Documents\GitHub\mahjong-status\scripts\start-tanki-watch-register.ps1" -GuildId "1479381180146257950" -EventName "まどろみリーグ第1節"
```

## TANKI取り込みの確認観点

半荘結果を登録する前に localOnly で確認する。

確認すること。

```text
1. aborted が false になっている
2. 空席がない
3. type が実際の人数と一致している
4. players の displayName が全員登録済み
5. rawScore の合計が原点合計から供託分を引いた値と合う
6. hands の件数が実際の局数と大きくずれていない
```

4人半荘の目安。

```text
rawScore合計 = 100,000 - 供託本数 * 1,000
```

3人半荘の目安。

```text
rawScore合計 = 105,000 - 供託本数 * 1,000
```

この整合が崩れている場合、API側で登録を拒否する。
ローカル側で原因を確認し、正しい結果を出せる状態にしてから register する。

## 次にやること

現在は Aiven への v2 適用と通常登録の疎通は完了済み。

次は以下を行う。

```text
1. ローカル実機で1半荘分のlocalOnlyを出す
2. 最終持ち点合計と供託の整合を確認する
3. 問題なければregisterで登録する
4. Discordで /mjs matches, /mjs stats, /mjs rank を確認する
5. 局単位スタッツが実際の対局内容と大きくずれていないか確認する
```
