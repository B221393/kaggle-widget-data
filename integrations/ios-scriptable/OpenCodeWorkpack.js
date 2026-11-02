// OpenCodeWorkpack (mirror edition, progress-bar version)
// iPhone Scriptable widget: shows the OpenCode Go proposed workpack as a
// progress percentage with a 0-100% bar, from the public read-only mirror
// (B221393/kaggle-widget-data). No GitHub token needed.
// IMPORTANT: this is a PLAN display. Progress is computed from the plan's
// recorded job states; a state such as "proposed_not_claimed" does NOT
// mean the job is running.

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

// === PROGRESS START (pure functions, unit-tested off-device) ===
// Weight of a job state: finished = 1, in progress = 0.5, otherwise 0.
function stateWeight(state) {
  const s = String(state || "").toLowerCase();
  if (/(done|complete|completed|merged|accepted|adopted|finished|closed)/.test(s)) return 1;
  if (/(progress|running|claimed|working|started|active)/.test(s) && !/(not_claimed|unclaimed)/.test(s)) return 0.5;
  return 0;
}

function stateCategory(state) {
  const w = stateWeight(state);
  return w === 1 ? "done" : w === 0.5 ? "active" : "pending";
}

function progressOf(jobs) {
  if (!jobs.length) return { pct: 0, done: 0, active: 0, pending: 0, total: 0 };
  let sum = 0, done = 0, active = 0, pending = 0;
  for (const j of jobs) {
    const w = stateWeight(j.state);
    sum += w;
    const c = stateCategory(j.state);
    if (c === "done") done++;
    else if (c === "active") active++;
    else pending++;
  }
  return { pct: Math.round((sum / jobs.length) * 100), done, active, pending, total: jobs.length };
}

// Pixel x of the filled edge of a 0-100% bar.
function barFillWidth(pct, trackW) {
  const p = Math.max(0, Math.min(100, pct));
  return Math.round((p / 100) * trackW);
}
// === PROGRESS END ===

function shortState(state) {
  const s = String(state || "");
  if (s === "proposed_not_claimed") return "提案";
  const c = stateCategory(s);
  return c === "done" ? "完了" : c === "active" ? "進行中" : s;
}

const ACCENT = new Color("#2563eb");
const TRACK = new Color("#e3e3e8");
const TICK = new Color("#b9b9c0");
const SUB = new Color("#6e6e73");

function buildBar(pct, W) {
  const H = 34;
  const ctx = new DrawContext();
  ctx.size = new Size(W, H);
  ctx.opaque = false;
  const trackW = W - 2;
  // track + fill
  ctx.setFillColor(TRACK);
  ctx.fillRect(new Rect(1, 2, trackW, 12));
  const fw = barFillWidth(pct, trackW);
  if (fw > 0) {
    ctx.setFillColor(ACCENT);
    ctx.fillRect(new Rect(1, 2, fw, 12));
  }
  // ticks + % labels at 0 / 25 / 50 / 75 / 100
  ctx.setFillColor(TICK);
  ctx.setFont(Font.systemFont(8));
  ctx.setTextColor(SUB);
  for (const t of [0, 25, 50, 75, 100]) {
    const x = 1 + Math.round((t / 100) * trackW);
    ctx.fillRect(new Rect(x - 0.5, 15, 1, 4));
    const label = `${t}%`;
    const lx = t === 100 ? x - 22 : t === 0 ? x - 1 : x - 9;
    ctx.drawText(label, new Point(lx, 21));
  }
  return ctx.getImage();
}

async function buildWidget() {
  const w = new ListWidget();
  w.setPadding(10, 12, 8, 12);

  const title = w.addText("OpenCode Go ワーク進捗（計画）");
  title.font = Font.boldSystemFont(13);
  w.addSpacer(4);

  try {
    const { data, stale } = await loadData();
    const jobs = data.jobs || [];
    const prog = progressOf(jobs);
    const family = config.widgetFamily || "medium";
    const W = family === "small" ? 148 : 300;

    const pctText = w.addText(`${prog.pct}%`);
    pctText.font = Font.boldSystemFont(26);
    pctText.textColor = ACCENT;
    const bar = w.addImage(buildBar(prog.pct, W));
    bar.imageSize = new Size(W, 34);
    w.addSpacer(2);

    const brk = w.addText(`完了 ${prog.done}件 · 進行中 ${prog.active}件 · 提案（未着手）${prog.pending}件 / 全${prog.total}件`);
    brk.font = Font.systemFont(10);
    w.addSpacer(3);

    const shown = jobs.slice(0, family === "large" ? 8 : 4);
    for (const j of shown) {
      const line = w.addText(`${j.id} ${j.model} · ${shortState(j.state)}`);
      line.font = Font.systemFont(10);
      line.lineLimit = 1;
    }
    if (jobs.length > shown.length) {
      const more = w.addText(`…ほか ${jobs.length - shown.length} 件`);
      more.font = Font.systemFont(9.5);
      more.textColor = Color.gray();
    }
    const foot = w.addText(`計画表示（提案は実行中ではありません） · 計画作成: ${data.created_jst || "不明"}${stale ? "（通信失敗・キャッシュ表示）" : ""}`);
    foot.font = Font.systemFont(8.5);
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
} else if (config.widgetFamily === "large") {
  await widget.presentLarge();
} else if (config.widgetFamily === "small") {
  await widget.presentSmall();
} else {
  await widget.presentMedium();
}
Script.complete();
