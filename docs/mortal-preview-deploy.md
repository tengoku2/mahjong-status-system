# Mortal練習ノートの試験配置

入口は `https://mjs-tengoku2-a8a007d5.koyeb.app/mortal-preview/analysis/`。
専用のHTTP Basic認証を使い、ユーザー名とパスワードをブラウザーの認証欄に入力する。
Discord OAuth、投稿受付、複数人集計は今回の範囲に含めない。
試験配置は既存のFreeインスタンスの無料枠で行う。有料プランへの変更、有料ボリューム、追加サービスは使わない。

## 配置するもの

生成済みの `analysis/index.html` と、manifestに列挙した `match_data/` の検討HTMLだけを配信する。
HTMLのバイト列は変更しない。相対リンクと局アンカーも維持する。
manifestは整合性確認にだけ使い、HTTPでは配信しない。
DB、認証情報、取得キュー、判断JSON、その他の原本は配置しない。

**公開Gitには配信コードと手順だけを置く。HTML・圧縮データ・暗号化ファイルは履歴にも含めない。**
配置データはKoyebの非公開のconfig fileとしてサービスへ直接登録する。
ファイルの内容はgzip JSONをBase64にした文字列であり、暗号化ではない。
これを公開URL、公開Git、公開ビルド成果物へ置かない。

## 初回の準備と設定

```powershell
scripts\with-node22.cmd run mortal:prepare -- --source "C:\Users\81906\Documents\ChatGPT\mortal-reviewer\.cache\view-deploy\2ce1fc0b6c5aeb09"
```

manifestの全ファイルのサイズ・SHA-256を検証し、圧縮・復元後にも照合する。
検証成功後に一時ファイルをrenameして更新するため、入力不備で前回ファイルを壊さない。
次のローカルファイルはすべてGit・Dockerの対象外。

- `.private/mortal-preview.bundle.b64`: Koyebへ直接登録する配置データ
- `.private/mortal-preview.env`: Koyebへ設定する認証情報のハッシュ1行
- `.private/mortal-preview-access.txt`: 本人用の閲覧URL・ユーザー名・パスワード

Koyebの既存mjsサービスのSettingsで「Environment variables and files」を開く。

1. 環境変数 `MORTAL_PREVIEW_AUTH_SHA256` に `.private/mortal-preview.env` の値を設定する。Secretからの参照も利用できる。
2. Filesで `.private/mortal-preview.bundle.b64` を追加し、配置先を `/app/private/mortal-preview.bundle.b64`、permissionを `0600` にする。
3. 既存の環境変数、ポート、Bot、DB、ヘルスチェック設定を保って配置する。

既定以外の場所へ配置する場合は、環境変数 `MORTAL_PREVIEW_BUNDLE_PATH` へ絶対パスを設定する。
Koyebのconfig fileはruntimeで追加される。Gitからのビルドでは私的データを取得しない。
同じサービス設定を使う再起動・再デプロイでは、config fileから同じデータを読み直す。
別deploymentへ切り戻す場合は、そのdeploymentのconfig fileも確認する。

設定不足・ファイル欠落・破損時はpreviewだけ503になり、既存のBot/API/healthの起動は妨げない。
preview以下の全HTML・エラーパスで先に認証を要求し、許可したHTML以外は配信しない。

Koyebの公式の[config file設定手順](https://www.koyeb.com/docs/build-and-deploy/config-files)も参照。

## 確認

```powershell
scripts\with-node22.cmd test
scripts\with-node22.cmd run build
python C:/Users/81906/.codex/skills/mahjong-status-japanese-encoding/scripts/check_japanese_encoding.py C:/Users/81906/Documents/GitHub/mahjong-status
scripts\with-node22.cmd run mortal:check -- --base-url https://mjs-tengoku2-a8a007d5.koyeb.app --source "C:\Users\81906\Documents\ChatGPT\mortal-reviewer\.cache\view-deploy\2ce1fc0b6c5aeb09"
```

HTTP確認は全HTMLの匿名アクセス401、認証後200、サイズとSHA-256、HEAD、
`/health` と `/health/db` のGET・HEAD、対局APIのGET拒否を検証する。
結果は `.private/mortal-preview-verification.json` に保存する。
対局登録APIへ試験データを書き込む確認は行わない。

ブラウザーではrating推移・成長表示、閾値0.10/0.20/0.50、代表局面の開閉、
手牌・副露・候補手の画像、検討HTML4件と局アンカーを確認する。
再デプロイ後にもHTTP確認を繰り返す。

各ページに `private, no-store` と `no-referrer`、検索除外ヘッダーを付ける。
元の検討HTMLにある解析スクリプトと天鳳の埋め込み牌譜はCSPで読み込みを止める。
埋め込みの再生は利用できないが、局面本文・牌画像・局アンカーは利用できる。
数式表示に必要なKaTeX 0.16.4の固定URLからのJS/CSS/fontだけを許可する。
ノート入口は外部アセットなしで動作する。

## 更新と切り戻し

1. 生成元で新しいスナップショットとmanifestを作る。
2. 新しい場所を指定して `mortal:prepare` を実行する。閲覧パスワードは再利用する。
3. Koyebのconfig fileの内容を新しい `.private/mortal-preview.bundle.b64` に差し替え、配置する。表示更新だけならGitへのpushは不要。
4. 新しいスナップショットを指定してHTTP・ブラウザー確認を行う。

不具合時は、Koyebの前回正常なdeploymentを選び、そのconfig fileとともに再配置する。
表示データだけ戻す場合は、旧スナップショットから `mortal:prepare` してconfig fileを戻す。
コードだけ切り戻す場合もconfig fileと認証設定の組み合わせを確認する。
閲覧停止は `MORTAL_PREVIEW_AUTH_SHA256` を外して再配置する。previewは503になる。
ローカルの配置ファイルと閲覧情報は本人が安全な場所へ保管する。

## 将来案

Discordでの本人認証、本人別の継続集計、メンバー一覧、HTML提出、提出者と検討対象者の区別、
重複提出・誤提出への対応は生成元の `ANALYSIS_SPEC.md` に記録した相談事項として維持する。
HTML内のプレイヤーIDは座席番号なのでDiscordの本人識別に流用しない。
