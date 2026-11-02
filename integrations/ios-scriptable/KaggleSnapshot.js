// KaggleSnapshot (mirror edition)
// iPhone Scriptable widget: shows recorded Kaggle ranks from the public
// read-only mirror (B221393/kaggle-widget-data). No GitHub token needed.
// Mirror edition note: the original in yutotuy0209-droid/for-agent.md reads
// the private kaggle-lab repo via the Contents API + a Keychain token.
// This edition changes ONLY the fetch: it GETs the filtered JSON from
// raw.githubusercontent.com without authentication. Displayed values are
// recorded snapshots, not live leaderboard values.

const DATA_URL = "https://raw.githubusercontent.com/B221393/kaggle-widget-data/main/reports/competition_structure.json";
const CACHE_NAME = "KaggleSnapshot-cache.json";

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

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso).slice(0, 10);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

async function buildWidget() {
  const w = new ListWidget();
  w.setPadding(12, 12, 12, 12);

  const title = w.addText("Kaggle 順位（記録値）");
  title.font = Font.boldSystemFont(13);
  w.addSpacer(6);

  let stale = false;
  try {
    const { data, stale: s } = await loadData();
    stale = s;
    const profiles = (data.profiles || []).filter(
      (p) => p.participation_snapshot && p.participation_snapshot.entered
    );
    const ranked = profiles.filter((p) => (p.participation_snapshot.user_rank || 0) > 0);
    const shown = ranked.slice(0, 7);
    for (const p of shown) {
      const snap = p.participation_snapshot;
      const name = String(p.name || p.id || "").replace(/^\d+_/, "");
      const line = w.addText(`${name}: ${snap.user_rank}位 / ${snap.team_count}`);
      line.font = Font.systemFont(11);
      line.lineLimit = 1;
    }
    if (ranked.length > shown.length) {
      const more = w.addText(`…ほか ${ranked.length - shown.length} 件`);
      more.font = Font.systemFont(10);
      more.textColor = Color.gray();
    }
    const asOf = shown.length && shown[0].participation_snapshot.as_of_utc;
    const foot = w.addText(`記録日: ${fmtDate(asOf)}${stale ? "（通信失敗・キャッシュ表示）" : ""}`);
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
