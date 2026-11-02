// OpenCodeWorkpack (mirror edition)
// iPhone Scriptable widget: shows the OpenCode Go proposed workpack (plan
// view) from the public read-only mirror (B221393/kaggle-widget-data).
// No GitHub token needed.
// Mirror edition note: the original in yutotuy0209-droid/for-agent.md reads
// the private kaggle-lab repo via the Contents API + a Keychain token.
// This edition changes ONLY the fetch: it GETs the filtered JSON from
// raw.githubusercontent.com without authentication.
// IMPORTANT: this is a PLAN display. A state such as "proposed_not_claimed"
// does NOT mean the job is running.

const DATA_URL = "https://raw.githubusercontent.com/B221393/kaggle-widget-data/main/docs/task-queues/opencode_go_workpack.json";
const CACHE_NAME = "OpenCodeWorkpack-cache.json";

const fm = FileManager.local();
const cachePath = fm.joinPath(fm.documentsDirectory(), CACHE_NAME);

async function loadData() {
  try {
    const req = new Request(DATA_URL);
    req.timeoutInterval = 20;
    const json = await req.loadJSON();
    fm.writeString(cachePath, JSON.stringify(json));
    return { data: json, stale: false };
  } catch (e) {
    if (fm.fileExists(cachePath)) {
      const cached = JSON.parse(fm.readString(cachePath));
      return { data: cached, stale: true };
    }
    throw e;
  }
}

async function buildWidget() {
  const w = new ListWidget();
  w.setPadding(12, 12, 12, 12);

  const title = w.addText("OpenCode Go 提案ジョブ（計画）");
  title.font = Font.boldSystemFont(13);
  w.addSpacer(6);

  try {
    const { data, stale } = await loadData();
    const jobs = data.jobs || [];
    const shown = jobs.slice(0, 7);
    for (const j of shown) {
      const line = w.addText(`${j.id} [${j.wave}] ${j.model} / ${j.state}`);
      line.font = Font.systemFont(11);
      line.lineLimit = 1;
    }
    if (jobs.length > shown.length) {
      const more = w.addText(`…ほか ${jobs.length - shown.length} 件`);
      more.font = Font.systemFont(10);
      more.textColor = Color.gray();
    }
    const foot = w.addText(`計画作成: ${data.created_jst || "不明"}${stale ? "（通信失敗・キャッシュ表示）" : ""}`);
    foot.font = Font.systemFont(9);
    foot.textColor = Color.gray();
  } catch (e) {
    const err = w.addText("取得に失敗しました");
    err.font = Font.systemFont(11);
    err.textColor = Color.red();
  }
  return w;
}

const widget = await buildWidget();
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentMedium();
}
Script.complete();
