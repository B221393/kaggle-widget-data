// OpenCodeWorkpack (mirror edition, now/next + design-driven version)
// iPhone Scriptable widget: shows what the OpenCode Go workpack is
// doing at a glance -- "いま" (the job running now, or the next one
// scheduled), "つぎ" (the following one or two jobs) -- plus the
// overall progress as a big percentage and a 0-100% bar, from the
// public read-only mirror (B221393/kaggle-widget-data). No GitHub
// token needed.
// IMPORTANT: this is a PLAN display. Progress is computed from the
// plan's recorded job states; a state such as "proposed_not_claimed"
// does NOT mean the job is running.
// Job names shown are the short plain-language "label" fields in the
// data file, so wording can be adjusted on the data side only.
//
// DESIGN: shared with KaggleSnapshot. Every visual parameter
// (background, text, bar and state-chip colors, sizes, padding)
// comes from reports/widget_design.json on this mirror (presets:
// dark / light / minimal, chosen by "active_preset"). To change the
// look for BOTH widgets, edit that file only -- this script never
// needs to be re-pasted again. If the design file cannot be fetched,
// the last cached copy is used, then the built-in defaults (= the
// dark preset). THIS SCRIPT REVISION IS THE FINAL ONE: after
// pasting it once, all future design changes are data-only.

const DATA_URL = "https://raw.githubusercontent.com/B221393/kaggle-widget-data/main/docs/task-queues/opencode_go_workpack.json";
const DESIGN_URL = "https://raw.githubusercontent.com/B221393/kaggle-widget-data/main/reports/widget_design.json";
const CACHE_NAME = "OpenCodeWorkpack-cache.json";
const DESIGN_CACHE_NAME = "WidgetDesign-cache.json";

const fm = FileManager.local();
const cachePath = fm.joinPath(fm.documentsDirectory(), CACHE_NAME);
const designCachePath = fm.joinPath(fm.documentsDirectory(), DESIGN_CACHE_NAME);

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

async function loadDesign() {
  try {
    const req = new Request(DESIGN_URL);
    req.timeoutInterval = 20;
    const json = await req.loadJSON();
    fm.writeString(designCachePath, JSON.stringify(json));
    return pickDesign(json);
  } catch (e) {
    if (fm.fileExists(designCachePath)) {
      try {
        return pickDesign(JSON.parse(fm.readString(designCachePath)));
      } catch (e2) {
        return pickDesign(null);
      }
    }
    return pickDesign(null);
  }
}

// === DESIGN START (pure functions, unit-tested off-device) ===
// Built-in defaults: identical to the "dark" preset in
// reports/widget_design.json (shared with KaggleSnapshot). Used
// when the design file is missing or invalid.
const DEFAULT_DESIGN = {
  background: "#0e1116",
  ink: "#f0f3f7",
  sub: "#9aa5b1",
  grid: "#242b34",
  footer: "#76808d",
  rank_line: "#5ea9ff",
  score_line: "#ffb340",
  urgent: "#ff5147",
  accent: "#5ea9ff",
  track: "#242b34",
  tick: "#4d5764",
  chip_done: "#34c77b",
  chip_active: "#5ea9ff",
  chip_held: "#ffd60a",
  chip_pending: "#8b95a3",
  show_grid: true,
  title_size: 13,
  label_size: 11.5,
  value_size: 10.5,
  axis_size: 7.5,
  compact_size: 9.5,
  footer_size: 8.5,
  info_size: 10,
  now_size: 15,
  pct_size: 30,
  plot_height_small: 44,
  plot_height_medium: 58,
  plot_height_large: 76,
  rank_line_width: 2.4,
  score_line_width: 2.0,
  bar_height: 14,
  padding_top: 12,
  padding_left: 14,
  padding_bottom: 10,
  padding_right: 14,
};

// Resolve a widget_design.json document into one flat design object:
// presets[active_preset] merged over the built-in defaults. Any
// missing or invalid input resolves to the defaults.
function pickDesign(json) {
  const d = Object.assign({}, DEFAULT_DESIGN);
  if (!json || typeof json !== "object") return d;
  const presets = json.presets;
  if (!presets || typeof presets !== "object") return d;
  const name = typeof json.active_preset === "string" ? json.active_preset : "dark";
  const p = presets[name] && typeof presets[name] === "object" ? presets[name] : presets.dark;
  if (!p || typeof p !== "object") return d;
  return Object.assign(d, p);
}
// === DESIGN END ===

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

// Display category for the state chips. Adds "held" on top of the
// progress categories; the progress weights above are untouched
// (a held job still counts as pending in progressOf).
function chipCategory(state) {
  const s = String(state || "").toLowerCase();
  if (stateCategory(s) === "done") return "done";
  if (/(held|on_hold|hold|paused|suspended|保留)/.test(s)) return "held";
  if (stateCategory(s) === "active") return "active";
  return "pending";
}

function chipLabel(cat) {
  return cat === "done" ? "完了" : cat === "active" ? "実行中" : cat === "held" ? "保留" : "待機中";
}

function chipIcon(cat) {
  return cat === "done" ? "✓" : cat === "active" ? "▶" : cat === "held" ? "⏸" : "○";
}

function chipColorKey(cat) {
  return cat === "done" ? "chip_done" : cat === "active" ? "chip_active" : cat === "held" ? "chip_held" : "chip_pending";
}

// Short display name for a job: the data-side "label" when present,
// then the title, then the id.
function displayName(job) {
  if (!job) return "";
  return job.label || job.title || job.id || "";
}

// "いま" = the running job if any, otherwise the next scheduled
// (waiting or held) job in file order. "つぎ" = up to two more
// unfinished jobs after it in file order. When every job is done,
// now is null and next is empty.
function pickNowNext(jobs) {
  const items = (jobs || []).map((job, idx) => ({ job, idx, cat: chipCategory(job.state) }));
  const nowItem = items.find((x) => x.cat === "active") || items.find((x) => x.cat === "pending" || x.cat === "held");
  if (!nowItem) return { now: null, next: [] };
  const next = items
    .filter((x) => x.idx > nowItem.idx && x.cat !== "done")
    .slice(0, 2)
    .map((x) => x.job);
  return { now: nowItem.job, next };
}
// === PROGRESS END ===

function col(hex, fallbackHex) {
  try {
    return new Color(hex);
  } catch (e) {
    return new Color(fallbackHex);
  }
}

function buildBar(pct, W, d) {
  const trackH = d.bar_height;
  const tickY = 2 + trackH + 2;
  const H = tickY + 16;
  const ctx = new DrawContext();
  ctx.size = new Size(W, H);
  ctx.opaque = false;
  const trackW = W - 2;
  // track + fill
  ctx.setFillColor(col(d.track, "#242b34"));
  ctx.fillRect(new Rect(1, 2, trackW, trackH));
  const fw = barFillWidth(pct, trackW);
  if (fw > 0) {
    ctx.setFillColor(col(d.accent, "#5ea9ff"));
    ctx.fillRect(new Rect(1, 2, fw, trackH));
  }
  // ticks + % labels at 0 / 25 / 50 / 75 / 100
  ctx.setFillColor(col(d.tick, "#4d5764"));
  ctx.setFont(Font.systemFont(8));
  ctx.setTextColor(col(d.sub, "#9aa5b1"));
  for (const t of [0, 25, 50, 75, 100]) {
    const x = 1 + Math.round((t / 100) * trackW);
    ctx.fillRect(new Rect(x - 0.5, tickY, 1, 4));
    const label = `${t}%`;
    const lx = t === 100 ? x - 22 : t === 0 ? x - 1 : x - 9;
    ctx.drawText(label, new Point(lx, tickY + 5));
  }
  return { img: ctx.getImage(), h: H };
}

function addChipRow(w, job, d, nameFont, nameColor) {
  const cat = chipCategory(job.state);
  const row = w.addStack();
  row.layoutHorizontally();
  const chip = row.addText(`${chipIcon(cat)} ${chipLabel(cat)}`);
  chip.font = Font.boldSystemFont(d.info_size);
  chip.textColor = col(d[chipColorKey(cat)], "#8b95a3");
  row.addSpacer(6);
  const name = row.addText(displayName(job));
  name.font = nameFont;
  name.textColor = nameColor;
  name.lineLimit = 1;
  return row;
}

async function buildWidget() {
  const d = await loadDesign();
  const w = new ListWidget();
  w.backgroundColor = col(d.background, "#0e1116");
  w.setPadding(d.padding_top, d.padding_left, d.padding_bottom, d.padding_right);

  const ink = col(d.ink, "#f0f3f7");
  const sub = col(d.sub, "#9aa5b1");
  const title = w.addText("OpenCode Go ワーク進捗（計画）");
  title.font = Font.boldSystemFont(d.title_size);
  title.textColor = ink;
  w.addSpacer(4);

  try {
    const { data, stale } = await loadData();
    const jobs = data.jobs || [];
    const prog = progressOf(jobs);
    const family = config.widgetFamily || "medium";
    const W = family === "small" ? 148 : 300;

    // --- いま ---
    const { now, next } = pickNowNext(jobs);
    const headNow = w.addText("いま");
    headNow.font = Font.boldSystemFont(10.5);
    headNow.textColor = col(d.accent, "#5ea9ff");
    if (now) {
      const nowName = w.addText(displayName(now));
      nowName.font = Font.boldSystemFont(d.now_size);
      nowName.textColor = ink;
      nowName.lineLimit = 2;
      const meta = w.addStack();
      meta.layoutHorizontally();
      const cat = chipCategory(now.state);
      const chip = meta.addText(`${chipIcon(cat)} ${chipLabel(cat)}`);
      chip.font = Font.boldSystemFont(d.info_size);
      chip.textColor = col(d[chipColorKey(cat)], "#8b95a3");
      meta.addSpacer(6);
      const idm = meta.addText(`${now.id} · ${now.model}`);
      idm.font = Font.systemFont(d.info_size);
      idm.textColor = sub;
    } else if (jobs.length) {
      const doneMsg = w.addText("すべての仕事が完了しました 🎉");
      doneMsg.font = Font.boldSystemFont(d.now_size);
      doneMsg.textColor = ink;
      doneMsg.lineLimit = 2;
    } else {
      const noneMsg = w.addText("仕事はまだありません");
      noneMsg.font = Font.boldSystemFont(d.now_size);
      noneMsg.textColor = sub;
    }

    // --- つぎ ---
    if (next.length) {
      w.addSpacer(4);
      const headNext = w.addText("つぎ");
      headNext.font = Font.boldSystemFont(10.5);
      headNext.textColor = sub;
      for (const j of next) {
        addChipRow(w, j, d, Font.systemFont(d.info_size), ink);
      }
    }

    // --- 進捗 ---
    w.addSpacer(5);
    const pctText = w.addText(prog.pct >= 100 ? `${prog.pct}% 🎉` : `${prog.pct}%`);
    pctText.font = Font.boldSystemFont(d.pct_size);
    pctText.textColor = col(d.accent, "#5ea9ff");
    const bar = buildBar(prog.pct, W, d);
    const barImg = w.addImage(bar.img);
    barImg.imageSize = new Size(W, bar.h);
    w.addSpacer(2);

    const brk = w.addText(`完了 ${prog.done}件 · 進行中 ${prog.active}件 · 提案（未着手）${prog.pending}件 / 全${prog.total}件`);
    brk.font = Font.systemFont(d.info_size);
    brk.textColor = sub;
    w.addSpacer(3);

    const foot = w.addText(`計画表示（提案は実行中ではありません） · 計画作成: ${data.created_jst || "不明"}${stale ? "（通信失敗・キャッシュ表示）" : ""}`);
    foot.font = Font.systemFont(d.footer_size);
    foot.textColor = col(d.footer, "#76808d");
  } catch (e) {
    const err = w.addText("取得に失敗しました");
    err.font = Font.systemFont(11);
    err.textColor = col(d.urgent, "#ff5147");
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
