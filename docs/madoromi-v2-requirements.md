# まどろみ mjs v2 要件定義・開発案

作成日: 2026-06-19
最終更新: 2026-06-26

## 0. 現在の確定状態

2026-06-26 時点では、まどろみを active target とする。
旧コミュニティ向けの運用は legacy 扱いとし、追加開発の主対象にはしない。

現在の実装・運用状態:

- active guild はまどろみサーバーとする
- Aiven PostgreSQL と Koyeb 常時起動を本番相当環境として使う
- Discord Bot、外部 API、TANKI ログ取り込み、局単位スタッツ保存は稼働済み
- RuleSet / Event 基盤は導入済み
- Event 未指定の通常対局は、対局種別に対応する標準 Event へ登録する
- TANKI 由来の半荘結果は、最終持ち点、順位、局数、局単位スタッツを保存できる
- 4人半荘の外部取り込みでは、最終持ち点合計と供託の整合チェックを行う
- 中断扱いの対局は自動登録しない
- 現在は開発者本人の PC と本人のワールドで検証し、第三者向け導入手順は実装が固まってから整理する

直近で判明した運用上の注意:

- TANKI 側の結果出力タイミングによって、最後の和了点が最終持ち点へ反映される前に取り込まれる可能性があった
- この対策として、最終結果は確定後の値を取得する方針に変更する
- API 側でも、最終持ち点合計と供託の整合が崩れた payload は拒否する
- 既に壊れた形で登録された検証対局は、必要に応じて管理者が手動修正する

## 1. 背景

現在の mjs は、Discord 上で麻雀成績を記録・集計する Bot として運用している。
既に手動登録、TANKI 結果ログ取り込み、局単位スタッツの一部保存、Aiven PostgreSQL、Koyeb 常時起動まで到達している。

一方で、現行構成は以下の制約がある。

- TANKI 連携が VRChat のログとローカル PowerShell 監視に依存している
- 大会、通常卓、ルール差分を `tournamentName` だけで扱っており、将来拡張には弱い
- 飛びあり・飛びなしの切り替えが TANKI 側の挙動と Bot 側の成績管理で整理されていない
- 局単位データは取得し始めているが、牌譜屋のような詳細スタッツや牌譜出力にはまだ不十分
- VRChat ワールド内で成績を確認する仕組みはまだない

今後は「まどろみ」を主対象として、現行 mjs を壊さずに v2 として段階的に拡張する。

ただし、開発初期は他者運用や他者PCへの配布を前提にしない。
まずは開発者本人のPCと本人のVRChatワールドで完結する形で、仕様・TANKI連携・登録ロジック・集計ロジックを固める。

## 2. 目的

まどろみ v2 の目的は、VRChat 麻雀コミュニティで自然に使える成績管理基盤を作ることである。

主目的:

- 半荘・東風の結果を安定して自動登録する
- 通常卓、大会、リーグなどを明確に分けて管理する
- 飛びあり・飛びなしなどのルール差分を DB と表示に反映する
- 和了率、放銃率、立直率、副露率などの局単位スタッツを蓄積する
- 将来的に Mortal などで読める牌譜 JSON を出力できる土台を作る
- Discord だけでなく、VRChat ワールド内にも軽量な成績表示を持ち込む

## 3. 基本方針

### 3.1 現行 mjs は壊さない

既存の Discord Bot、既存 DB、既存コマンドは当面維持する。
白鳳会関連のデータや運用は、削除せず legacy として凍結扱いにする。
新規開発は、まどろみ v2 用のルール、イベント、TANKI v2 取り込み、ビュー API を追加する形で進める。

### 3.1.1 開発フェーズ

現在の優先順位は以下とする。

```text
フェーズ1: 開発者本人のPC・本人のワールドで完結
フェーズ2: 実装が固まった後、別ワールドへ導入できる手順を整理
フェーズ3: 必要に応じて、他者へ渡せる導入マニュアル・パッチ・運用手順を作る
```

フェーズ1では、他者PCでのPowerShell監視、ショートカット配布、Git導入手順、相手環境向けのTANKIパッチ配布は優先しない。
本人環境で迷わず検証・運用できることを優先する。

ただし、将来的に別ワールドで他者へ実装依頼する可能性は残す。
そのため、実装が固まった後に、導入手順・注意点・必要ファイル・TANKI側変更点を第三者向けにまとめ直す。

### 3.2 TANKI 内部情報は公開しない

TANKI 側の連携は、作者回答で許可された範囲に限定する。
公開リポジトリや共有文書には、TANKI のアセット本体、内部コード、Prefab、内部構造、具体的な内部名を含めない。

公開側で扱うデータは、以下のような中立的な対局データに限定する。

- VRChat DisplayName
- 順位
- 最終持ち点
- 対局種別
- 対局日時
- 外部対局 ID
- 局単位の結果・行動情報

### 3.3 ワールド内表示は軽量にする

VRChat ワールド内でリッチなグラフを直接作ることは初期スコープにしない。
サーバー側でランキングや個人成績を文字列化し、ワールド側はそれを表示するだけにする。

イメージは、VRC イベントカレンダーのような軽量テキストビューである。

### 3.4 牌譜は最初から完成形を狙わない

Mortal 互換 JSON を最終目標に置くが、最初から完全対応は狙わない。
まずは独自の中立的な局イベントログを保存し、後から Mortal 形式へ変換する。

最初の対象は 4人半荘を優先する。

## 4. 対象範囲

### 4.1 初期対象

- まどろみ用の通常卓
- まどろみ用の大会・イベント
- 3人半荘、4人半荘
- 半荘結果の自動登録
- 局単位スタッツの蓄積
- Discord 上の成績表示
- VRChat ワールド内の軽量テキスト表示
- 4人半荘の牌譜 JSON 出力に向けた基礎データ保存

### 4.2 初期対象外

- VRChat ワールド内でのリッチなグラフ表示
- ワールド内だけで完結する DB や集計処理
- TANKI 内部構造の公開
- TANKI の有料アセットや改造済みアセットの再配布
- すべての牌譜ビューアへの完全互換
- 対局中リアルタイムの全操作可視化

## 5. 全体構成案

```text
TANKI / VRChat World
  |
  | 1. 最終結果・局結果・必要なら牌譜イベント
  v
mjs API
  |
  | 2. 入力検証、名前解決、重複検出、ルール適用
  v
PostgreSQL
  |
  | 3. 集計、ランキング、ビュー生成、牌譜変換
  v
Discord Bot / Web App / VRChat Text View / JSON Export
```

現行の PowerShell 監視は、最終的には本番運用から外す。
ただし、ローカルテスト、障害調査、TANKI パッチ検証用のデバッグ手段として残す。

## 6. 主要データモデル案

### 6.1 RuleSet

ルール差分を表す。

```ts
RuleSet {
  rule_set_id: string
  guild_id: string

  name: string
  type: "3p" | "4p"

  start_score: number
  return_score: number
  uma: number[]

  allow_bust: boolean
  created_at: datetime
  updated_at: datetime
}
```

例:

- 通常 4人半荘: 飛びあり
- 大会 4人半荘: 飛びなし
- 通常 3人半荘: 飛びあり
- 大会 3人半荘: 飛びなし

### 6.2 Event

大会、リーグ、通常会などのまとまりを表す。
現行の `tournamentName` は将来的に Event へ移行する。

```ts
Event {
  event_id: string
  guild_id: string
  rule_set_id: string

  name: string
  kind: "normal" | "tournament" | "league" | "test"
  status: "active" | "closed" | "archived"

  starts_at: datetime?
  ends_at: datetime?

  created_at: datetime
  updated_at: datetime
}
```

大会は `tournamentName` ではなく、Event と RuleSet の組み合わせで表現する。

### 6.3 Match

半荘・東風単位の対局を表す。

```ts
Match {
  match_id: string
  guild_id: string
  event_id: string?
  rule_set_id: string

  type: "3p" | "4p"
  external_source: string?
  external_match_id: string?

  played_at: datetime
  created_at: datetime

  aborted: boolean
  abort_reason: string?
}
```

### 6.4 Result

対局ごとの個人成績を表す。

```ts
Result {
  result_id: string
  match_id: string
  user_id: string

  rank: number
  raw_score: number
  point: number
}
```

### 6.5 Hand

局単位の情報を表す。

```ts
Hand {
  hand_id: string
  match_id: string

  hand_index: number
  round_number: number
  honba: number
  kyotaku: number
  round_wind: string?

  end_type: "RON" | "TSUMO" | "RYUKYOKU" | "ABORTIVE_DRAW" | "UNKNOWN"
  created_at: datetime
}
```

### 6.6 HandPlayerStat

局ごとのプレイヤー行動・結果を表す。

```ts
HandPlayerStat {
  hand_player_stat_id: string
  hand_id: string
  user_id: string

  seat: number
  start_score: number?
  end_score: number?

  won: boolean
  won_by_tsumo: boolean
  dealt_in: boolean
  declared_riichi: boolean
  called_open_meld: boolean

  is_dama: boolean?
  is_tenpai_at_ryukyoku: boolean?

  win_score: number?
  deal_in_score: number?
  win_order: number?

  ippatsu_win: boolean?
  ura_dora_count: number?
}
```

### 6.7 ReplayEvent

将来の牌譜変換用に、局中のイベントを中立形式で保存する。

```ts
ReplayEvent {
  replay_event_id: string
  hand_id: string

  event_index: number
  event_type: string
  actor_seat: number?
  payload: Json
}
```

この時点では Mortal 形式に固定しない。
まずは mjs 内部で扱いやすい中立形式にし、後段で Mortal JSON へ変換する。

## 7. ルール要件

### 7.1 飛びあり・飛びなし

飛びあり・飛びなしは RuleSet の `allow_bust` で管理する。

- `allow_bust = true`: 誰かが 0点未満になった時点で終了する
- `allow_bust = false`: 0点未満になっても続行する

大会では原則 `allow_bust = false` を使う。
通常卓では現行 TANKI に近い `allow_bust = true` を初期値にする。

### 7.2 TANKI 側への影響

飛びなしを実現するには、TANKI 側の終了条件にも変更が必要になる可能性が高い。
これは Bot 側だけでは完結しない。

そのため、最初は以下の順で進める。

1. Bot / DB 側に `allow_bust` を持たせる
2. TANKI 側で飛びなしモードの検証パッチを作る
3. ローカル実機で半荘終了条件を確認する
4. まどろみ用ワールドへ private パッチとして導入する

### 7.3 3人戦・4人戦の分離

すべての成績、ランキング、局スタッツ、ビューは 3人戦と 4人戦を分離する。
混合ランキングは初期スコープにしない。

## 8. TANKI v2 取り込み要件

### 8.1 本番方式

最終的には、TANKI から mjs API へ直接送信する。
PowerShell 監視を本番運用に必須としない。

### 8.2 デバッグ方式

PowerShell 監視は以下の用途で残す。

- ローカルテスト
- TANKI パッチ検証
- ログからの再送
- 障害調査

### 8.3 入力データ

TANKI v2 の入力は、TANKI 内部構造ではなく中立的な API payload とする。

```ts
TankiMatchPayload {
  externalSource: "tanki"
  externalMatchId: string
  guildId: string
  eventId?: string
  ruleSetId?: string

  type: "3" | "4"
  playedAt?: string
  aborted?: boolean
  abortReason?: string

  players: Array<{
    displayName: string
    rank: number
    rawScore: number
  }>

  hands?: TankiHandPayload[]
  replayEvents?: TankiReplayEventPayload[]
}
```

### 8.4 バリデーション

API 側では以下を検証する。

- guildId が許可対象である
- eventId / ruleSetId が guild 内に存在する
- type と人数が一致する
- rank が重複しない
- displayName が guild 内の登録済みユーザーへ一意に解決できる
- externalSource + externalMatchId が重複していない
- aborted が true の対局は自動登録しない
- 中断局、未確定局は局スタッツへ含めない

### 8.5 中断対局

途中終了、退席、強制終了、未確定終了は自動登録しない。
取り込み側では、管理者が判断できるメッセージを出す。

必要になった場合のみ、管理者確認付きの手動登録フローを別途用意する。

## 9. 局単位スタッツ要件

局単位スタッツの定義は `docs/hand-stats-definition.md` を正とする。
主な表示対象は以下。

- 和了率
- ダマ率
- 副露率
- 平均和了
- 飛び率
- 放銃率
- 流局率
- 立直率
- 平均放銃
- 自摸率
- 流局聴牌率
- 平均和了順数

Discord 上では見やすさを優先し、主要指標を中心に表示する。
WebApp や VRChat ワールド内の詳細表示では、より多くの指標を扱えるようにする。

## 10. 牌譜 JSON 要件

### 10.1 最終目標

将来的に Mortal などで読み込める牌譜 JSON を出力する。
まずは 4人半荘を対象にする。

### 10.2 初期方針

最初から Mortal 形式に DB を合わせない。
以下の2段階に分ける。

1. mjs 内部の中立的な replay event を保存する
2. export 時に Mortal 互換 JSON へ変換する

### 10.3 出力方法

初期案:

- 管理者向け API で JSON を取得する
- Discord コマンドで直近対局の JSON を出力する
- WebApp からダウンロードする

ファイル保存先や公開範囲は、個人情報と運用負荷を見て後で決める。

## 11. VRChat ワールド内ビュー要件

### 11.1 初期表示

VRChat ワールド内では、サーバーが生成したテキストを表示する。

初期候補:

- 今日の対局履歴
- 最新ランキング
- イベントランキング
- 個人成績
- お知らせ

### 11.2 API 案

```text
GET /vrc/views/latest
GET /vrc/views/ranking
GET /vrc/views/player
GET /vrc/views/event
```

レスポンス案:

```json
{
  "title": "まどろみ 4人半荘ランキング",
  "body": "1位 ...\\n2位 ...\\n3位 ...",
  "updatedAt": "2026-06-19T12:00:00.000Z"
}
```

### 11.3 更新頻度

初期は 30秒から数分程度の更新でよい。
対局中リアルタイム更新は初期スコープにしない。

## 12. Discord コマンド案

既存コマンドは維持する。
追加・整理候補は以下。

```text
/mjs event create
/mjs event close
/mjs event list
/mjs event ranking
/mjs ruleset create
/mjs ruleset list
/mjs stats event
/mjs replay export
```

最初からすべてを Slash Command 化しない。
API と DB を先に安定させ、実運用で必要なものから Discord UI を足す。

## 13. 開発フェーズ案・進捗

### Phase 0: 現状固定

目的:

- 白鳳会向けの追加開発を止める
- 現行 mjs を壊さない
- まどろみ v2 の設計を分離する

成果物:

- 本ドキュメント
- legacy / active の運用方針

状態:

- 完了
- 旧データは削除せず legacy として残す
- 新規検証はまどろみを主対象にする

### Phase 1: RuleSet / Event 基盤

目的:

- `tournamentName` 依存から脱却する
- 通常卓、大会、リーグを DB 上で分けられるようにする
- 飛びあり・飛びなしを RuleSet として管理する

成果物:

- Prisma schema 追加
- migration
- 初期 RuleSet seed
- Event 作成・一覧 API
- 既存 Match との互換

状態:

- 完了
- 通常戦用の標準 Event / RuleSet を使って登録できる
- Event 未指定の TANKI 取り込みは、対局種別に対応する通常 Event へ寄せる

### Phase 2: TANKI v2 取り込み

目的:

- eventId / ruleSetId を含む新 payload を受け付ける
- 中断対局を自動登録しない
- PowerShell 監視をデバッグ用途へ寄せる

成果物:

- `/api/tanki/v2/matches` 追加
- duplicate 検出
- 取り込みテスト
- watcher の v2 対応

状態:

- 進行中
- 半荘結果、局単位情報、重複検出、外部 API 登録は稼働済み
- 中断対局は自動登録しない
- 最終持ち点合計と供託の整合チェックを追加済み
- 直近の課題は、最終結果が完全に確定した後の値だけを登録すること

### Phase 3: 飛びなし TANKI パッチ

目的:

- 大会用の飛びなし半荘を実現する
- TANKI 側終了条件と mjs 側 RuleSet を一致させる

成果物:

- private patch
- ローカル実機テスト
- 相手ワールド向け導入手順
- 失敗時の戻し手順

状態:

- 未着手
- まずは Bot / DB 側の RuleSet と Event を安定させる
- TANKI 側の飛びなし検証は、通常登録が安定した後に着手する

### Phase 4: VRChat テキストビュー

目的:

- ワールド内にランキングや個人成績を表示する
- ワールド側の処理を軽量に保つ

成果物:

- view API
- 表示用レスポンス形式
- キャッシュ
- ワールド側導入手順

状態:

- 未着手
- Discord 側の集計結果が安定してから、軽量テキスト API として作る

### Phase 5: 牌譜基礎データ保存

目的:

- 将来の Mortal 出力に必要な中立 replay event を保存する
- 局スタッツと牌譜データを混同しない

成果物:

- ReplayEvent schema
- 保存 API
- テスト payload
- 最低限のデータ完全性チェック

状態:

- 未着手
- 局単位スタッツが安定した後に進める
- 捨て牌、ツモ、鳴き、和了処理などを扱う場合も、中立形式で保存する

### Phase 6: Mortal JSON export

目的:

- 4人半荘から Mortal 互換 JSON を出力する

成果物:

- export 変換器
- サンプル出力
- 読み込み検証
- 未対応項目の明示

状態:

- 未着手
- 牌譜基礎データ保存ができてから対応する

### Phase 7: WebApp / 牌譜屋風表示

目的:

- Discord では見づらい詳細スタッツを Web で見る
- 直接対決、期間比較、イベント比較を扱う

成果物:

- プレイヤーページ
- ランキングページ
- 対局履歴ページ
- 直接対決ページ
- 詳細スタッツページ

状態:

- 未着手
- Discord では見づらい詳細データの表示先として後段で検討する

## 14. 運用方針

### 14.1 白鳳会

白鳳会関連は現状維持とする。
こちらから追加保守、個別説明、要望受付は行わない。
データ削除は、明確な理由が出るまで行わない。

### 14.2 まどろみ

まどろみを今後の active target とする。
新機能はまどろみで検証し、安定したものだけ汎用化する。

### 14.3 セキュリティ

- API key は公開しない
- `.env` は Git 管理しない
- TANKI 由来の private patch や生ログは公開しない
- DB は guild 単位で分離する
- VRC 表示 API は必要に応じて key や allowlist を付ける

## 15. 未決定事項

- TANKI から API へ直接送る実装方式
- 飛びなし時の TANKI 側 UI 表示
- Mortal export の最小必須項目
- VRChat ワールド内ビューの更新頻度
- WebApp をいつ作るか
- 補正点入力を Discord コマンドで先に作るか、管理用 Web まで待つか
- 牌譜保存で最初に扱うイベント粒度
- 外部 API へ直接送信する最終運用に移るタイミング

## 16. 直近の推奨ネクストアクション

1. ローカル実機で、最終結果が確定後の点数で出力されることを確認する
2. localOnly で、最終持ち点合計と供託の整合が取れていることを確認する
3. register で、まどろみサーバーへ通常 4人半荘として登録する
4. Discord 上で `/mjs matches`、`/mjs stats`、`/mjs rank` を確認する
5. 局単位スタッツの値が、実際の対局内容と大きくずれていないか確認する
6. 問題がなければ、同じ流れで 3人半荘も検証する
7. 半荘結果と局単位スタッツが安定したら、牌譜基礎データ保存の設計へ進む

現在の優先度は、TANKI v2 取り込みの安定化、Discord 上の確認、局単位スタッツの精度確認の順とする。
飛びなし、VRChat テキストビュー、Mortal JSON export、WebApp はその後に進める。
