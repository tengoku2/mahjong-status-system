# TANKI 相手ワールド・相手PC導入手順

この手順書は、あなた以外の人が所有しているワールドとPCで、TANKIの半荘結果自動取得テストを再現するためのものです。

この手順書で扱うのは次の2つです。

- ワールド所有者側の準備
- PCで監視ツールを動かす担当者側の準備

TANKI本体、Prefab、改造済みTANKIファイル、内部コードは共有しません。TANKI購入済みの人が、自分のUnityプロジェクトに対して自分のローカル環境で作業してください。

## 役割

### 1. ワールド所有者

- TANKI購入済み
- 自分のUnityプロジェクトを持っている
- 自分のワールドをPrivateアップロードできる
- TANKI側の結果ログ出力対応を、自分のローカルプロジェクトへ反映する

### 2. PC担当者

- 実際にVRChatを起動するPCを持っている
- GitHubリポジトリを取得できる
- PowerShellで監視ツールを起動できる
- `EXTERNAL_API_KEY` を受け取れる

同一人物でも構いません。

## 必要なもの

- GitHubリポジトリ
  - `https://github.com/tengoku2/mahjong-status-system`
- `EXTERNAL_API_KEY`
- 対象DiscordサーバーID
  - 通常は `1499090620373929984`
- TANKI購入済みUnityプロジェクト
- PrivateアップロードできるVRChatワールド

## 導入の考え方

自動取得が動く条件は次の2段階です。

1. ワールド側で `MJS_RESULT:` がVRChatログへ出ること
2. PC側でそのログを監視ツールが拾えること

片方だけでは動きません。

## ワールド所有者側の作業

### 1. 自分のローカルUnityプロジェクトでTANKI側の結果ログ出力対応を入れる

重要:

- 共有された改造済みTANKIファイルを受け取って置き換える運用はしません。
- 必ず自分の購入済みTANKIプロジェクトで、自分のローカル環境に対して反映してください。

### 2. 自分のPCで1人 `Start -> End` テストを行う

監視ツールは後述のPC側手順で起動します。

確認ポイント:

- `Start -> End` 後に `localOnly ...` が出る
- `type`, `players`, `rawScore` がJSONで見える

1人テストでここまで通れば、暫定の終了時出力は動いています。

### 3. Privateアップロードする

ワールド更新後は、必ず新しいPrivateインスタンスで確認してください。

### 4. 相手に共有する情報

相手PC担当者には次を渡します。

- Privateワールドへ入る手順
- GitHubリポジトリURL
- `EXTERNAL_API_KEY`
- 対象DiscordサーバーID
- 自分のワールドは更新済みであること

## PC担当者側の作業

### 1. リポジトリを取得する

```powershell
git clone https://github.com/tengoku2/mahjong-status-system
cd mahjong-status-system
```

ZIP展開でも構いません。その場合は、展開先フォルダを把握してください。

### 2. Node環境を準備する

```powershell
.\scripts\with-node22.cmd install
```

もし `Node.js 22 was not found` が出たら、以下を実行します。

```powershell
winget install OpenJS.NodeJS.22
```

その後、PowerShellを開き直して再実行します。

### 3. VRChatを起動して対象Privateワールドへ入る

重要:

- 先にVRChatへ入る
- その後で監視ツールを起動する
- VRChatを再起動したら、監視ツールも起動し直す

### 4. 最新のVRChatログを確認する

```powershell
Get-ChildItem "C:\Users\USERNAME\AppData\LocalLow\VRChat\VRChat" -Filter "*output_log*.txt" -File | Sort-Object LastWriteTime -Descending | Select-Object -First 5 Name, FullName, LastWriteTime
```

`USERNAME` は実際のWindowsユーザー名へ置き換えてください。

表示された一番新しい `FullName` を使って、以後の監視を固定します。

### 5. ローカル確認モードで監視を起動する

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
& "実際のリポジトリパス\\scripts\\start-tanki-watch-localonly.ps1" -LogPath "最新output_logのFullName"
```

例:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
& "C:\Users\evama\Downloads\mahjong-status-system-main\mahjong-status-system-main\scripts\start-tanki-watch-localonly.ps1" -LogPath "C:\Users\evama\AppData\LocalLow\VRChat\VRChat\output_log_2026-05-14_21-27-02.txt"
```

### 6. 手動追記テストをする

監視ツールが正しいログを見ているか確認するため、別PowerShellで次を実行します。

```powershell
Add-Content -LiteralPath "最新output_logのFullName" -Value 'MJS_RESULT:{"type":"4","externalMatchId":"manual-log-test-001","players":[{"displayName":"TEST_PLAYER","rank":1,"rawScore":25000},{"displayName":"-","rank":2,"rawScore":25000},{"displayName":"-","rank":3,"rawScore":25000},{"displayName":"-","rank":4,"rawScore":25000}]}'
```

監視ツール側に次が出れば、PC側は正常です。

```text
localOnly manual-log-test-001 空席=2,3,4
```

### 7. TANKI側の `Start -> End` を確認する

同じ監視画面を開いたまま、ワールド内で `Start -> End` を行います。

ここで `localOnly ...` が出れば、ワールド側・PC側ともに通っています。

## 実メンバーでの確認順

1. 1人 `localOnly`
2. 相手PCで `localOnly`
3. 4人または3人の実メンバーで `dryRun`
4. 問題なければ `register`

## `dryRun` 起動

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
& "実際のリポジトリパス\\scripts\\start-tanki-watch-dryrun.ps1" -LogPath "最新output_logのFullName"
```

起動時に `EXTERNAL_API_KEY` を入力します。

## `register` 起動

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
& "実際のリポジトリパス\\scripts\\start-tanki-watch-register.ps1" -LogPath "最新output_logのFullName"
```

起動時に `REGISTER` と `EXTERNAL_API_KEY` を入力します。

## 判定表

- 手動追記で `localOnly` が出る
  - PC側は正常
- 手動追記では出るが `Start -> End` では出ない
  - ワールド側の `MJS_RESULT` 未出力
- `dryRun` で `ok: true`
  - Bot/API側は正常
- `displayName is not registered in this guild`
  - Discord側のVRC名登録不足
- メンバー限定エラー
  - 対象Discordサーバーへ参加していない、または紐付け先誤り

## 失敗時の戻し先

その場の運用を止めたくない場合は、手動登録へ切り替えます。

```text
/mjs add
/mjs matches
/mjs del match_id
/mjs undo
```
