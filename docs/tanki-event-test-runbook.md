# TANKIイベント自動取得テスト手順

この手順書は、イベント当日にTANKIの半荘結果をDiscord成績管理Botへ取り込む経路を確認するためのものです。

TANKI本体、Prefab、改造済みTANKIファイル、内部コードは配布しません。このリポジトリに含めるのはDiscord Bot側とローカル監視ツールだけです。

## 確認する経路

```text
TANKIの結果ログ -> ローカル監視ツール -> Koyeb API -> Discord Bot DB
```

## イベント前の確認

1. Koyebが起動していることを確認します。
   - `https://mjs-tengoku2-a8a007d5.koyeb.app/health` を開く
   - `ok` が返れば正常です。

2. Discordサーバー内のメンバー紐付けを確認します。
   - Discordで `/mjs members` を実行します。
   - 参加予定者のVRC名が正しく登録されているか確認します。
   - 未登録または間違いがある場合は `/mjs name` で修正します。

3. UnityのBuild & TestからVRChatを起動します。
   - 先にワールドを起動します。
   - VRChat起動後に監視ツールを起動してください。VRChat起動ごとに新しいログファイルが作られるためです。

## ローカル確認

VRChatログを読めるかだけ確認するモードです。APIには送信しません。

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\start-tanki-watch-localonly.ps1
```

結果ログが出ると、以下のような表示になります。

```text
localOnly ...
{
  "type": "...",
  "players": [...]
}
```

## API dryRun確認

本登録の前に使うモードです。APIには送信しますが、DBには保存しません。

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\start-tanki-watch-dryrun.ps1
```

起動時に `EXTERNAL_API_KEY` を入力します。

正常時は以下のような表示になります。

```text
sent dryRun ...
{"ok":true,...}
```

`displayName is not registered in this guild` が出た場合は、Discord側のVRC名登録を修正してから再確認してください。

API 400のメンバー限定エラーが出た場合は、解決されたDiscordユーザーのうち少なくとも1人が対象サーバーのメンバーではありません。

## 本登録

実メンバーでdryRunが成功してから使います。

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\start-tanki-watch-register.ps1
```

このスクリプトは、DB保存前に `REGISTER` の入力を求めます。

正常時は以下のような表示になります。

```text
sent register ...
{"ok":true,"duplicate":false,...}
```

## 対局後の確認

1. Discordで結果を確認します。
   - `/mjs log`
   - `/mjs stats`
   - `/mjs rank`

2. 誤登録があった場合は以下で取り消します。
   - `/mjs undo`
   - または `/mjs del match_id`

## 運用メモ

- 監視ツールはVRChat起動後に起動してください。
- イベント中は監視ツールの画面を閉じないでください。
- VRChatを再起動した場合は、監視ツールも起動し直してください。
- 最初の実メンバー結果が成功するまではdryRunを使ってください。
- ローカル監視ツールはVRChatを動かしているPCで実行してください。
