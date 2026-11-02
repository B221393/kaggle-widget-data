# kaggle-widget-data

iPhone 用 Scriptable ウィジェット（Kaggle 順位・OpenCode Go 提案ジョブ）のための、**読み取り専用の公開ミラー**です。

- 正本は非公開リポジトリ `B221393/kaggle-lab` で、**kaggle-lab 本体は非公開のまま**です。このミラーには、ウィジェットの表示に必要な項目だけを抜粋して置きます。
- 認証は不要です。スクリプトは `raw.githubusercontent.com` の URL をそのまま GET します（GitHub トークンの発行・貼り付けは不要）。

## 置いてあるもの

| パス | 内容 | 元ファイル（kaggle-lab） |
| --- | --- | --- |
| `reports/competition_structure.json` | 参加競技の記録スナップショット（表示用項目のみ） | `reports/competition_structure.json` |
| `reports/history.json` | 公式メダル対象コンペの順位・点数の時系列（日付・順位・点数のみ、全て出典のある実測） | 週次スナップショット・提出記録・Kaggle API 実測 |
| `docs/task-queues/opencode_go_workpack.json` | OpenCode Go 提案ジョブの一覧（表示用項目のみ） | `docs/task-queues/opencode_go_workpack.json` |
| `integrations/ios-scriptable/KaggleSnapshot.js` | Scriptable スクリプト（ミラー版） | ― |
| `integrations/ios-scriptable/OpenCodeWorkpack.js` | Scriptable スクリプト（ミラー版） | ― |

## 公開している項目（これ以外は含みません）

- 競技: `id`、`name`、`participation_snapshot`（`as_of_utc`、`entered`、`user_rank`、`team_count`、`deadline_utc`、`state`）のみ。
  - hypotheses・evidence・execution_records・比較ゲート等の内部情報は**含みません**。
  - CASMI26・QCC・name-that-llm・ARC-AGI-2 の順位は 2026-11-02 夜に Kaggle API で実測した値に更新済み。それ以外は kaggle-lab の記録（2026-10-23）どおりです。
  - 表示される順位は**記録値**であり、Kaggle 公式 Leaderboard の現在値ではありません。
- ジョブ: `id`、`wave`、`model`、`title`、`state` のみ。action・deliverable・acceptance・source 等の作業内容は**含みません**。
  - `proposed_not_claimed` は「提案済み・未受領」で、実行中を意味しません（計画の表示です）。

## スクリプトについて

- ミラー版は、for-agent.md 側の正本スクリプトと表示契約を揃え、取得方法だけを「private リポ＋トークン」から「このミラーの raw URL（認証なし）」に変えたものです。
- `KaggleSnapshot` は `history.json` を読み、順位（青・上ほど改善）と点数（橙）の推移を横軸=時間の折れ線で描きます。CASMI を先頭に大きく表示します。
- `OpenCodeWorkpack` は jobs の state から進捗率を計算し、0–100% の横バーと大きな % で表示します（計画表示である明示つき）。
- 通信失敗時は、最後に取得できた内容をキャッシュ表示し、その旨を表示します。
- 個人タスク用 `PersonalTasks` は iPhone ローカル完結で、このミラーは使いません（従来どおり for-agent.md の案内から導入してください）。

## iPhone への導入（トークン不要）

1. App Store で Scriptable をインストールする。
2. このリポジトリの `integrations/ios-scriptable/` にある `KaggleSnapshot.js` と `OpenCodeWorkpack.js` を、それぞれ同名（`KaggleSnapshot` / `OpenCodeWorkpack`）で Scriptable に新規スクリプトとして貼り付ける。
3. 各スクリプトをアプリ内で一度開き、プレビューが表示されることを確認する。
4. ホーム画面を長押し →「編集」→「ウィジェットを追加」→「Scriptable」で中サイズを配置し、スクリプトを割り当てる。

`GitHubAccessSetup` の実行と GitHub トークンの登録は不要です。

## 更新方法

kaggle-lab 側の元ファイルが更新されたら、同じ項目の絞り込みを再適用して、このリポジトリの同名ファイルを更新します（絞り込み前の生 JSON は置きません）。`reports/history.json` は、週次順位スナップショットのたびに当週の実測点（日付・順位・点数）を追記して push します。
