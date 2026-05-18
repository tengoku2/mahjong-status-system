# TANKI自動取得テスト協力者向けマニュアル

このマニュアルは、定期麻雀会でTANKIの半荘結果をDiscord成績管理Botへ取り込むテストに協力してもらう人向けです。

## 重要な注意

- TANKIを購入済みの人だけが、自分のPC・自分のUnityプロジェクトで作業してください。
- TANKI本体、Prefab、改造済みTANKIファイル、内部コードは共有・配布しないでください。
- このリポジトリに入っているのは、Discord Bot側とローカル監視ツールだけです。
- まずは `dryRun` で確認してください。`dryRun` はAPI確認だけを行い、DBには保存しません。
- 本登録モードは、運営者から指示があった場合だけ使ってください。

## 事前にもらうもの

運営者から以下を受け取ってください。

- GitHubリポジトリURL
  - `https://github.com/tengoku2/mahjong-status-system`
- `EXTERNAL_API_KEY`
  - Discord DMなど、公開されない場所で受け取ってください。
- 対象DiscordサーバーID
  - 通常は `1499090620373929984`
- 当日使うモード
  - 基本は `dryRun`
  - 本登録まで担当する場合のみ `register`
- リポジトリ配置先
  - `D:\白鳳会\mahjong-status-system-main\mahjong-status-system-main`

## 1. リポジトリを取得する

PowerShellを開いて、作業したいフォルダへ移動してから実行します。

```powershell
cd "D:\白鳳会"
git clone https://github.com/tengoku2/mahjong-status-system mahjong-status-system-main
cd "D:\白鳳会\mahjong-status-system-main"
```

すでに取得済みの場合は、最新版へ更新します。

```powershell
cd "D:\白鳳会\mahjong-status-system-main"
git pull
```

## 2. Node環境を準備する

```powershell
cd "D:\白鳳会\mahjong-status-system-main"
cmd /c scripts\with-node22.cmd install
```

時間がかかる場合があります。エラーが出なければOKです。

必要なら、以後の起動を楽にするためにデスクトップショートカットを一度だけ作成します。

```powershell
cd "D:\白鳳会\mahjong-status-system-main\mahjong-status-system-main"
powershell -ExecutionPolicy Bypass -File ".\scripts\install-tanki-watch-shortcuts.ps1"
```

作成されるショートカット:

- `VRChat-TANKI-Check`
- `VRChat-TANKI-API-Check`
- `VRChat-TANKI-Register`

## 3. Discord側の名前登録を確認する

Discordで以下を実行します。

```text
/mjs members
```

参加予定者のVRC名が登録されているか確認してください。

未登録または間違いがある場合は、運営者に修正を依頼してください。権限がある人は以下で修正できます。

```text
/mjs name user:@対象ユーザー vrc_name:VRC名
```

## 4. VRChatを起動する

UnityのBuild & TestからVRChatを起動します。

重要:

- VRChatを起動してから監視ツールを起動してください。
- watcher は最新ログへ自動追従します。
- 監視ツールは、VRChatを動かしているPCで実行してください。

## 5. ローカル確認をする

まず、VRChatログを読めるかだけ確認します。この段階ではAPIへ送信しません。

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
& "D:\白鳳会\mahjong-status-system-main\mahjong-status-system-main\scripts\start-tanki-watch-localonly.cmd"
```

ショートカットを作成済みなら、デスクトップの `VRChat-TANKI-Check` をダブルクリックでも起動できます。

PowerShell画面に以下のような表示が出れば起動できています。

```text
監視対象ログ: ...
モード: ローカル確認。APIには送信しません。
```

TANKI側で結果ログが出ると、以下のように表示されます。

```text
localOnly ...
{
  "type": "...",
  "players": [...]
}
```

この確認ができたら、PowerShell画面は `Ctrl + C` で止めてください。

## 6. API dryRunをする

次に、APIへ送信して確認します。DBには保存されません。

```powershell
& "D:\白鳳会\mahjong-status-system-main\mahjong-status-system-main\scripts\start-tanki-watch-dryrun.cmd"
```

ショートカットを作成済みなら、デスクトップの `VRChat-TANKI-API-Check` をダブルクリックでも起動できます。

`EXTERNAL_API_KEYを入力してください` と表示されたら、運営者から受け取ったキーを貼り付けてEnterを押します。

起動できると以下のように表示されます。

```text
監視対象ログ: ...
モード: dryRun。APIには送信しますが、DB登録は行いません。
```

結果送信が成功すると、以下のように表示されます。

```text
送信完了 dryRun ...
{"ok":true,...}
```

この表示が出たら、dryRun成功です。

## 7. 本登録をする場合

運営者から指示があった場合だけ実行してください。

```powershell
& "D:\白鳳会\mahjong-status-system-main\mahjong-status-system-main\scripts\start-tanki-watch-register.cmd"
```

ショートカットを作成済みなら、デスクトップの `VRChat-TANKI-Register` をダブルクリックでも起動できます。

以下の確認が出ます。

```text
このモードはDBへ対局を登録します。続行する場合は REGISTER と入力してください
```

本当に登録してよい場合だけ、半角大文字で入力します。

```text
REGISTER
```

その後、`EXTERNAL_API_KEY` を入力します。

成功すると以下のように表示されます。

```text
送信完了 register ...
{"ok":true,"duplicate":false,...}
```

## 8. 登録結果をDiscordで確認する

本登録を行った場合は、Discordで以下を確認してください。

```text
/mjs matches
/mjs log
/mjs rank
```

間違った対局が登録された場合は、運営者へ `match_id` を伝えてください。

削除権限がある人は以下で削除できます。

```text
/mjs del match_id:対象のMatch ID
```

直近の誤登録であれば以下でも削除できます。

```text
/mjs undo
```

## よくあるエラー

### `EXTERNAL_API_KEY が必要です`

APIキーが入力されていません。`dryRun` または `register` 起動時に、運営者から受け取ったキーを入力してください。

### `displayName is not registered in this guild`

TANKIから取得したVRC名が、Discord Bot側に登録されていません。

対応:

- Discordで `/mjs members` を確認
- 未登録なら運営者に `/mjs name` で登録してもらう

### メンバー限定エラー

解決されたDiscordユーザーが、対象Discordサーバー内のメンバーではありません。

対応:

- 参加者が対象Discordサーバーに入っているか確認
- VRC名の紐付け先が間違っていないか確認

### 監視ツールに何も出ない

監視しているVRChatログが違う可能性があります。

対応:

1. 監視ツールを `Ctrl + C` で止める
2. VRChatを起動したまま、もう一度監視ツールを起動する
3. それでも出ない場合は、手動追記テストで watcher 側とワールド側を切り分ける

### PowerShellでスクリプト実行が無効と言われる

同じPowerShellで以下を実行してから、もう一度スクリプトを実行してください。

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

## 報告テンプレート

テスト後、運営者へ以下を送ってください。

```text
【TANKI自動取得テスト報告】
担当者:
モード: localOnly / dryRun / register
結果: 成功 / 失敗
表示されたmatchId:
表示されたエラー:
Discordで確認したコマンド:
気づいたこと:
```

APIキーや接続URIなどの秘密情報は、報告に貼らないでください。
