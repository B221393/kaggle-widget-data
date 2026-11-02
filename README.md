# kaggle-widget-data

iPhone 用 Scriptable ウィジェット（Kaggle 順位・OpenCode Go 提案ジョブ）のための、**読み取り専用の公開ミラー**です。

- 正本は非公開リポジトリ `B221393/kaggle-lab` で、**kaggle-lab 本体は非公開のまま**です。このミラーには、ウィジェットの表示に必要な項目だけを抜粋して置きます。
- 認証は不要です。スクリプトは `raw.githubusercontent.com` の URL をそのまま GET します（GitHub トークンの発行・貼り付けは不要）。

## 置いてあるもの

| パス | 内容 | 元ファイル（kaggle-lab） |
| --- | --- | --- |
| `reports/competition_structure.json` | 参加競技の記録スナップショット（表示用項目のみ） | `reports/competition_structure.json` |
| `reports/history.json` | 公式メダル対象コンペの順位・点数の時系列（日付・順位・点数のみ、全て出典のある実測） | 週次スナップショット・提出記録・Kaggle API 実測 |
| `reports/widget_design.json` | 両ウィジェット共通のデザイン設定（プリセット dark / light / minimal と `active_preset`） | ― |
| `docs/task-queues/opencode_go_workpack.json` | OpenCode Go 提案ジョブの一覧（表示用項目のみ。各ジョブに短い表示名 `label` つき） | `docs/task-queues/opencode_go_workpack.json` |
| `integrations/ios-scriptable/KaggleSnapshot.js` | Scriptable スクリプト（ミラー版） | ― |
| `integrations/ios-scriptable/OpenCodeWorkpack.js` | Scriptable スクリプト（ミラー版） | ― |

## 公開している項目（これ以外は含みません）

- 競技: `id`、`name`、`participation_snapshot`（`as_of_utc`、`entered`、`user_rank`、`team_count`、`deadline_utc`、`state`）のみ。
  - hypotheses・evidence・execution_records・比較ゲート等の内部情報は**含みません**。
  - CASMI26・QCC・name-that-llm・ARC-AGI-2 の順位は 2026-11-02 夜に Kaggle API で実測した値に更新済み。それ以外は kaggle-lab の記録（2026-10-23）どおりです。
  - 表示される順位は**記録値**であり、Kaggle 公式 Leaderboard の現在値ではありません。
- ジョブ: `id`、`wave`、`model`、`title`、`state`、短い表示名 `label` のみ。action・deliverable・acceptance・source 等の作業内容は**含みません**。
  - `proposed_not_claimed` は「提案済み・未受領」で、実行中を意味しません（計画の表示です）。

## スクリプトについて

- ミラー版は、for-agent.md 側の正本スクリプトと表示契約を揃え、取得方法だけを「private リポ＋トークン」から「このミラーの raw URL（認証なし）」に変えたものです。
- `KaggleSnapshot` は単一のウィジェットで、`history.json` を読み、順位（青・上ほど改善）と点数（橙）の推移を横軸=時間の折れ線で描きます。
- **運用はルール駆動で、個別の削除・切り替え作業は発生しません。** 表示するコンペは各コンペの `deadline`（UTC）で自動判定します。終了したコンペは締切から1週間だけ表示が残り、その後は自動で外れます。大きく描く「主役」は、`history.json` の `priority_order`（優先順のコンペ id 配列、現在は CASMI → QCC → Gemma → name-that-llm）の中で、表示中かつ**締切前**の最上位のものが自動でなります。締切を過ぎたコンペは表示が残っていても主役からは即座に外れ、次の優先コンペが主役になります。締切まで24時間を切ったコンペは、ラベルと線が警告色（赤）で表示されます。週次スナップショットで history が伸びれば、表示の出入りも主役の切り替えも全て自動で追随します。
- 新しいコンペは項目（deadline つき）を追加すれば表示されます。`visible: false` は例外用の即時非表示オーバーライドとして残しています。表示順は `order` で制御します。いずれもスクリプトの再配布は不要です。
- `OpenCodeWorkpack` は、最上段に「いま」（実行中の仕事、無ければ次に実行予定の仕事を、データ側の短い表示名 `label` で大きく表示）、その下に「つぎ」（続く仕事を最大2件）、さらに大きな % と 0–100% の横バー、状態別件数を表示します（計画表示である明示つき）。状態は色分けした小さなチップ（▶ 実行中・○ 待機中・⏸ 保留・✓ 完了）で示します。進捗率の計算方法と状態別件数は従来どおりです。
- **デザイン変更は `reports/widget_design.json` の `active_preset` を変えるだけです。スクリプトの貼り直しは不要です。** 両ウィジェット（KaggleSnapshot / OpenCodeWorkpack）は起動時にこのファイルを読み、背景色・文字色・線の色と太さ・進捗バーとチップの色・フォントサイズ・余白などの視覚パラメータを全てそこから取得します。プリセットは dark（初期値・ダーク基調）/ light（従来寄り）/ minimal（線と現在値だけの簡素なもの）の3種で、プリセット内の値を書き換えれば細部もデータ側だけで調整できます。デザイン設定が取得できない場合は、最後に取得できたキャッシュ、それも無ければスクリプト内蔵の既定値（dark と同値）で表示します。**今回のスクリプト貼り替えが最後で、今後のデザイン変更は全てデータ側だけで完結します。**
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
