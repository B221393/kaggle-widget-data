// KaggleSnapshot (mirror edition, chart version)
// iPhone Scriptable widget: rank & score history charts for the official
// medal competitions, drawn with DrawContext from the public read-only
// mirror (B221393/kaggle-widget-data, reports/history.json). No GitHub
// token needed. Values are recorded measurements, not live leaderboard
// values. X axis is time; the blue line is rank (up = better), the
// orange line is the best public score (up = better).
// Which competitions are shown is controlled by the data, not by this
// script: each entry in history.json carries "visible" (true/false) and
// "order" (display order). Set visible=false to hide a competition
// (e.g. after it ends); a missing "visible" counts as true.

const DATA_URL = "https://raw.githubusercontent.com/B221393/kaggle-widget-data/main/reports/history.json";
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

// === GEOMETRY START (pure functions, unit-tested off-device) ===
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

const RANK_COLOR = new Color("#2563eb");
const SCORE_COLOR = new Color("#e07b00");
const GRID_COLOR = new Color("#d8d8de");
const INK = new Color("#1c1c1e");
const SUB = new Color("#6e6e73");

// Draw one competition block (label line + chart) into ctx at y.
// Returns the y just below the block.
function drawComp(ctx, comp, W, y, plotH) {
  const pts = (comp.points || []).slice().sort((a, b) => new Date(a.date) - new Date(b.date));
  const last = pts[pts.length - 1];
  ctx.setTextColor(INK);
  ctx.setFont(Font.boldSystemFont(11));
  let label = comp.name;
  if (comp.badge) label += `（${comp.badge}）`;
  ctx.drawText(label, new Point(0, y));
  ctx.setFont(Font.systemFont(10.5));
  if (last) {
    const pct = comp.teams_latest ? ` 上位${((last.rank / comp.teams_latest) * 100).toFixed(1)}%` : "";
    const first = pts.find((p) => p.score != null);
    const lastScored = pts.slice().reverse().find((p) => p.score != null);
    const delta = first && lastScored ? lastScored.score - first.score : null;
    const scoreTxt = lastScored ? ` · ${fmtScore(lastScored.score)}（${fmtDelta(delta)}）` : "";
    ctx.drawText(`${last.rank}位/${comp.teams_latest || "?"}${pct}${scoreTxt}`, new Point(64, y));
  } else {
    ctx.setTextColor(SUB);
    ctx.drawText("初回提出・採点待ち", new Point(64, y));
  }
  y += 14;
  if (pts.length) {
    const box = { x: 2, y, w: W - 4, h: plotH };
    // grid: top / middle / bottom hairlines
    ctx.setStrokeColor(GRID_COLOR);
    ctx.setLineWidth(0.6);
    for (const gy of [box.y + 0.5, box.y + box.h / 2, box.y + box.h - 0.5]) {
      const g = new Path();
      g.move(new Point(box.x, gy));
      g.addLine(new Point(box.x + box.w, gy));
      ctx.addPath(g);
      ctx.strokePath();
    }
    // rank line (smaller rank = better = up): v=rank, higherIsUp=false
    const rankPts = pts.map((p) => ({ t: new Date(p.date).getTime(), v: p.rank }));
    plotSeries(ctx, seriesPoints(rankPts, box, false), RANK_COLOR, 2, 2.1);
    // score line (higher = better = up)
    const scorePts = pts.filter((p) => p.score != null).map((p) => ({ t: new Date(p.date).getTime(), v: p.score }));
    if (scorePts.length) plotSeries(ctx, seriesPoints(scorePts, box, true), SCORE_COLOR, 1.6, 1.8);
    // time axis labels (first / last date)
    ctx.setTextColor(SUB);
    ctx.setFont(Font.systemFont(7.5));
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

function buildCanvas(comps, W, H, family) {
  const ctx = new DrawContext();
  ctx.size = new Size(W, H);
  ctx.opaque = false;
  let y = 0;
  const chartComps = comps.filter((c) => (c.points || []).length);
  const emptyComps = comps.filter((c) => !(c.points || []).length);
  if (family === "small") {
    if (chartComps[0]) y = drawComp(ctx, chartComps[0], W, y, 44);
    ctx.setTextColor(SUB);
    ctx.setFont(Font.systemFont(9));
    for (const c of chartComps.slice(1, 3)) {
      const l = c.points[c.points.length - 1];
      ctx.drawText(`${c.name}: ${l.rank}位`, new Point(0, y));
      y += 12;
    }
    return ctx.getImage();
  }
  const plotH = family === "large" ? 44 : 32;
  const chartShown = family === "large" ? chartComps : chartComps.slice(0, 2);
  for (const c of chartShown) y = drawComp(ctx, c, W, y, plotH);
  // compact lines for the remaining competitions
  ctx.setTextColor(SUB);
  ctx.setFont(Font.systemFont(9.5));
  for (const c of chartComps.slice(chartShown.length)) {
    const l = c.points[c.points.length - 1];
    const sc = l.score != null ? ` · ${fmtScore(l.score)}` : "";
    ctx.drawText(`${c.name}: ${l.rank}位${sc}${c.badge ? `（${c.badge}）` : ""}`, new Point(0, y));
    y += 12;
  }
  for (const c of emptyComps) {
    ctx.drawText(`${c.name}: 初回提出・採点待ち`, new Point(0, y));
    y += 12;
  }
  return ctx.getImage();
}

async function buildWidget() {
  const w = new ListWidget();
  w.setPadding(10, 12, 8, 12);
  const title = w.addText("Kaggle メダル戦線（記録値）");
  title.font = Font.boldSystemFont(13);
  w.addSpacer(4);

  const family = config.widgetFamily || "medium";
  try {
    const { data, stale } = await loadData();
    // Data-driven selection: only visible competitions, in "order"
    // sequence. Backward compatible: no "visible" means shown, no
    // "order" keeps the file's relative order (stable sort).
    const comps = (data.competitions || [])
      .filter((c) => c.visible !== false)
      .slice()
      .sort((a, b) => (a.order != null ? a.order : 1e9) - (b.order != null ? b.order : 1e9));
    const W = family === "small" ? 148 : 330;
    const H = family === "small" ? 96 : family === "large" ? 268 : 116;
    const img = w.addImage(buildCanvas(comps, W, H, family));
    img.imageSize = new Size(W, H);
    let latest = null;
    for (const c of comps) for (const p of c.points || []) if (!latest || p.date > latest) latest = p.date;
    const foot = w.addText(`青=順位（上ほど改善） 橙=点数 · 記録日: ${fmtDate(latest)}${stale ? "（通信失敗・キャッシュ表示）" : ""}`);
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
