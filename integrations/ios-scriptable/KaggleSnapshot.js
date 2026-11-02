// KaggleSnapshot (mirror edition, design-driven chart version)
// iPhone Scriptable widget: rank & score history charts for the official
// medal competitions, drawn with DrawContext from the public read-only
// mirror (B221393/kaggle-widget-data, reports/history.json). No GitHub
// token needed. Values are recorded measurements, not live leaderboard
// values. X axis is time; one line is rank (up = better), the other is
// the best public score (up = better).
//
// DISPLAY RULES (unchanged, all decided automatically from the data):
// each entry in history.json carries "deadline" (UTC ISO) and "order"
// (display order). A competition stays on the widget until one week
// after its deadline, then drops off on its own -- nobody deletes it.
// "visible" remains only as an exception override: visible=false hides
// a competition immediately; a missing "visible" counts as true.
// The star of the widget is rule-driven too: history.json carries
// "priority_order" (competition ids, highest priority first), and
// among the competitions currently shown, the highest-priority one
// still before its deadline gets the large chart at the top; the
// rest are compact lines. The star passes to the next priority the
// moment a deadline passes. Inside the last 24 hours before a
// deadline, that competition's label and lines turn a warning color.
//
// DESIGN: every visual parameter (colors, line widths, plot heights,
// font sizes, padding, widget background) comes from
// reports/widget_design.json on this mirror, which holds named
// presets (dark / light / minimal) and an "active_preset". To change
// the look, edit that file only -- this script never needs to be
// re-pasted again. If the design file cannot be fetched, the last
// cached copy is used, then the built-in defaults (= the dark preset).
// THIS SCRIPT REVISION IS THE FINAL ONE: after pasting it once, all
// future design changes are data-only.

const DATA_URL = "https://raw.githubusercontent.com/B221393/kaggle-widget-data/main/reports/history.json";
const DESIGN_URL = "https://raw.githubusercontent.com/B221393/kaggle-widget-data/main/reports/widget_design.json";
const CACHE_NAME = "KaggleSnapshot-cache.json";
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
// reports/widget_design.json. Used when the design file is missing
// or invalid, so the widget always renders.
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

// === GEOMETRY START (pure functions, unit-tested off-device) ===
// A competition is shown until one week after its deadline, then it
// drops off automatically. "visible": false is an exception override
// that hides it immediately. No deadline (or an unparseable one) means
// it stays shown.
const GRACE_MS = 7 * 24 * 60 * 60 * 1000;
function isShown(c, nowMs) {
  if (c.visible === false) return false;
  if (!c.deadline) return true;
  const dl = new Date(c.deadline).getTime();
  if (isNaN(dl)) return true;
  return nowMs < dl + GRACE_MS;
}

// Less than 24 hours left until the deadline: the competition is
// drawn in a warning color so the final day stands out.
const URGENT_MS = 24 * 60 * 60 * 1000;
function isUrgent(c, nowMs) {
  if (!c.deadline) return false;
  const dl = new Date(c.deadline).getTime();
  if (isNaN(dl)) return false;
  const remain = dl - nowMs;
  return remain >= 0 && remain < URGENT_MS;
}

// The star: the highest-priority competition among those shown
// that is still before its deadline. A competition keeps appearing
// for a week after its deadline (see isShown) but loses the star
// the moment the deadline passes; the next priority takes over.
// priorityOrder is a list of competition ids from history.json;
// competitions not in the list are never the star while a listed
// one is available. Fallbacks keep the layout working when every
// shown competition is already past its deadline.
function pickFocus(comps, priorityOrder, nowMs) {
  if (!comps.length) return null;
  const preDeadline = (c) => {
    if (!c.deadline) return true;
    const dl = new Date(c.deadline).getTime();
    return isNaN(dl) || nowMs < dl;
  };
  if (Array.isArray(priorityOrder)) {
    for (const id of priorityOrder) {
      const hit = comps.find((c) => c.id === id && preDeadline(c));
      if (hit) return hit;
    }
    for (const id of priorityOrder) {
      const hit = comps.find((c) => c.id === id);
      if (hit) return hit;
    }
  }
  return comps[0];
}
// Map a value into a y pixel inside a plot box. higherIsUp=true means the
// largest value lands on the top edge. A flat series maps to the middle.
function scaleY(v, min, max, top, height, higherIsUp) {
  if (max - min < 1e-12) return top + height / 2;
  const t = (v - min) / (max - min);
  return higherIsUp ? top + height * (1 - t) : top + height * t;
}

// Build polyline points for one series.
// pts: [{t: epochMs, v: number}], box: {x, y, w, h}, higherIsUp: bool.
// Rank uses higherIsUp=false with v=rank (rank 1 = smallest = top).
function seriesPoints(pts, box, higherIsUp) {
  if (!pts.length) return [];
  let t0 = Infinity, t1 = -Infinity, vmin = Infinity, vmax = -Infinity;
  for (const p of pts) {
    if (p.t < t0) t0 = p.t;
    if (p.t > t1) t1 = p.t;
    if (p.v < vmin) vmin = p.v;
    if (p.v > vmax) vmax = p.v;
  }
  // pad the value range so lines do not hug the edges
  const pad = (vmax - vmin) * 0.12;
  vmin -= pad; vmax += pad;
  return pts.map((p) => {
    const x = t1 > t0 ? box.x + ((p.t - t0) / (t1 - t0)) * box.w : box.x + box.w / 2;
    const y = scaleY(p.v, vmin, vmax, box.y, box.h, higherIsUp);
    return { x, y };
  });
}
// === GEOMETRY END ===

function fmtScore(v) {
  if (v == null) return "-";
  if (Math.abs(v) >= 10) return v.toFixed(3).replace(/0$/, "");
  return v.toFixed(3);
}

function fmtDelta(d) {
  if (d == null || Math.abs(d) < 0.0005) return "±0";
  const s = (d > 0 ? "+" : "") + d.toFixed(3);
  return s.replace(/\.?0+$/, "");
}

function fmtMD(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function fmtDate(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function col(hex, fallbackHex) {
  try {
    return new Color(hex);
  } catch (e) {
    return new Color(fallbackHex);
  }
}

// Draw one competition block (label line + chart) into ctx at y.
// Returns the y just below the block. Inside the last 24 hours
// before the deadline, label and lines switch to the warning color.
// All colors and sizes come from the design object d.
function drawComp(ctx, comp, W, y, plotH, nowMs, d) {
  const ink = col(d.ink, "#f0f3f7");
  const sub = col(d.sub, "#9aa5b1");
  const urgentCol = col(d.urgent, "#ff5147");
  const pts = (comp.points || []).slice().sort((a, b) => new Date(a.date) - new Date(b.date));
  const last = pts[pts.length - 1];
  const urgent = isUrgent(comp, nowMs);
  ctx.setTextColor(urgent ? urgentCol : ink);
  ctx.setFont(Font.boldSystemFont(d.label_size));
  let label = comp.name;
  if (comp.badge) label += `（${comp.badge}）`;
  ctx.drawText(label, new Point(0, y));
  ctx.setFont(Font.systemFont(d.value_size));
  if (last) {
    const pct = comp.teams_latest ? ` 上位${((last.rank / comp.teams_latest) * 100).toFixed(1)}%` : "";
    const first = pts.find((p) => p.score != null);
    const lastScored = pts.slice().reverse().find((p) => p.score != null);
    const delta = first && lastScored ? lastScored.score - first.score : null;
    const scoreTxt = lastScored ? ` · ${fmtScore(lastScored.score)}（${fmtDelta(delta)}）` : "";
    ctx.drawText(`${last.rank}位/${comp.teams_latest || "?"}${pct}${scoreTxt}`, new Point(64, y));
  } else {
    ctx.setTextColor(urgent ? urgentCol : sub);
    ctx.drawText("初回提出・採点待ち", new Point(64, y));
  }
  y += 14;
  if (pts.length) {
    const box = { x: 2, y, w: W - 4, h: plotH };
    if (d.show_grid !== false) {
      // grid: top / middle / bottom hairlines
      ctx.setStrokeColor(col(d.grid, "#242b34"));
      ctx.setLineWidth(0.6);
      for (const gy of [box.y + 0.5, box.y + box.h / 2, box.y + box.h - 0.5]) {
        const g = new Path();
        g.move(new Point(box.x, gy));
        g.addLine(new Point(box.x + box.w, gy));
        ctx.addPath(g);
        ctx.strokePath();
      }
    }
    // rank line (smaller rank = better = up): v=rank, higherIsUp=false
    const rankPts = pts.map((p) => ({ t: new Date(p.date).getTime(), v: p.rank }));
    plotSeries(ctx, seriesPoints(rankPts, box, false), urgent ? urgentCol : col(d.rank_line, "#5ea9ff"), d.rank_line_width, 2.1);
    // score line (higher = better = up)
    const scorePts = pts.filter((p) => p.score != null).map((p) => ({ t: new Date(p.date).getTime(), v: p.score }));
    if (scorePts.length) plotSeries(ctx, seriesPoints(scorePts, box, true), urgent ? urgentCol : col(d.score_line, "#ffb340"), d.score_line_width, 1.8);
    // time axis labels (first / last date)
    ctx.setTextColor(sub);
    ctx.setFont(Font.systemFont(d.axis_size));
    ctx.drawText(fmtMD(pts[0].date), new Point(box.x, box.y + box.h + 1));
    const lastLabel = fmtMD(last.date);
    ctx.drawText(lastLabel, new Point(box.x + box.w - 24, box.y + box.h + 1));
    y += plotH + 10;
  }
  return y;
}

function plotSeries(ctx, coords, color, width, dotR) {
  if (!coords.length) return;
  ctx.setStrokeColor(color);
  ctx.setLineWidth(width);
  const path = new Path();
  path.move(new Point(coords[0].x, coords[0].y));
  for (let i = 1; i < coords.length; i++) path.addLine(new Point(coords[i].x, coords[i].y));
  ctx.addPath(path);
  ctx.strokePath();
  ctx.setFillColor(color);
  for (const c of coords) {
    ctx.fillEllipse(new Rect(c.x - dotR, c.y - dotR, dotR * 2, dotR * 2));
  }
}

function buildCanvas(comps, W, H, family, priorityOrder, nowMs, d) {
  const ctx = new DrawContext();
  ctx.size = new Size(W, H);
  ctx.opaque = false;
  let y = 0;
  // Single widget, one star: the highest-priority competition among
  // those shown that is still before its deadline (see pickFocus)
  // gets the one large chart at the top; every other competition is
  // a compact one-line summary.
  const focus = pickFocus(comps, priorityOrder, nowMs);
  const others = comps.filter((c) => c !== focus);
  if (focus) {
    const plotH = family === "large" ? d.plot_height_large : family === "small" ? d.plot_height_small : d.plot_height_medium;
    y = drawComp(ctx, focus, W, y, plotH, nowMs, d);
  }
  ctx.setFont(Font.systemFont(family === "small" ? 9 : d.compact_size));
  const maxLines = family === "small" ? 2 : others.length;
  for (const c of others.slice(0, maxLines)) {
    ctx.setTextColor(isUrgent(c, nowMs) ? col(d.urgent, "#ff5147") : col(d.sub, "#9aa5b1"));
    const pts = c.points || [];
    if (pts.length) {
      const l = pts[pts.length - 1];
      const sc = l.score != null ? ` · ${fmtScore(l.score)}` : "";
      ctx.drawText(`${c.name}: ${l.rank}位${sc}${c.badge ? `（${c.badge}）` : ""}`, new Point(0, y));
    } else {
      ctx.drawText(`${c.name}: 初回提出・採点待ち`, new Point(0, y));
    }
    y += 12;
  }
  return ctx.getImage();
}

async function buildWidget() {
  const d = await loadDesign();
  const w = new ListWidget();
  w.backgroundColor = col(d.background, "#0e1116");
  w.setPadding(d.padding_top, d.padding_left, d.padding_bottom, d.padding_right);
  const title = w.addText("Kaggle メダル戦線（記録値）");
  title.font = Font.boldSystemFont(d.title_size);
  title.textColor = col(d.ink, "#f0f3f7");
  w.addSpacer(4);

  const family = config.widgetFamily || "medium";
  try {
    const { data, stale } = await loadData();
    // Automatic selection: a competition is shown until one week
    // after its deadline (visible=false overrides immediately), in
    // "order" sequence. Backward compatible: no "deadline" means
    // shown, no "order" keeps the file's relative order (stable sort).
    const nowMs = Date.now();
    const comps = (data.competitions || [])
      .filter((c) => isShown(c, nowMs))
      .slice()
      .sort((a, b) => (a.order != null ? a.order : 1e9) - (b.order != null ? b.order : 1e9));
    const W = family === "small" ? 148 : 330;
    const plotH = family === "large" ? d.plot_height_large : family === "small" ? d.plot_height_small : d.plot_height_medium;
    const focus = pickFocus(comps, data.priority_order, nowMs);
    const otherCount = comps.filter((c) => c !== focus).length;
    const shownOthers = family === "small" ? Math.min(2, otherCount) : otherCount;
    const H = (focus ? 14 + plotH + 10 : 0) + shownOthers * 12 + 4;
    const img = w.addImage(buildCanvas(comps, W, H, family, data.priority_order, nowMs, d));
    img.imageSize = new Size(W, H);
    let latest = null;
    for (const c of comps) for (const p of c.points || []) if (!latest || p.date > latest) latest = p.date;
    const foot = w.addText(`順位と点数（上ほど改善） · 警告色=締切24時間以内 · 記録日: ${fmtDate(latest)}${stale ? "（通信失敗・キャッシュ表示）" : ""}`);
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
