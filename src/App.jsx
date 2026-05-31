import { useState, useCallback, useMemo, useEffect } from "react";
import React from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend
} from "recharts";

const n = v => (v === "" || v == null) ? null : parseFloat(v);
const pct = v => v == null || isNaN(v) ? "—" : (v * 100).toFixed(2) + "%";
const xfmt = v => v == null || isNaN(v) ? "—" : v.toFixed(2) + "x";
const fmtM = v => {
  if (v == null || isNaN(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e12) return (v / 1e12).toFixed(2) + "兆";
  if (a >= 1e8) return (v / 1e8).toFixed(1) + "億";
  if (a >= 1e4) return (v / 1e4).toFixed(0) + "万";
  return v.toFixed(0);
};
const safe = (a, b) => (a != null && b != null && b !== 0) ? a / b : null;
const TAX = 0.20315;

function calcAll(f) {
  const price = n(f.price), shares = n(f.shares), sales = n(f.sales);
  const gp = n(f.grossProfit), op = n(f.opProfit), ord = n(f.ordProfit);
  const net = n(f.netProfit), ta = n(f.totalAssets), eq = n(f.equity);
  const ca = n(f.curAssets), fa = n(f.fixAssets);
  const cl = n(f.curLiab), fl = n(f.fixLiab);
  const div = n(f.dividend);
  const depTangible = n(f.depTangible);
  const depIntangible = n(f.depIntangible);
  const taxExp = n(f.taxExp); // 法人税等
  const intExp = n(f.intExp); // 支払利息

  // EBITDA自動計算
  const ebitdaManual = n(f.ebitda);
  const ebitdaCalc = op != null ? op + (depTangible||0) + (depIntangible||0) : null;
  const ebitda = ebitdaManual != null ? ebitdaManual : ebitdaCalc;

  // 実効税率: 法人税等 ÷ 経常利益で近似、未入力は30%
  const taxRate = (taxExp != null && ord != null && ord > 0)
    ? Math.min(Math.max(taxExp / ord, 0), 0.5)
    : 0.30;
  // NOPAT = 営業利益 × (1 - 実効税率)
  const nopat = op != null ? op * (1 - taxRate) : null;
  const ic = ta != null && cl != null ? ta - cl : null;

  // 借入金利自動計算 = 支払利息 ÷ 固定負債（有利子負債の近似）
  const kdAuto = (intExp != null && fl != null && fl > 0) ? intExp / fl : null;

  const marketCap = price != null && shares != null ? price * shares * 1000 : null;
  const netDebt = ta != null && eq != null && ca != null ? (ta - eq) - ca : null;
  const ev = marketCap != null && netDebt != null ? marketCap + netDebt : null;
  const eps = net != null && shares > 0 ? net / (shares * 1000) : null;
  const bps = eq != null && shares > 0 ? eq / (shares * 1000) : null;
  return {
    marketCap, ev, eps, bps, ebitda, ebitdaCalc, depTangible, depIntangible,
    taxRate, nopat, kdAuto,
    grossMargin: safe(gp, sales), opMargin: safe(op, sales), ordMargin: safe(ord, sales),
    netMargin: safe(net, sales),
    roe: safe(net, eq), roa: safe(ord, ta),
    roic: safe(nopat, ic), // NOPATベースに変更
    currentRatio: safe(ca, cl), fixedRatio: safe(fa, eq),
    fixedLTRatio: fa != null && eq != null && fl != null && (eq + fl) !== 0 ? fa / (eq + fl) : null,
    equityRatio: safe(eq, ta), debtRatio: ta != null && eq != null && eq !== 0 ? (ta - eq) / eq : null,
    per: price != null && eps != null && eps > 0 ? price / eps : null,
    pbr: price != null && bps != null && bps > 0 ? price / bps : null,
    psr: marketCap != null && sales != null && sales > 0 ? marketCap / sales : null,
    evEbitda: safe(ev, ebitda),
    dividendYield: safe(div, price),
    payoutRatio: div != null && shares != null && net != null && net > 0 ? (div * shares * 1000) / net : null,
  };
}

// ── スコア基準値定義 ────────────────────────────────────────────────────────
// 更新日: 2025-05-31
const CRITERIA_PRESETS = {
  // バリュー株基準（割安性・収益性・健全性を重視）
  value: {
    label: "バリュー基準",
    color: "#60a5fa",
    updatedAt: "2025-05-31",
    per:         { dir:"lt", good:20,   great:12,   goodPts:4,  greatPts:10 },
    pbr:         { dir:"lt", good:2,    great:1.0,  goodPts:3,  greatPts:8  },
    psr:         { dir:"lt", good:3,    great:1.5,  goodPts:3,  greatPts:7  },
    roe:         { dir:"gt", good:0.08, great:0.15, goodPts:5,  greatPts:12 },
    opMargin:    { dir:"gt", good:0.08, great:0.20, goodPts:3,  greatPts:8  },
    roa:         { dir:"gt", good:0.04, great:0.08, goodPts:2,  greatPts:5  },
    rule40:      { dir:"gt", good:10,   great:15,   goodPts:4,  greatPts:8  },
    grossMargin: { dir:"gt", good:0.25, great:0.40, goodPts:4,  greatPts:10 },
    spread:      { dir:"gt", good:0,    great:0.02, goodPts:5,  greatPts:10 },
    evEbitda:    { dir:"lt", good:15,   great:8,    goodPts:2,  greatPts:5  },
    equityRatio: { dir:"gt", good:0.35, great:0.55, goodPts:2,  greatPts:4  },
    currentRatio:{ dir:"gt", good:1.5,  great:2.5,  goodPts:2,  greatPts:3  },
    salesGrowth: { dir:"gt", good:5,    great:10,   goodPts:3,  greatPts:8  },
    opGrowth:    { dir:"gt", good:5,    great:15,   goodPts:2,  greatPts:6  },
  },
  // グロース株基準（成長性・粗利率・Rule of 40を重視）
  growth: {
    label: "グロース基準",
    color: "#4ade80",
    updatedAt: "2025-05-31",
    per:         { dir:"lt", good:40,   great:25,   goodPts:4,  greatPts:10 },
    pbr:         { dir:"lt", good:5,    great:3,    goodPts:3,  greatPts:8  },
    psr:         { dir:"lt", good:8,    great:4,    goodPts:3,  greatPts:7  },
    roe:         { dir:"gt", good:0.05, great:0.12, goodPts:5,  greatPts:12 },
    opMargin:    { dir:"gt", good:0.0,  great:0.10, goodPts:3,  greatPts:8  },
    roa:         { dir:"gt", good:0.02, great:0.05, goodPts:2,  greatPts:5  },
    rule40:      { dir:"gt", good:15,   great:25,   goodPts:7,  greatPts:15 },
    grossMargin: { dir:"gt", good:0.40, great:0.60, goodPts:4,  greatPts:10 },
    spread:      { dir:"gt", good:0,    great:0.02, goodPts:5,  greatPts:10 },
    evEbitda:    { dir:"lt", good:30,   great:15,   goodPts:2,  greatPts:5  },
    equityRatio: { dir:"gt", good:0.25, great:0.40, goodPts:2,  greatPts:4  },
    currentRatio:{ dir:"gt", good:1.0,  great:1.5,  goodPts:2,  greatPts:3  },
    salesGrowth: { dir:"gt", good:15,   great:25,   goodPts:3,  greatPts:8  },
    opGrowth:    { dir:"gt", good:10,   great:20,   goodPts:2,  greatPts:6  },
    salesGrowth: { dir:"gt", good:15,   great:25,   goodPts:3,  greatPts:8  },
    opGrowth:    { dir:"gt", good:10,   great:20,   goodPts:2,  greatPts:6  },
  },
};

// デフォルトはバリューとグロースの中間（全業種対応）
const DEFAULT_CRITERIA = {
  label: "標準基準",
  color: "#94a3b8",
  updatedAt: "2025-05-31",
  per:         { dir:"lt", good:25,   great:15,   goodPts:4,  greatPts:10 },
  pbr:         { dir:"lt", good:3,    great:1.5,  goodPts:3,  greatPts:8  },
  psr:         { dir:"lt", good:5,    great:2,    goodPts:3,  greatPts:7  },
  roe:         { dir:"gt", good:0.08, great:0.15, goodPts:5,  greatPts:12 },
  opMargin:    { dir:"gt", good:0.05, great:0.15, goodPts:3,  greatPts:8  },
  roa:         { dir:"gt", good:0.03, great:0.07, goodPts:2,  greatPts:5  },
  rule40:      { dir:"gt", good:15,   great:20,   goodPts:7,  greatPts:15 },
  grossMargin: { dir:"gt", good:0.25, great:0.40, goodPts:4,  greatPts:10 },
  spread:      { dir:"gt", good:0,    great:0.02, goodPts:5,  greatPts:10 },
  evEbitda:    { dir:"lt", good:20,   great:10,   goodPts:2,  greatPts:5  },
  equityRatio: { dir:"gt", good:0.30, great:0.50, goodPts:2,  greatPts:4  },
  currentRatio:{ dir:"gt", good:1.2,  great:2.0,  goodPts:2,  greatPts:3  },
  salesGrowth: { dir:"gt", good:8,    great:15,   goodPts:3,  greatPts:8  },
  opGrowth:    { dir:"gt", good:5,    great:15,   goodPts:2,  greatPts:6  },
  salesGrowth: { dir:"gt", good:8,    great:15,   goodPts:3,  greatPts:8  },
  opGrowth:    { dir:"gt", good:5,    great:15,   goodPts:2,  greatPts:6  },
  salesGrowth: { dir:"gt", good:8,    great:15,   goodPts:3,  greatPts:8  },
  opGrowth:    { dir:"gt", good:5,    great:15,   goodPts:2,  greatPts:6  },
};

// criteriaはDEFAULT_CRITERIAまたは銘柄ごとのカスタム基準値
function financialScore(c, criteria) {
  const cr = criteria || DEFAULT_CRITERIA;
  let s = 0, t = 0;

  const add2 = (val, key) => {
    if (val == null) return;
    const def = cr[key];
    if (!def) return;
    const isGood  = def.dir === "lt" ? val < def.good  : val > def.good;
    const isGreat = def.dir === "lt" ? val < def.great : val > def.great;

    // 加点
    const pts = isGreat ? def.greatPts : isGood ? def.goodPts : 0;
    // 減点：良好基準から大きく乖離した場合
    let penalty = 0;
    if (!isGood) {
      if (def.dir === "lt") {
        // 小さいほど良い指標（PER,PBR等）：大きすぎると減点
        const ratio = val / def.good; // 1.0 = 基準値ちょうど
        if (ratio >= 3.0) penalty = -def.greatPts * 0.5; // 3倍以上 → 重減点
        else if (ratio >= 2.0) penalty = -def.goodPts;   // 2倍以上 → 軽減点
      } else {
        // 大きいほど良い指標（ROE,成長率等）：マイナス値は減点
        // ただし0〜good範囲は0pt（減点なし）、マイナス値のみ減点
        if (val < 0) {
          const absRatio = Math.abs(val) / Math.max(Math.abs(def.good), 1);
          if (absRatio >= 2.0) penalty = -def.greatPts * 0.5;
          else if (absRatio >= 1.0) penalty = -def.goodPts;
        }
      }
    }

    s += pts + penalty;
    t += def.greatPts;
  };

  add2(c.per,         "per");
  add2(c.pbr,         "pbr");
  add2(c.psr,         "psr");
  add2(c.roe,         "roe");
  add2(c.opMargin,    "opMargin");
  add2(c.roa,         "roa");
  add2(c.rule40,      "rule40");
  add2(c.grossMargin, "grossMargin");
  if (c.spread != null) add2(c.spread, "spread");
  add2(c.evEbitda,    "evEbitda");
  add2(c.equityRatio, "equityRatio");
  add2(c.currentRatio,"currentRatio");
  if (c.salesGrowth != null) add2(c.salesGrowth, "salesGrowth");
  if (c.opGrowth != null)    add2(c.opGrowth,    "opGrowth");

  if (t <= 0) return null;
  // スコアは0〜100にクランプ
  return Math.min(100, Math.max(0, Math.round((s / t) * 100)));
}

// スコア項目のメタ情報（UI表示用）
const CRITERIA_META = [
  { key:"per",         label:"PER",         unit:"倍",  dir:"lt", cat:"割安性",  desc:"株価収益率" },
  { key:"pbr",         label:"PBR",         unit:"倍",  dir:"lt", cat:"割安性",  desc:"株価純資産倍率" },
  { key:"psr",         label:"PSR",         unit:"倍",  dir:"lt", cat:"割安性",  desc:"株価売上高倍率" },
  { key:"roe",         label:"ROE",         unit:"%",   dir:"gt", cat:"収益性",  desc:"自己資本利益率", scale:100 },
  { key:"opMargin",    label:"営業利益率",   unit:"%",   dir:"gt", cat:"収益性",  desc:"営業効率", scale:100 },
  { key:"roa",         label:"ROA",         unit:"%",   dir:"gt", cat:"収益性",  desc:"総資産利益率", scale:100 },
  { key:"rule40",      label:"Rule of 40",  unit:"",    dir:"gt", cat:"成長性",  desc:"売上成長率%+営業利益率%" },
  { key:"grossMargin", label:"粗利率",       unit:"%",   dir:"gt", cat:"成長性",  desc:"売上総利益率", scale:100 },
  { key:"spread",      label:"ROIC-WACC",   unit:"%",   dir:"gt", cat:"資本効率", desc:"価値創造スプレッド", scale:100 },
  { key:"evEbitda",    label:"EV/EBITDA",   unit:"倍",  dir:"lt", cat:"資本効率", desc:"企業価値倍率" },
  { key:"equityRatio", label:"自己資本比率", unit:"%",   dir:"gt", cat:"健全性",  desc:"財務健全性", scale:100 },
  { key:"currentRatio",label:"流動比率",    unit:"%",   dir:"gt", cat:"健全性",  desc:"短期安全性", scale:100 },
  { key:"salesGrowth", label:"売上成長率(YoY)", unit:"%", dir:"gt", cat:"成長性", desc:"前年比売上高成長率" },
  { key:"opGrowth",    label:"営業利益成長率(YoY)", unit:"%", dir:"gt", cat:"成長性", desc:"前年比営業利益成長率" },
];

const SCORE_CRITERIA = CRITERIA_META.map(m => {
  const d = DEFAULT_CRITERIA[m.key];
  if (!d) return { label:m.label, good:"—", great:"—", cat:m.cat };
  const s = m.scale || 1;
  const fmt = (v) => m.unit === "%" ? (v*s).toFixed(0)+"%" : v+m.unit;
  const penaltyDesc = d.dir === "lt"
    ? "減点: "+fmt(d.good*2)+"超→-"+d.goodPts+"pt / "+fmt(d.good*3)+"超→-"+Math.round(d.greatPts*0.5)+"pt"
    : "減点: マイナス値が基準の1倍超→-"+d.goodPts+"pt / 2倍超→-"+Math.round(d.greatPts*0.5)+"pt";
  return {
    label: m.label,
    good:  (d.dir==="lt" ? "<" : ">")+fmt(d.good)+": "+d.goodPts+"pt",
    great: (d.dir==="lt" ? "<" : ">")+fmt(d.great)+": "+d.greatPts+"pt",
    penalty: penaltyDesc,
    cat:   m.cat,
  };
});

// periodsベースでスコア計算するヘルパー
function scoreFromPeriods(h, globalBaseYear) {
  const stockBase = getStockBaseYear(h, globalBaseYear);
  const periods = h.periods || {};
  const baseKey = String(stockBase);
  let fd = periods[baseKey] || {};
  if (!Object.values(fd).some(v => v !== "" && v != null)) {
    const prev = [String(stockBase-1), String(stockBase-2)].map(yr => periods[yr]||{}).find(d => Object.values(d).some(v => v !== "" && v != null));
    fd = prev || {};
  }
  const f = h.financials || {};
  const merged = Object.values(fd).some(v => v !== "" && v != null)
    ? { ...fd, price: f.price||fd.price, shinyoBairitu: fd.shinyoBairitu||f.shinyoBairitu }
    : f;
  const c = calcAll(merged);
  // 前年比成長率計算
  const prevKey = String(stockBase - 1);
  const prevFd = periods[prevKey] || {};
  const prevC = calcAll(prevFd);
  const curSales = n(merged.sales);
  const prevSales = n(prevFd.sales);
  const salesGrowth = curSales && prevSales && prevSales > 0 ? (curSales - prevSales) / prevSales * 100 : null;
  const curOp = n(merged.opProfit);
  const prevOp = n(prevFd.opProfit);
  const opGrowth = curOp != null && prevOp != null && prevOp > 0 ? (curOp - prevOp) / prevOp * 100 : null;
  const opMarginPct = c.opMargin != null ? c.opMargin * 100 : null;
  const rule40 = salesGrowth != null && opMarginPct != null ? salesGrowth + opMarginPct : null;
  const spread = h.waccSpread != null ? parseFloat(h.waccSpread) : null;
  const mode = loadScoreMode(h.id);
  const criteria = getCriteriaByMode(mode, h.id);
  return financialScore({ ...c, rule40, spread, salesGrowth, opGrowth }, criteria);
}

const LS_KEY = "kabulens_v2";
const LS_WATCH = "kabulens_watch_v1";
const LS_CUSTOM_CRITERIA = "kabulens_custom_criteria";
const LS_SCORE_MODE = "kabulens_score_mode";

const loadScoreMode = (stockId) => {
  try { return localStorage.getItem(LS_SCORE_MODE+"_"+stockId) || "standard"; } catch { return "standard"; }
};
const saveScoreMode = (stockId, mode) => {
  try { localStorage.setItem(LS_SCORE_MODE+"_"+stockId, mode); } catch {}
};
const loadCustomCriteria = (stockId) => {
  try {
    const d = localStorage.getItem(LS_CUSTOM_CRITERIA+"_"+stockId);
    return d ? JSON.parse(d) : null;
  } catch { return null; }
};
const saveCustomCriteria = (stockId, criteria) => {
  try { localStorage.setItem(LS_CUSTOM_CRITERIA+"_"+stockId, JSON.stringify(criteria)); } catch {}
};

// モードからcriteria取得
const getCriteriaByMode = (mode, stockId) => {
  if (mode === "value")  return CRITERIA_PRESETS.value;
  if (mode === "growth") return CRITERIA_PRESETS.growth;
  if (mode === "custom") return loadCustomCriteria(stockId) || DEFAULT_CRITERIA;
  return DEFAULT_CRITERIA; // standard
};
const loadData = () => {
  try {
    const d = localStorage.getItem(LS_KEY);
    if (!d) return null;
    const p = JSON.parse(d);
    if (!Array.isArray(p) || !p.length) return null;
    if (!p.every(h => h.id && h.ticker && h.name && typeof h.qty === "number")) return null;
    return p;
  } catch { return null; }
};
const saveData = p => { try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch {} };
const loadWatch = () => { try { const d = localStorage.getItem(LS_WATCH); return d ? JSON.parse(d) : []; } catch { return []; } };
const saveWatch = p => { try { localStorage.setItem(LS_WATCH, JSON.stringify(p)); } catch {} };

const EMPTY_F = { price:"", shares:"", sales:"", grossProfit:"", opProfit:"", ordProfit:"", netProfit:"", totalAssets:"", equity:"", curAssets:"", fixAssets:"", curLiab:"", fixLiab:"", ebitda:"", dividend:"", shinyoBairitu:"" };
const EMPTY_MEMO = { targetPrice:"", buyReason:"", memo:"" };

const INIT = [
  { id:1, ticker:"7203", name:"トヨタ自動車", sector:"自動車", qty:100, avgCost:2850, currentPrice:3124,
    memo:{ targetPrice:"3500", buyReason:"EV化への対応力と高配当", memo:"為替の影響に注意" },
    financials:{ price:"3124", shares:"14430000", sales:"4390000000000", grossProfit:"900000000000", opProfit:"350000000000", ordProfit:"360000000000", netProfit:"400000000000", totalAssets:"9000000000000", equity:"3700000000000", curAssets:"5000000000000", fixAssets:"4000000000000", curLiab:"3000000000000", fixLiab:"2300000000000", ebitda:"450000000000", dividend:"75", shinyoBairitu:"2.1" }, irList:[] },
  { id:2, ticker:"6758", name:"ソニーグループ", sector:"電機", qty:50, avgCost:12400, currentPrice:13250,
    memo:{ targetPrice:"15000", buyReason:"エンタメ・半導体センサーの多角化", memo:"PlayStation・音楽・映画の収益安定性を評価" },
    financials:{ price:"13250", shares:"1190000", sales:"13000000000000", grossProfit:"4200000000000", opProfit:"1200000000000", ordProfit:"1250000000000", netProfit:"900000000000", totalAssets:"25000000000000", equity:"6800000000000", curAssets:"12000000000000", fixAssets:"13000000000000", curLiab:"8000000000000", fixLiab:"10000000000000", ebitda:"1600000000000", dividend:"95", shinyoBairitu:"1.4" }, irList:[] },
  { id:3, ticker:"9984", name:"ソフトバンクG", sector:"通信", qty:200, avgCost:7200, currentPrice:6850,
    memo:{ targetPrice:"8000", buyReason:"AI投資ポートフォリオへの期待", memo:"ARM上場後の動向と純有利子負債の推移を注視" },
    financials:{ price:"6850", shares:"2110000", sales:"6000000000000", grossProfit:"", opProfit:"500000000000", ordProfit:"", netProfit:"-800000000000", totalAssets:"50000000000000", equity:"8000000000000", curAssets:"", fixAssets:"", curLiab:"", fixLiab:"", ebitda:"900000000000", dividend:"", shinyoBairitu:"3.2" }, irList:[] },
];

const DESC = {
  "PER":{ title:"PER（株価収益率）", formula:"株価 / EPS", what:"1株純利益に対して株価が何倍か。投資回収年数のイメージ。", judge:"15倍未満:割安 / 25倍超:割高目安", note:"成長株は高PERになりやすい。業種平均との比較が重要。" },
  "PBR":{ title:"PBR（株価純資産倍率）", formula:"株価 / BPS", what:"純資産に対して株価が何倍か。", judge:"1倍以下:超割安 / 1.5倍以下:割安 / 3倍超:割高", note:"1倍割れが続く場合は構造的問題の可能性も。" },
  "PSR":{ title:"PSR（株価売上高倍率）", formula:"時価総額 / 売上高", what:"売上高に対して時価総額が何倍か。赤字企業にも使える。", judge:"2倍以下:割安 / 5倍超:割高目安", note:"赤字グロース株の割安度判断に有効。" },
  "EV/EBITDA":{ title:"EV/EBITDA倍率", formula:"EV / EBITDA", what:"企業買収コストを何年で回収できるか。国際比較に適した指標。", judge:"10倍未満:割安 / 20倍超:割高目安", note:"EV=時価総額+純有利子負債。" },
  "ROE":{ title:"ROE（自己資本利益率）", formula:"純利益 / 自己資本", what:"株主出資額でどれだけ利益を生んだか。", judge:"15%超:優良 / 5%未満:要注意", note:"ROE8%超がJPX指針の要求水準。" },
  "ROA":{ title:"ROA（総資産利益率）", formula:"経常利益 / 総資産", what:"全資産でどれだけ利益を生んだか。経営効率の総合指標。", judge:"5%超:優良 / 1%未満:要注意", note:"業種により水準が大きく異なる。" },
  "ROIC":{ title:"ROIC（投下資本利益率）", formula:"【正確】NOPAT / (純資産 + 有利子負債)\n【概算・当アプリ】営業利益×(1-実効税率) / (純資産+固定負債)\n実効税率 = 法人税等 / 経常利益（未入力時は30%）", what:"事業に投下した資本でどれだけ利益を生んだか。", judge:"8%超:優良 / 5%未満:要注意", note:"法人税等を入力するとより正確な値になります。固定負債≒有利子負債の近似。" },
  "粗利率":{ title:"粗利率", formula:"売上総利益 / 売上高", what:"製品・サービスそのものの収益性。原価を除いた利益率。", judge:"40%超:高付加価値 / 20%未満:薄利多売", note:"IT・ソフト系は60〜80%、製造業は20〜40%が目安。" },
  "営業利益率":{ title:"営業利益率", formula:"営業利益 / 売上高", what:"本業で稼いだ利益率。販管費差引後の収益力。", judge:"10%超:優良 / 3%未満:要注意", note:"継続的な改善トレンドも重要。" },
  "経常利益率":{ title:"経常利益率", formula:"経常利益 / 売上高", what:"財務活動も含めた通常の経営活動の利益率。", judge:"営業利益率との乖離が大きい場合は財務構造を確認", note:"経常>営業なら財務健全。逆なら借入コスト大。" },
  "自己資本比率":{ title:"自己資本比率", formula:"純資産 / 総資産", what:"総資産のうち返済不要の自己資本が占める割合。", judge:"40%超:安全 / 20%未満:要注意", note:"高いほど安全だがレバレッジ効果は低下。" },
  "流動比率":{ title:"流動比率", formula:"流動資産 / 流動負債", what:"1年以内の支払いに対して現金化できる資産がどれだけあるか。", judge:"200%超:理想 / 100%未満:支払能力に懸念", note:"小売業など回転が速い業種は低めでも問題ないケースも。" },
  "固定比率":{ title:"固定比率", formula:"固定資産 / 純資産", what:"固定資産が自己資本でカバーされているか。", judge:"100%以下:健全 / 100%超:借入金で調達", note:"100%超でも固定長期適合率が100%以下なら問題少ない。" },
  "固定長期適合率":{ title:"固定長期適合率", formula:"固定資産 / (純資産+固定負債)", what:"固定資産が長期資本で賄われているか。", judge:"100%以下:健全（必須条件）", note:"100%超は短期資金で固定資産を賄っており危険。" },
  "配当利回り":{ title:"配当利回り", formula:"1株配当 / 株価", what:"株価に対して配当金がどれだけの割合か。", judge:"3%超:高配当 / 1%未満:低配当", note:"高すぎる場合は業績悪化による株価下落の可能性も。" },
  "配当性向":{ title:"配当性向", formula:"配当総額 / 純利益", what:"純利益のうち配当として株主に還元した割合。", judge:"30〜50%:健全 / 80%超:減配リスクあり", note:"成長企業は低め（内部留保重視）が一般的。" },
  "信用倍率":{ title:"信用倍率", formula:"信用買残 / 信用売残", what:"信用取引で買いと売りどちらが多いかを示す需給指標。", judge:"1倍未満:売り優勢 / 5倍超:買い過多", note:"高い信用倍率は将来の売り圧力になる可能性がある。" },
  "時価総額":{ title:"時価総額", formula:"株価 × 発行済株式数", what:"市場が評価する企業の価値の合計。会社の規模を示す基本指標。", judge:"大型:1兆超 / 中型:1000億〜1兆 / 小型:1000億未満", note:"毎日変動する。PBRと組み合わせると割安度がわかる。" },
};

const makeS = R => ({
  root:    { minHeight:"100vh", background:"#0a0f1a", fontFamily:"'DM Mono','Courier New',monospace", color:"#e2e8f0", fontSize:R.base },
  header:  { display:"flex", alignItems:"center", justifyContent:"space-between", padding:R.scale==="sm"?"10px 12px":"14px 24px", background:"#0d1424", borderBottom:"1px solid #1e293b", flexWrap:"wrap", gap:8 },
  navBtn:  { background:"transparent", border:"1px solid #1e293b", color:"#64748b", padding:R.scale==="sm"?"5px 10px":"7px 16px", borderRadius:6, cursor:"pointer", fontSize:R.sm, fontFamily:"inherit" },
  navOn:   { background:"#0f2a1a", border:"1px solid #4ade80", color:"#4ade80" },
  sbItem:  { flex:1, padding:R.scale==="sm"?"10px 12px":"14px 20px", borderRight:"1px solid #1e293b", minWidth:R.scale==="sm"?80:120 },
  sbLabel: { fontSize:R.sm, color:"#475569", marginBottom:4, textTransform:"uppercase", letterSpacing:1 },
  sbVal:   { fontSize:R.xxl, fontWeight:800 },
  h2:      { fontSize:R.xl, fontWeight:800, color:"#f1f5f9", margin:"0 0 16px 0", letterSpacing:1 },
  card:    { background:"#0d1424", border:"1px solid #1e293b", borderRadius:10, padding:R.scale==="sm"?16:28, marginBottom:20 },
  table:   { background:"#0d1424", border:"1px solid #1e293b", borderRadius:10, overflow:"hidden", marginBottom:16 },
  chips:   { display:"flex", flexWrap:"wrap", gap:8, marginBottom:16 },
  chip:    { background:"#111827", border:"1px solid #1e293b", color:"#94a3b8", padding:R.scale==="sm"?"5px 10px":"7px 16px", borderRadius:20, cursor:"pointer", fontSize:R.sm, fontFamily:"inherit" },
  chipOn:  { background:"#0f2a1a", border:"1px solid #4ade80", color:"#4ade80" },
  addBtn:  { background:"#0f2a1a", border:"1px solid #4ade80", color:"#4ade80", padding:R.scale==="sm"?"7px 14px":"9px 20px", borderRadius:6, cursor:"pointer", fontSize:R.md, fontFamily:"inherit", fontWeight:700 },
  miniBtn: { background:"#111827", border:"1px solid #334155", color:"#64748b", padding:R.scale==="sm"?"4px 8px":"6px 14px", borderRadius:4, cursor:"pointer", fontSize:R.sm, fontFamily:"inherit" },
  input:   { background:"#111827", border:"1px solid #1e293b", color:"#e2e8f0", padding:R.scale==="sm"?"8px 10px":"10px 14px", borderRadius:6, fontSize:R.md, fontFamily:"inherit", outline:"none", width:"100%", boxSizing:"border-box" },
  sel:     { background:"#111827", border:"1px solid #1e293b", color:"#e2e8f0", padding:R.scale==="sm"?"8px 10px":"10px 14px", borderRadius:6, fontSize:R.md, fontFamily:"inherit", width:"100%" },
  kpi:     { background:"#111827", borderRadius:8, padding:R.scale==="sm"?"10px 12px":"14px 16px" },
  kpiL:    { color:"#475569", fontSize:R.sm, marginBottom:4 },
  kpiV:    { fontWeight:700, fontSize:R.lg },
});

// グローバルデフォルト（外部コンポーネント用・PCサイズ）
const R_DEFAULT = { scale:"lg", base:13, sm:12, md:13, lg:14, xl:18, xxl:22, chartSm:180, chartMd:220, chartLg:260, chartXl:300, grid2:"1fr 1fr", grid3:"1fr 1fr 1fr", isMobile:false };
let S = makeS(R_DEFAULT);
let R_CURRENT = R_DEFAULT;

const PIE_COLORS = ["#60a5fa","#4ade80","#f59e0b","#a78bfa","#f87171","#34d399","#fb7185","#38bdf8"];
const CMP_COLORS = ["#4ade80","#60a5fa","#f59e0b","#a78bfa"];
const scoreColor = v => v >= 75 ? "#4ade80" : v >= 55 ? "#34d399" : v >= 35 ? "#fbbf24" : "#f87171";
const scoreLabel = v => v >= 75 ? "優良" : v >= 55 ? "良好" : v >= 35 ? "普通" : "要注意";
// スコア目安（バッジのtitleに表示）
const SCORE_GUIDE = "【スコア目安】75pt以上: 優良 / 55〜74pt: 良好 / 35〜54pt: 普通 / 34pt以下: 要注意\n（WACCスプレッド入力時は最大100pt、未入力時は85pt換算で正規化）";
const typeColor = t => ({ "決算":"#4ade80","配当":"#fbbf24","人事":"#a78bfa" }[t] || "#64748b");

// レスポンシブ対応：画面幅でフォントスケールを決定
function useResponsive() {
  const [w, setW] = useState(() => typeof window !== "undefined" ? window.innerWidth : 1200);
  useEffect(() => {
    const handler = () => setW(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  if (w < 600) return {
    scale:"sm", base:12, sm:11, md:12, lg:13, xl:16, xxl:18,
    chartSm:140, chartMd:170, chartLg:200, chartXl:230,
    grid2:"1fr", grid3:"1fr", isMobile:true,
  };
  if (w < 1024) return {
    scale:"md", base:13, sm:12, md:13, lg:14, xl:17, xxl:20,
    chartSm:160, chartMd:190, chartLg:220, chartXl:260,
    grid2:"1fr 1fr", grid3:"1fr 1fr", isMobile:false,
  };
  return {
    scale:"lg", base:13, sm:12, md:13, lg:14, xl:18, xxl:22,
    chartSm:180, chartMd:220, chartLg:260, chartXl:300,
    grid2:"1fr 1fr", grid3:"1fr 1fr 1fr", isMobile:false,
  };
}
const TS = { background:"#0d1424", border:"1px solid #1e293b", borderRadius:6, color:"#e2e8f0", fontSize:16 };

const Tag = ({ children, color="#4ade80" }) => (
  <span style={{ background:color+"22", color, border:"1px solid "+(color)+"44", borderRadius:4, padding:"2px 8px", fontSize:16, fontWeight:600 }}>{children}</span>
);

const Delta = ({ val, fmt = v => v.toFixed(2) }) => (
  <span style={{ color:val >= 0 ? "#4ade80" : "#f87171", fontWeight:700 }}>
    {val >= 0 ? "▲" : "▼"} {fmt(Math.abs(val))}
  </span>
);

const MBox = ({ label, value, color="#94a3b8", hint="", badge="" }) => {
  const [open, setOpen] = useState(false);
  const desc = DESC[label];
  return (
    <div style={{ background:"#111827", borderRadius:8, padding:"14px 18px", position:"relative" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <span style={{ color:"#475569", fontSize:16, cursor:desc?"pointer":"default", display:"flex", alignItems:"center", gap:4 }}
          onClick={() => desc && setOpen(v => !v)}>
          {label}
          {desc && <span style={{ color:"#334155", fontSize:16, background:"#1e293b", borderRadius:"50%", width:14, height:14, display:"inline-flex", alignItems:"center", justifyContent:"center" }}>?</span>}
        </span>
        {badge && <span style={{ background:"#0f2a1a", color:"#4ade80", fontSize:16, padding:"1px 5px", borderRadius:3 }}>{badge}</span>}
      </div>
      <div style={{ color, fontWeight:700, fontSize:16, marginTop:3 }}>{value}</div>
      {hint && <div style={{ color:"#334155", fontSize:16, marginTop:2 }}>{hint}</div>}
      {open && desc && (
        <div style={{ position:"absolute", zIndex:200, top:"100%", left:0, marginTop:4, width:280, background:"#0d1424", border:"1px solid #334155", borderRadius:10, padding:"14px 16px", boxShadow:"0 8px 32px rgba(0,0,0,0.8)" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <span style={{ color:"#f1f5f9", fontWeight:700, fontSize:16 }}>{desc.title}</span>
            <button onClick={() => setOpen(false)} style={{ background:"none", border:"none", color:"#64748b", cursor:"pointer", fontSize:18, lineHeight:1 }}>x</button>
          </div>
          <div style={{ background:"#111827", borderRadius:6, padding:"6px 10px", marginBottom:8, fontSize:16, color:"#60a5fa", fontFamily:"monospace" }}>{desc.formula}</div>
          <div style={{ fontSize:16, color:"#cbd5e1", marginBottom:8, lineHeight:1.7 }}>{desc.what}</div>
          <div style={{ fontSize:16, color:"#94a3b8", marginBottom:6, padding:"6px 8px", background:"#111827", borderRadius:6, lineHeight:1.6 }}>{desc.judge}</div>
          {desc.note && <div style={{ fontSize:16, color:"#64748b", lineHeight:1.6 }}>{desc.note}</div>}
        </div>
      )}
    </div>
  );
};

const Sec = ({ title, children }) => (
  <div style={{ marginBottom:20 }}>
    <div style={{ fontSize:16, fontWeight:700, color:"#60a5fa", marginBottom:10, paddingBottom:6, borderBottom:"1px solid #1e293b" }}>{title}</div>
    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(min(160px,45vw),1fr))", gap:14 }}>{children}</div>
  </div>
);

const FInput = ({ label, value, onChange, hint="", numOnly=false, inputType="text", maxLen=200 }) => {
  const handleChange = e => {
    const v = e.target.value;
    if (numOnly) { if (v === "" || v === "-" || /^-?\d*\.?\d*$/.test(v)) onChange(v); return; }
    if (inputType === "ticker") { if (/^\d{0,5}$/.test(v)) onChange(v); return; }
    if (inputType === "date") { if (/^[\d-]{0,10}$/.test(v)) onChange(v); return; }
    if (inputType === "url") { if (!/\s/.test(v)) onChange(v.slice(0, 300)); return; }
    onChange(v.slice(0, maxLen));
  };
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
      <label style={{ color:"#64748b", fontSize:16 }}>{label}</label>
      <input value={value} onChange={handleChange} style={S.input}
        placeholder={numOnly?"数値":inputType==="date"?"2025-05-08":inputType==="url"?"https://...":""}
        inputMode={numOnly||inputType==="ticker"?"decimal":"text"}
      />
      {hint && <span style={{ color:"#334155", fontSize:16 }}>{hint}</span>}
    </div>
  );
};

const INPUT_FIELDS = [
  { label:"株価（円）", key:"price" },
  { label:"発行済株式数（千株）", key:"shares", hint:"例: 14430000" },
  { label:"売上高（円）", key:"sales" },
  { label:"売上総利益（円）", key:"grossProfit" },
  { label:"営業利益（円）", key:"opProfit" },
  { label:"経常利益（円）", key:"ordProfit" },
  { label:"当期純利益（円）", key:"netProfit", hint:"赤字はマイナスで" },
  { label:"総資産（円）", key:"totalAssets" },
  { label:"純資産（円）", key:"equity" },
  { label:"流動資産（円）", key:"curAssets" },
  { label:"固定資産（円）", key:"fixAssets" },
  { label:"流動負債（円）", key:"curLiab" },
  { label:"固定負債（円）", key:"fixLiab" },
  { label:"減価償却費（円）", key:"depTangible", hint:"有形固定資産の減価償却費" },
  { label:"償却費（円）", key:"depIntangible", hint:"無形固定資産・のれん等" },
  { label:"法人税等（円）", key:"taxExp", hint:"P/Lの法人税・住民税・事業税の合計 ※ROIC計算に使用" },
  { label:"支払利息（円）", key:"intExp", hint:"営業外費用の支払利息 ※借入金利自動計算に使用" },
  { label:"1株配当（円）", key:"dividend" },
  { label:"信用倍率（倍）", key:"shinyoBairitu" },
]; 

// 凡例クリックで表示/非表示できる折れ線グラフ
function ToggleLineChart({ data, lines, yFormatter, tooltipFormatter, height=200, refLines=[], TS }) {
  const [hidden, setHidden] = useState({});
  const toggle = key => setHidden(h => ({ ...h, [key]: !h[key] }));
  return (
    <div>
      {/* カスタム凡例 */}
      <div style={{ display:"flex", flexWrap:"wrap", gap:"6px 14px", marginBottom:10 }}>
        {lines.map(({ key, color, name }) => (
          <span key={key} onClick={() => toggle(key)}
            style={{ display:"flex", alignItems:"center", gap:5, fontSize:16, color: hidden[key] ? "#334155" : "#94a3b8", cursor:"pointer", userSelect:"none" }}>
            <span style={{ width:14, height:3, background: hidden[key] ? "#334155" : color, display:"inline-block", borderRadius:2, flexShrink:0 }} />
            {name || key}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="name" tick={{ fill:"#94a3b8", fontSize:R_CURRENT.sm }} />
          <YAxis tick={{ fill:"#64748b", fontSize:R_CURRENT.sm }} tickFormatter={yFormatter} />
          <Tooltip formatter={tooltipFormatter} contentStyle={TS} itemStyle={{ color:"#e2e8f0" }} />
          {refLines.map(r => (
            <ReferenceLine key={r.label} y={r.y} stroke={r.color} strokeDasharray="4 4"
              label={{ value:r.label, fill:r.color, fontSize:16 }} />
          ))}
          {lines.map(({ key, color, name }) => (
            hidden[key] ? null :
            <Line key={key} type="monotone" dataKey={key} stroke={color} strokeWidth={2}
              dot={{ fill:color, r:3 }} connectNulls name={name || key} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// 凡例クリックで表示/非表示できる棒グラフ
function ToggleBarChart({ data, bars, yFormatter, tooltipFormatter, height=200, TS }) {
  const [hidden, setHidden] = useState({});
  const toggle = key => setHidden(h => ({ ...h, [key]: !h[key] }));
  return (
    <div>
      <div style={{ display:"flex", flexWrap:"wrap", gap:"6px 14px", marginBottom:10 }}>
        {bars.map(({ key, color }) => (
          <span key={key} onClick={() => toggle(key)}
            style={{ display:"flex", alignItems:"center", gap:5, fontSize:R_CURRENT.sm, color:hidden[key]?"#334155":"#94a3b8", cursor:"pointer", userSelect:"none" }}>
            <span style={{ width:14, height:10, background:hidden[key]?"#334155":color, display:"inline-block", borderRadius:2, flexShrink:0 }} />
            {key}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="name" tick={{ fill:"#94a3b8", fontSize:R_CURRENT.sm }} interval={0} angle={-45} textAnchor="end" height={60} />
          <YAxis tick={{ fill:"#64748b", fontSize:R_CURRENT.sm }} tickFormatter={yFormatter} />
          <Tooltip formatter={tooltipFormatter} contentStyle={TS} itemStyle={{ color:"#e2e8f0" }} />
          {bars.map(({ key, color }) => (
            hidden[key] ? null :
            <Bar key={key} dataKey={key} fill={color} radius={[2,2,0,0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── 多期間入力フィールド定義 ──────────────────────────────────────────────────
const PERIOD_FIELDS = [
  { label:"株価（円）",              key:"price" },
  { label:"発行済株式数（千株）",     key:"shares",        hint:"例: 14430000" },
  { label:"売上高（円）",            key:"sales" },
  { label:"売上総利益（円）",        key:"grossProfit" },
  { label:"営業利益（円）",          key:"opProfit" },
  { label:"経常利益（円）",          key:"ordProfit" },
  { label:"当期純利益（円）",        key:"netProfit",     hint:"赤字はマイナスで" },
  { label:"総資産（円）",            key:"totalAssets" },
  { label:"純資産（円）",            key:"equity" },
  { label:"流動資産（円）",          key:"curAssets" },
  { label:"固定資産（円）",          key:"fixAssets" },
  { label:"流動負債（円）",          key:"curLiab" },
  { label:"固定負債（円）",          key:"fixLiab" },
  { label:"減価償却費（円）",        key:"depTangible",   hint:"有形固定資産の減価償却費" },
  { label:"償却費（円）",            key:"depIntangible", hint:"無形固定資産・のれん等" },
  { label:"法人税等（円）",           key:"taxExp",        hint:"P/Lの法人税・住民税・事業税 ※ROIC計算に使用" },
  { label:"支払利息（円）",          key:"intExp",        hint:"営業外費用の支払利息 ※借入金利自動計算" },
  { label:"1株配当（円）",           key:"dividend" },
  { label:"信用倍率（倍）",          key:"shinyoBairitu" },
];

const CY = new Date().getFullYear();

// 決算年次はlocalStorageで管理（初期値は現在年）
const LS_BASE_YEAR = "kabulens_base_year";
const loadBaseYear = () => {
  try { const v = localStorage.getItem(LS_BASE_YEAR); return v ? parseInt(v) : CY; } catch { return CY; }
};
const saveBaseYear = y => { try { localStorage.setItem(LS_BASE_YEAR, String(y)); } catch {} };

// baseYearを基準に4年分のキーを生成（baseYear-2 〜 baseYear+1）
const getAnnualKeys = base => [String(base-2), String(base-1), String(base), String(base+1)];
const getQtrKeys = base => {
  const keys = [];
  for (let y = base-2; y <= base+1; y++) {
    ["Q1","Q2","Q3","Q4"].forEach(q => keys.push((y)+"-"+(q)));
  }
  return keys;
};

// 銘柄ごとのlatestFiscalYearを取得（未設定なら全体のbaseYearを使用）
const getStockBaseYear = (h, globalBaseYear) => h.latestFiscalYear ? parseInt(h.latestFiscalYear) : globalBaseYear;

const LS_UNDO = "kabulens_undo_v2";
const loadUndoData = () => {
  try {
    const d = localStorage.getItem(LS_UNDO);
    if (!d) return null;
    const parsed = JSON.parse(d);
    if (!parsed || !parsed.baseYear || !Array.isArray(parsed.portfolio)) return null;
    return parsed;
  } catch { return null; }
};
const saveUndoData = d => { try { localStorage.setItem(LS_UNDO, JSON.stringify(d)); } catch {} };
const clearUndoData = () => { try { localStorage.removeItem(LS_UNDO); } catch {} };
const FORECAST_KEY = "forecast";
const FORECAST_FIELDS = [
  { label:"予想売上高（円）",   key:"sales" },
  { label:"予想営業利益（円）", key:"opProfit" },
  { label:"予想純利益（円）",   key:"netProfit", hint:"赤字はマイナスで" },
  { label:"予想1株配当（円）",  key:"dividend" },
];

function chgColor(v) {
  if (v == null) return "#475569";
  return v > 0 ? "#4ade80" : v < 0 ? "#f87171" : "#94a3b8";
}
function chgStr(v) {
  if (v == null) return "—";
  return (v > 0 ? "+" : "") + v.toFixed(1) + "%";
}
function calcChg(cur, prev) {
  if (cur == null || prev == null || prev === 0) return null;
  return (cur - prev) / Math.abs(prev) * 100;
}

// 財務指標タブ（多期間対応）
// スコアバッジ（モード表示付き）
function ScoreBadge({ sc, stockId, large }) {
  const mode = loadScoreMode(stockId);
  const modeLabel = mode === "value" ? "バリュー" : mode === "growth" ? "グロース" : mode === "custom" ? "カスタム" : null;
  const modeColor = mode === "value" ? "#60a5fa" : mode === "growth" ? "#4ade80" : mode === "custom" ? "#fbbf24" : "#94a3b8";
  if (sc == null) return null;
  const tipText = SCORE_GUIDE + "\n\n" + SCORE_CRITERIA.map(c2 =>
    c2.label+"["+c2.cat+"] 良好:"+c2.good+" 優良:"+c2.great+(c2.penalty ? " | "+c2.penalty : "")
  ).join("\n");
  return (
    <div style={{ display:"inline-flex", flexDirection:"column", alignItems:"flex-start", gap:2 }} title={tipText}>
      <span style={{ background:scoreColor(sc)+"22", color:scoreColor(sc), border:"1px solid "+scoreColor(sc)+"44", borderRadius:5, padding:"2px 7px", fontSize:large?15:12, fontWeight:700, whiteSpace:"nowrap", cursor:"help" }}>
        {sc}pt <span style={{ fontSize:large?11:10, opacity:0.85 }}>{scoreLabel(sc)}</span>
      </span>
      {modeLabel && (
        <span style={{ fontSize:10, background:modeColor+"22", color:modeColor, border:"1px solid "+modeColor+"44", borderRadius:3, padding:"1px 5px", whiteSpace:"nowrap" }}>
          {modeLabel}
        </span>
      )}
    </div>
  );
}

// スコア評価基準カスタマイズコンポーネント
function ScoreCriteriaEditor({ selected, R, S, onModeChange }) {
  const [show, setShow] = useState(false);
  const [mode, setMode] = useState(() => loadScoreMode(selected?.id));
  const [customCriteria, setCustomCriteria] = useState(() => loadCustomCriteria(selected?.id) || DEFAULT_CRITERIA);
  const [updatedAt, setUpdatedAt] = useState(() => {
    const c = loadCustomCriteria(selected?.id);
    return c?.updatedAt || DEFAULT_CRITERIA.updatedAt;
  });

  useEffect(() => {
    const m = loadScoreMode(selected?.id);
    const c = loadCustomCriteria(selected?.id) || DEFAULT_CRITERIA;
    setMode(m);
    setCustomCriteria(c);
    setUpdatedAt(c.updatedAt || DEFAULT_CRITERIA.updatedAt);
  }, [selected?.id]);

  const handleModeChange = (newMode) => {
    setMode(newMode);
    saveScoreMode(selected.id, newMode);
    if (onModeChange) onModeChange();
  };

  const handleChange = (key, field, val) => {
    const num = parseFloat(val);
    if (isNaN(num) && val !== "") return;
    setCustomCriteria(prev => ({ ...prev, [key]: { ...prev[key], [field]: val === "" ? "" : num } }));
  };

  const handleSave = () => {
    const today = new Date().toISOString().slice(0,10);
    const saved = { ...customCriteria, updatedAt: today };
    saveCustomCriteria(selected.id, saved);
    saveScoreMode(selected.id, "custom");
    setMode("custom");
    setUpdatedAt(today);
    setShow(false);
    if (onModeChange) onModeChange();
    alert("カスタム基準値を保存しました（"+today+"）");
  };

  const handlePreset = (presetMode) => {
    const preset = CRITERIA_PRESETS[presetMode];
    setCustomCriteria({ ...preset });
    setUpdatedAt(preset.updatedAt);
  };

  const currentCriteria = getCriteriaByMode(mode, selected?.id);
  const modeInfo = mode === "value" ? CRITERIA_PRESETS.value :
                   mode === "growth" ? CRITERIA_PRESETS.growth :
                   mode === "custom" ? { label:"カスタム基準", color:"#fbbf24" } :
                   { label:"標準基準", color:"#94a3b8" };

  return (
    <div style={{ ...S.card, border:"1px solid #334155", marginBottom:16 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8, marginBottom:12 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
          <span style={{ color:"#94a3b8", fontWeight:700, fontSize:R.md }}>スコア評価基準</span>
          <span style={{ background:modeInfo.color+"22", color:modeInfo.color, border:"1px solid "+modeInfo.color+"44", borderRadius:6, padding:"2px 8px", fontSize:R.sm, fontWeight:700 }}>
            {modeInfo.label}
          </span>
          <span style={{ color:"#334155", fontSize:R.sm }}>更新日: {currentCriteria.updatedAt || updatedAt}</span>
        </div>
        <button style={{ ...S.miniBtn, color:"#60a5fa", borderColor:"#60a5fa" }} onClick={() => setShow(v => !v)}>
          {show ? "▲ 閉じる" : "▼ 基準を変更"}
        </button>
      </div>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
        {[["standard","標準","#94a3b8"],["value","バリュー","#60a5fa"],["growth","グロース","#4ade80"],["custom","カスタム","#fbbf24"]].map(([m, label, color]) => (
          <button key={m} style={{ ...S.miniBtn, ...(mode===m ? { color, borderColor:color, background:color+"22" } : {}) }} onClick={() => handleModeChange(m)}>
            {label}
          </button>
        ))}
      </div>
      {show && (
        <div style={{ marginTop:16 }}>
          <div style={{ color:"#475569", fontSize:R.sm, marginBottom:12 }}>カスタム基準値を編集します。プリセットを読み込んでから調整することもできます。</div>
          <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
            <button style={S.miniBtn} onClick={() => handlePreset("value")}>バリュー基準を読み込む</button>
            <button style={S.miniBtn} onClick={() => handlePreset("growth")}>グロース基準を読み込む</button>
            <button style={S.miniBtn} onClick={() => { setCustomCriteria(DEFAULT_CRITERIA); setUpdatedAt(DEFAULT_CRITERIA.updatedAt); }}>標準基準を読み込む</button>
          </div>
          {["割安性","収益性","成長性","資本効率","健全性"].map(cat => (
            <div key={cat} style={{ marginBottom:16 }}>
              <div style={{ color:"#60a5fa", fontWeight:700, fontSize:R.sm, marginBottom:8 }}>{cat}</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(min(320px,100%),1fr))", gap:8 }}>
                {CRITERIA_META.filter(m2 => m2.cat === cat).map(m2 => {
                  const cr = customCriteria[m2.key] || DEFAULT_CRITERIA[m2.key];
                  const def = DEFAULT_CRITERIA[m2.key];
                  const sc = m2.scale || 1;
                  const fmt = v => m2.unit === "%" ? parseFloat((v*sc).toFixed(1)) : v;
                  return (
                    <div key={m2.key} style={{ background:"#111827", borderRadius:8, padding:"10px 12px" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                        <span style={{ color:"#94a3b8", fontSize:R.sm, fontWeight:700 }}>{m2.label}</span>
                        <span style={{ color:"#334155", fontSize:R.sm }}>標準: {m2.dir==="lt"?"<":">"}{fmt(def.good)}{m2.unit}/{fmt(def.great)}{m2.unit}</span>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                        <div>
                          <label style={{ color:"#64748b", fontSize:R.sm, display:"block", marginBottom:3 }}>良好({m2.dir==="lt"?"<":">"} □{m2.unit}) {cr.goodPts}pt</label>
                          <input value={fmt(cr.good)} onChange={e => handleChange(m2.key, "good", m2.scale ? String(parseFloat(e.target.value)/sc) : e.target.value)} style={{ ...S.input, fontSize:R.sm }} inputMode="decimal" />
                        </div>
                        <div>
                          <label style={{ color:"#64748b", fontSize:R.sm, display:"block", marginBottom:3 }}>優良({m2.dir==="lt"?"<":">"} □{m2.unit}) {cr.greatPts}pt</label>
                          <input value={fmt(cr.great)} onChange={e => handleChange(m2.key, "great", m2.scale ? String(parseFloat(e.target.value)/sc) : e.target.value)} style={{ ...S.input, fontSize:R.sm }} inputMode="decimal" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <div style={{ display:"flex", gap:8, marginTop:8 }}>
            <button style={S.addBtn} onClick={handleSave}>カスタム基準として保存</button>
            <button style={S.miniBtn} onClick={() => setShow(false)}>閉じる</button>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricsTab({ c, f, selected, periods, baseYear, annualKeys, qtrKeys, R, TS }) {
  const [metricsView, setMetricsView] = useState("current");
  const [waccParams, setWaccParams] = useState(() => {
    try {
      const d = localStorage.getItem("kabulens_wacc_"+(selected?.id||""));
      return d ? JSON.parse(d) : { beta:"", kd:"", rf:"1.5", rp:"5.5" };
    } catch { return { beta:"", kd:"", rf:"1.5", rp:"5.5" }; }
  });

  // 銘柄切り替え時にwaccParamsを再読み込み
  useEffect(() => {
    if (!selected) return;
    try {
      const d = localStorage.getItem("kabulens_wacc_"+selected.id);
      setWaccParams(d ? JSON.parse(d) : { beta:"", kd:"", rf:"1.5", rp:"5.5" });
    } catch {}
  }, [selected?.id]);
  const [showWacc, setShowWacc] = useState(false);

  const annualData = useMemo(() => {
    return annualKeys.map(yr => {
      const fd = periods[yr] || {};
      const calc = calcAll(fd);
      return { label: yr+"年", key: yr, f: fd, c: calc };
    });
  }, [periods, annualKeys]);

  // 最新本決算 = baseYear年のデータ（翌年は予算年度なので除く）
  const latestAnnual = useMemo(() => {
    const baseKey = String(baseYear);
    const fd = periods[baseKey] || {};
    if (!Object.values(fd).some(v => v !== "" && v != null)) {
      // baseYearが空なら前年を探す
      const filled = [String(baseYear-1), String(baseYear-2)].map(yr => ({ key:yr, f:periods[yr]||{} })).find(d => Object.values(d.f).some(v => v !== "" && v != null));
      return filled ? { label:filled.key+"年", key:filled.key, f:filled.f, c:calcAll(filled.f) } : null;
    }
    return { label:baseKey+"年", key:baseKey, f:fd, c:calcAll(fd) };
  }, [periods, baseYear]);

  // 現在の指標用: 最新本決算があればそちらを使い、株価だけ現在値で上書き
  const cc = useMemo(() => {
    if (!latestAnnual) return c;
    const merged = {
      ...latestAnnual.f,
      price: f.price || latestAnnual.f.price,
      shinyoBairitu: latestAnnual.f.shinyoBairitu || f.shinyoBairitu,
    };
    return calcAll(merged);
  }, [latestAnnual, c, f]);
  const ff = latestAnnual ? {
    ...latestAnnual.f,
    price: f.price || latestAnnual.f.price,
    shinyoBairitu: latestAnnual.f.shinyoBairitu || f.shinyoBairitu,
  } : f;

  // WACC計算（cc・ffの後に定義）
  const fc = useMemo(() => {
    const fd = periods[FORECAST_KEY] || {};
    if (!Object.values(fd).some(v => v !== "" && v != null)) return null;
    const base = latestAnnual ? latestAnnual.f : {};
    // 株価・株式数・純資産は実績継承、予想数値で上書き
    const merged = {
      ...base,
      price: ff.price,
      sales: fd.sales || base.sales,
      netProfit: fd.netProfit,
      opProfit: fd.opProfit,
      dividend: fd.dividend,
      // EBITDA・減価償却は予想なしなのでnull
      ebitda: "",
      depTangible: "",
      depIntangible: "",
    };
    return calcAll(merged);
  }, [periods, latestAnnual, ff]);


  // WACC計算（fc定義後に配置）
  const waccResult = useMemo(() => {
    const beta = parseFloat(waccParams.beta);
    const rf   = parseFloat(waccParams.rf) / 100;
    const rp   = parseFloat(waccParams.rp) / 100;
    if (isNaN(beta) || isNaN(rf) || isNaN(rp)) return null;
    if (!cc || !cc.marketCap) return null;
    // 借入金利: 手動入力 > 支払利息から自動計算 > 入力なし
    const kdManual = waccParams.kd !== "" ? parseFloat(waccParams.kd) / 100 : null;
    const kd = kdManual != null ? kdManual : (cc.kdAuto != null ? cc.kdAuto : null);
    if (kd === null) return null;
    const ke = rf + beta * rp;
    const E = cc.marketCap;
    const fl2 = n(ff.fixLiab);
    const D = fl2 != null ? fl2 : 0;
    const V = E + D;
    if (V === 0) return null;
    const t = cc.taxRate || 0.30;
    const wacc = ke * (E / V) + kd * (1 - t) * (D / V);
    const roic = cc.roic || 0;
    const spread = roic - wacc;
    const kdSource = kdManual != null ? "手動入力" : "支払利息から自動計算";
    const checks = [
      { label:"ROIC > WACC（価値創造）",    ok: spread > 0,   val: pct(roic)+" > "+pct(wacc), impact:"high" },
      { label:"スプレッド > 2%（余裕あり）", ok: spread > 0.02, val: (spread*100).toFixed(2)+"%", impact:"high" },
      { label:"予想PER < 20倍",            ok: fc ? (fc.per != null && fc.per < 20) : (cc.per != null && cc.per < 20),
                                           val: fc ? (fc.per ? xfmt(fc.per)+"(予想)" : "—") : (cc.per ? xfmt(cc.per)+"(実績)" : "—"), impact:"mid" },
      { label:"ROE > 10%",                 ok: cc.roe != null && cc.roe > 0.10, val: cc.roe ? pct(cc.roe) : "—", impact:"mid" },
      { label:"自己資本比率 > 30%",         ok: cc.equityRatio != null && cc.equityRatio > 0.30, val: cc.equityRatio ? pct(cc.equityRatio) : "—", impact:"mid" },
      { label:"営業利益率 > 10%",           ok: cc.opMargin != null && cc.opMargin > 0.10, val: cc.opMargin ? pct(cc.opMargin) : "—", impact:"mid" },
      { label:"流動比率 > 150%",            ok: cc.currentRatio != null && cc.currentRatio > 1.5, val: cc.currentRatio ? pct(cc.currentRatio) : "—", impact:"low" },
      { label:"PBR < 3倍",                 ok: cc.pbr != null && cc.pbr < 3, val: cc.pbr ? xfmt(cc.pbr) : "—", impact:"low" },
    ];
    const score = checks.filter(c2 => c2.ok).length;
    const verdict = spread > 0.02 && score >= 6 ? "強い買い候補" :
                    spread > 0    && score >= 5 ? "買い候補" :
                    spread > -0.01&& score >= 4 ? "中立・様子見" :
                    spread < 0    && score <= 3 ? "要注意" : "中立";
    const verdictColor = verdict === "強い買い候補" ? "#4ade80" :
                         verdict === "買い候補"     ? "#34d399" :
                         verdict === "中立・様子見" ? "#fbbf24" : "#f87171";
    return { ke, kd, kdSource, wacc, E, D, V, t, spread, checks, score, verdict, verdictColor };
  }, [waccParams, cc, ff, fc]);

  // waccParamsをlocalStorageに保存
  useEffect(() => {
    if (!selected) return;
    try { localStorage.setItem("kabulens_wacc_"+selected.id, JSON.stringify(waccParams)); } catch {}
  }, [waccParams, selected?.id]);

  const trendData = useMemo(() => {
    return annualData.map(({ label, f: fd, c: ca }, i) => {
      // 売上成長率（前年比）
      const prevSales = i > 0 ? n(annualData[i-1].f.sales) : null;
      const curSales = n(fd.sales);
      const salesGrowth = (curSales != null && prevSales != null && prevSales > 0)
        ? parseFloat(((curSales - prevSales) / prevSales * 100).toFixed(1))
        : null;
      // Rule of 40 = 売上成長率(%) + 営業利益率(%)
      const opMarginPct = ca.opMargin != null ? parseFloat((ca.opMargin*100).toFixed(1)) : null;
      const rule40 = (salesGrowth != null && opMarginPct != null)
        ? parseFloat((salesGrowth + opMarginPct).toFixed(1))
        : null;
      return {
        name: label,
        売上高: curSales ? parseFloat(fmtM(curSales).replace(/[^0-9.-]/g,"")) : null,
        営業利益: n(fd.opProfit) ? parseFloat(fmtM(n(fd.opProfit)).replace(/[^0-9.-]/g,"")) : null,
        純利益: n(fd.netProfit) ? parseFloat(fmtM(n(fd.netProfit)).replace(/[^0-9.-]/g,"")) : null,
        EBITDA: ca.ebitda ? parseFloat(fmtM(ca.ebitda).replace(/[^0-9.-]/g,"")) : null,
        ROE: ca.roe ? parseFloat((ca.roe*100).toFixed(1)) : null,
        ROA: ca.roa ? parseFloat((ca.roa*100).toFixed(1)) : null,
        営業利益率: opMarginPct,
        経常利益率: ca.ordMargin ? parseFloat((ca.ordMargin*100).toFixed(1)) : null,
        純利益率: ca.netMargin ? parseFloat((ca.netMargin*100).toFixed(1)) : null,
        粗利率: ca.grossMargin ? parseFloat((ca.grossMargin*100).toFixed(1)) : null,
        自己資本比率: ca.equityRatio ? parseFloat((ca.equityRatio*100).toFixed(1)) : null,
        EV_EBITDA: ca.evEbitda ? parseFloat(ca.evEbitda.toFixed(2)) : null,
        PER: ca.per ? parseFloat(ca.per.toFixed(2)) : null,
        PBR: ca.pbr ? parseFloat(ca.pbr.toFixed(2)) : null,
        PSR: ca.psr ? parseFloat(ca.psr.toFixed(2)) : null,
        売上成長率: salesGrowth,
        Rule40: rule40,
      };
    });
  }, [annualData]);

  const qtrData = useMemo(() => {
    return qtrKeys.map(key => {
      const fd = periods[key] || {};
      const calc = calcAll(fd);
      const [yr, q] = key.split("-");
      return { label: yr+"年"+q, key, f: fd, c: calc };
    });
  }, [periods, qtrKeys]);

  return (
    <div>
      <div style={{ display:"flex", gap:4, marginBottom:16 }}>
        <button style={{ ...S.navBtn, ...(metricsView==="current"?S.navOn:{}) }} onClick={() => setMetricsView("current")}>現在の指標</button>
        <button style={{ ...S.navBtn, ...(metricsView==="trend"?S.navOn:{}) }} onClick={() => setMetricsView("trend")}>トレンド分析</button>
        <button style={{ ...S.navBtn, ...(metricsView==="qtr"?S.navOn:{}) }} onClick={() => setMetricsView("qtr")}>四半期推移</button>
      </div>

      {metricsView === "current" && (
        <div>
          {latestAnnual && (
            <div style={{ marginBottom:12, padding:"6px 12px", background:"#111827", borderRadius:6, fontSize:16, color:"#64748b" }}>
              財務数値: <span style={{ color:"#4ade80" }}>{latestAnnual.label}本決算</span> を使用 / 株価・信用倍率: 現在の入力値
            </div>
          )}
          {!latestAnnual && (
            <div style={{ marginBottom:12, padding:"6px 12px", background:"#111827", borderRadius:6, fontSize:16, color:"#fbbf24" }}>
              本決算データ未入力です。「数値入力」タブの「本決算（年次）」から入力してください。
            </div>
          )}
          <Sec title="株価指標(実績)">
            <MBox label="PER" value={cc.per?xfmt(cc.per):"—"} color={cc.per&&cc.per<15?"#4ade80":cc.per&&cc.per<25?"#fbbf24":"#f87171"} hint="15倍未満が割安" badge={cc.per&&cc.per<15?"割安":""} />
            <MBox label="PBR" value={cc.pbr?xfmt(cc.pbr):"—"} color={cc.pbr&&cc.pbr<1.5?"#4ade80":"#94a3b8"} hint="1倍以下は解散価値割れ" />
            <MBox label="PSR" value={cc.psr?xfmt(cc.psr):"—"} color={cc.psr&&cc.psr<2?"#4ade80":"#94a3b8"} />
            <MBox label="信用倍率" value={ff.shinyoBairitu?ff.shinyoBairitu+"倍":"—"} color={n(ff.shinyoBairitu)>3?"#f87171":"#94a3b8"} hint="高いと将来売り圧力" />
            <MBox label="配当利回り" value={cc.dividendYield?pct(cc.dividendYield):"—"} color={cc.dividendYield&&cc.dividendYield>0.03?"#4ade80":"#94a3b8"} />
            <MBox label="配当性向" value={cc.payoutRatio?pct(cc.payoutRatio):"—"} color="#94a3b8" hint="30〜50%が健全" />
            <MBox label="時価総額" value={cc.marketCap?fmtM(cc.marketCap):"—"} color="#e2e8f0" />
          </Sec>
          {fc && (
            <Sec title="株価指標(今期予想)">
              <MBox label="予想PER" value={fc.per?xfmt(fc.per):"—"} color={fc.per&&fc.per<15?"#4ade80":fc.per&&fc.per<25?"#fbbf24":"#f87171"} hint="今期予想純利益ベース" badge={fc.per&&fc.per<15?"割安":""} />
              <MBox label="予想PSR" value={fc.psr?xfmt(fc.psr):"—"} color={fc.psr&&fc.psr<2?"#4ade80":"#94a3b8"} hint="今期予想売上高ベース" />
              <MBox label="予想配当利回り" value={fc.dividendYield?pct(fc.dividendYield):"—"} color={fc.dividendYield&&fc.dividendYield>0.03?"#4ade80":"#94a3b8"} hint="今期予想配当ベース" />
              <MBox label="予想営業利益率" value={fc.opMargin?pct(fc.opMargin):"—"} color={fc.opMargin&&fc.opMargin>0.10?"#4ade80":"#94a3b8"} hint="今期予想営業利益ベース" />
            </Sec>
          )}
          <Sec title="キャッシュ指標">
            <MBox label="EBITDA(実績)" value={cc.ebitda?fmtM(cc.ebitda):"—"} color="#60a5fa" hint="営業利益+減価償却費+償却費" />
            <MBox label="EV/EBITDA(実績)" value={cc.evEbitda?xfmt(cc.evEbitda):"—"} color={cc.evEbitda&&cc.evEbitda<10?"#4ade80":"#94a3b8"} hint="10倍未満が割安" />
            {cc.depTangible != null && <MBox label="減価償却費" value={fmtM(cc.depTangible)} color="#94a3b8" />}
            {cc.depIntangible != null && <MBox label="償却費" value={fmtM(cc.depIntangible)} color="#94a3b8" />}
          </Sec>
          <Sec title="収益性・資本効率">
            <MBox label="ROE" value={cc.roe?pct(cc.roe):"—"} color={cc.roe&&cc.roe>0.15?"#4ade80":"#94a3b8"} hint="15%超で優良" />
            <MBox label="ROA" value={cc.roa?pct(cc.roa):"—"} color={cc.roa&&cc.roa>0.05?"#4ade80":"#94a3b8"} hint="5%超で優良" />
            <MBox label="ROIC" value={cc.roic?pct(cc.roic):"—"} color={cc.roic&&cc.roic>0.08?"#4ade80":"#94a3b8"} hint={cc.taxRate!=null?"実効税率"+((cc.taxRate*100).toFixed(1))+"%で計算":"税率30%で計算（法人税等未入力）"} />
            <MBox label="粗利率" value={cc.grossMargin?pct(cc.grossMargin):"—"} color={cc.grossMargin&&cc.grossMargin>0.40?"#4ade80":"#94a3b8"} />
            <MBox label="営業利益率" value={cc.opMargin?pct(cc.opMargin):"—"} color={cc.opMargin&&cc.opMargin>0.10?"#4ade80":"#94a3b8"} hint="10%超で優良" />
            <MBox label="経常利益率" value={cc.ordMargin?pct(cc.ordMargin):"—"} color="#94a3b8" />
          </Sec>

          {/* Rule of 40 セクション */}
          {(r40 => (
            <Sec title="グロース指標（Rule of 40）">
              <MBox
                label="売上成長率(YoY)"
                value={r40.salesGrowth != null ? (r40.salesGrowth >= 0 ? "+" : "") + r40.salesGrowth.toFixed(1) + "%" : "—"}
                color={r40.salesGrowth == null ? "#94a3b8" : r40.salesGrowth >= 20 ? "#4ade80" : r40.salesGrowth >= 10 ? "#fbbf24" : "#94a3b8"}
                hint={"前年(" + r40.prevYrKey + "年)比"}
              />
              <MBox
                label="営業利益成長率(YoY)"
                value={r40.opGrowth != null ? (r40.opGrowth >= 0 ? "+" : "") + r40.opGrowth.toFixed(1) + "%" : "—"}
                color={r40.opGrowth == null ? "#94a3b8" : r40.opGrowth >= 20 ? "#4ade80" : r40.opGrowth >= 10 ? "#fbbf24" : "#94a3b8"}
                hint={"前年(" + r40.prevYrKey + "年)比"}
              />
              <MBox
                label="Rule of 40"
                value={r40.rule40 != null ? r40.rule40.toFixed(1) : "—"}
                color={r40.rule40Color}
                hint="売上成長率% + 営業利益率%"
                badge={r40.rule40 != null && r40.rule40 >= 20 ? "優良" : r40.rule40 != null && r40.rule40 >= 15 ? "良好" : ""}
              />
              <div style={{ gridColumn:"1/-1", background:"#111827", borderRadius:8, padding:"10px 14px", fontSize:R_CURRENT.sm, color:"#64748b", lineHeight:1.8 }}>
                <div style={{ color:"#94a3b8", fontWeight:700, marginBottom:4 }}>Rule of 40 とは</div>
                <div>SaaS・グロース株の健全性指標。<span style={{ color:"#60a5fa" }}>売上成長率(%) + 営業利益率(%)</span> が40以上なら優良。</div>
                <div style={{ marginTop:4 }}>赤字成長企業でも売上成長率が高ければ評価できる。例: 成長率50% + 利益率-5% = 45点 → 優良</div>
                <div style={{ marginTop:6, padding:"6px 10px", background:"#0d1424", borderRadius:6, borderLeft:"3px solid #fbbf24" }}>
                  <span style={{ color:"#fbbf24", fontWeight:700 }}>📌 当アプリの独自基準：</span>
                  <span style={{ color:"#64748b" }}> 米国基準(40以上)ではなく日本株市場の実態に合わせた独自基準を採用。良好(≥15): 7pt / 優良(≥20): 15pt。スコア評価基準のモードで変更可能。</span>
                </div>
                <div style={{ marginTop:6, display:"flex", gap:12, flexWrap:"wrap" }}>
                  <span style={{ color:"#4ade80" }}>● 20以上: 優良(15pt)</span>
                  <span style={{ color:"#34d399" }}>● 15〜20: 良好(7pt)</span>
                  <span style={{ color:"#fbbf24" }}>● 10〜15: 普通(0pt)</span>
                  <span style={{ color:"#f87171" }}>● 10未満: 要注意(0pt)</span>
                  <span style={{ color:"#475569" }}>｜ 米国基準: 40以上</span>
                </div>
              </div>
            </Sec>
          ))((prevYrKey => {
            const prevFd = periods[prevYrKey] || {};
            const prevSales = n(prevFd.sales);
            const curSales = n(ff.sales);
            const salesGrowth = (curSales != null && prevSales != null && prevSales > 0)
              ? (curSales - prevSales) / prevSales * 100 : null;
            const prevOp = n(prevFd.opProfit);
            const curOp = n(ff.opProfit);
            const opGrowth = (curOp != null && prevOp != null && prevOp > 0)
              ? (curOp - prevOp) / prevOp * 100 : null;
            const opMarginPct = cc.opMargin != null ? cc.opMargin * 100 : null;
            const rule40 = salesGrowth != null && opMarginPct != null ? salesGrowth + opMarginPct : null;
            const rule40Color = rule40 == null ? "#94a3b8" : rule40 >= 20 ? "#4ade80" : rule40 >= 15 ? "#34d399" : rule40 >= 10 ? "#fbbf24" : "#f87171";
            return { salesGrowth, opGrowth, rule40, rule40Color, prevYrKey };
          })(String(baseYear - 1)))}
          <Sec title="安全性">
            <MBox label="自己資本比率" value={cc.equityRatio?pct(cc.equityRatio):"—"} color={cc.equityRatio&&cc.equityRatio>0.40?"#4ade80":"#94a3b8"} hint="40%超が安全" />
            <MBox label="流動比率" value={cc.currentRatio?pct(cc.currentRatio):"—"} color={cc.currentRatio&&cc.currentRatio>2?"#4ade80":cc.currentRatio&&cc.currentRatio>1?"#fbbf24":"#f87171"} hint="200%超が理想" />
            <MBox label="固定比率" value={cc.fixedRatio?pct(cc.fixedRatio):"—"} color={cc.fixedRatio&&cc.fixedRatio<1?"#4ade80":"#94a3b8"} hint="100%以下が望ましい" />
            <MBox label="固定長期適合率" value={cc.fixedLTRatio?pct(cc.fixedLTRatio):"—"} color={cc.fixedLTRatio&&cc.fixedLTRatio<1?"#4ade80":"#f87171"} hint="100%以下が望ましい" />
          </Sec>

          {/* スコア評価基準カスタマイズ */}
          <ScoreCriteriaEditor selected={selected} R={R_CURRENT} S={S} />

          {/* WACC・投資判断セクション */}
          <div style={{ ...S.card, border:"1px solid #334155" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
              <div style={{ color:"#a78bfa", fontWeight:700, fontSize:R_CURRENT.lg }}>WACC・投資判断分析</div>
              <button style={{ ...S.miniBtn, color:"#a78bfa", borderColor:"#a78bfa" }} onClick={() => setShowWacc(v => !v)}>
                {showWacc ? "▲ 閉じる" : "▼ パラメータ入力"}
              </button>
            </div>
            <div style={{ background:"#111827", borderRadius:6, padding:"10px 14px", marginBottom:14, fontSize:R_CURRENT.sm, color:"#64748b", lineHeight:1.8 }}>
              <div style={{ color:"#a78bfa", fontWeight:700, marginBottom:4 }}>WACCとは（加重平均資本コスト）</div>
              <div><strong style={{ color:"#94a3b8" }}>WACC = Ke × E/V + Kd×(1-t) × D/V</strong></div>
              <div style={{ marginTop:6, display:"grid", gridTemplateColumns:R_CURRENT.grid2, gap:4 }}>
                {[
                  ["Ke（株主資本コスト）", "= Rf + β × 市場リスクプレミアム（CAPM）"],
                  ["Kd（負債コスト）",     "= 借入金利（支払利息÷固定負債）"],
                  ["E/V",                "= 時価総額 ÷（時価総額＋固定負債）"],
                  ["D/V",                "= 固定負債 ÷（時価総額＋固定負債）"],
                  ["t（実効税率）",        "= 法人税等 ÷ 経常利益（未入力は30%）"],
                  ["β（ベータ）",         "= 市場全体に対する株価の感応度"],
                ].map(([k,v]) => (
                  <div key={k} style={{ fontSize:R_CURRENT.sm }}>
                    <span style={{ color:"#60a5fa" }}>{k}</span>: {v}
                  </div>
                ))}
              </div>
              <div style={{ marginTop:8, color:"#475569" }}>
                ROICがWACCを上回る（スプレッド {">"} 0）= 企業が資本コスト以上のリターンを生んでいる = 価値創造
              </div>
            </div>

            {showWacc && (
              <div style={{ marginBottom:16 }}>
                <div style={{ color:"#475569", fontSize:R_CURRENT.sm, marginBottom:12 }}>
                  β・借入金利を入力してください。支払利息を数値入力タブに入力すると借入金利が自動計算されます。Rf・市場リスクプレミアムはデフォルト値を変更可能です。
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(min(160px,45vw),1fr))", gap:12 }}>
                  {/* β入力欄（リンク付き） */}
                  <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                    <label style={{ color:"#64748b", fontSize:R_CURRENT.sm }}>β（ベータ）</label>
                    <input
                      value={waccParams.beta}
                      onChange={e => { const v=e.target.value; if(v===""||/^-?\d*\.?\d*$/.test(v)) setWaccParams(p=>({...p,beta:v})); }}
                      style={S.input} placeholder="1.2" inputMode="decimal"
                    />
                    <a
                      href={"https://www.buffett-code.com/company/"+(selected?.ticker)+"/"}
                      target="_blank" rel="noreferrer"
                      style={{ color:"#60a5fa", fontSize:R_CURRENT.sm, textDecoration:"none" }}
                    >
                      📊 バフェットコード({selected?.ticker})でβを確認 ↗
                    </a>
                  </div>
                  {/* 借入金利・Rf・RPは配列で */}
                  {[
                    ["借入金利 Kd（%）手動入力", "kd", cc.kdAuto != null ? "空欄で自動計算値 "+((cc.kdAuto*100).toFixed(2))+"% を使用" : "支払利息を入力すると自動計算", ""],
                    ["リスクフリーレート Rf（%）", "rf", "日本国債10年利回り", "1.5"],
                    ["市場リスクプレミアム（%）", "rp", "日本株超過リターン目安", "5.5"],
                  ].map(([label, key, hint, placeholder]) => (
                    <div key={key} style={{ display:"flex", flexDirection:"column", gap:3 }}>
                      <label style={{ color:"#64748b", fontSize:R_CURRENT.sm }}>{label}</label>
                      <input
                        value={waccParams[key]}
                        onChange={e => { const v=e.target.value; if(v===""||/^-?\d*\.?\d*$/.test(v)) setWaccParams(p=>({...p,[key]:v})); }}
                        style={S.input} placeholder={placeholder} inputMode="decimal"
                      />
                      <span style={{ color:"#334155", fontSize:R_CURRENT.sm }}>{hint}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {waccResult ? (
              <div>
                {/* スコアへの反映ボタン */}
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12, padding:"8px 12px", background:"#111827", borderRadius:6 }}>
                  <span style={{ color:"#475569", fontSize:R_CURRENT.sm, flex:1 }}>
                    スプレッド: <span style={{ color: waccResult.spread > 0 ? "#4ade80" : "#f87171", fontWeight:700 }}>{pct(waccResult.spread)}</span>
                    　→ 総合スコアに反映するには保存してください
                  </span>
                  <button
                    style={{ ...S.miniBtn, color:"#4ade80", borderColor:"#4ade80" }}
                    onClick={() => updatePeriod(selected.id, "__meta__", "waccSpread", String(waccResult.spread))}
                  >
                    スコアに反映・保存
                  </button>
                </div>
                {/* WACC計算結果 */}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(min(150px,45vw),1fr))", gap:10, marginBottom:16 }}>
                  {[
                    ["株主資本コスト Ke", pct(waccResult.ke), "#60a5fa", "Rf"+((parseFloat(waccParams.rf)).toFixed(1))+"% + β"+(waccParams.beta)+"×RP"+(waccParams.rp)+"%"],
                    ["負債コスト Kd(税後)", pct(waccResult.kd*(1-waccResult.t)), "#94a3b8", waccResult.kdSource+"・税後"],
                    ["WACC", pct(waccResult.wacc), "#a78bfa", "E/V="+((waccResult.E/waccResult.V*100).toFixed(0))+"% D/V="+((waccResult.D/waccResult.V*100).toFixed(0))+"%"],
                    ["ROIC", pct(cc.roic||0), cc.roic&&cc.roic>waccResult.wacc?"#4ade80":"#f87171", cc.taxRate?"実効税率"+((cc.taxRate*100).toFixed(1))+"%":"税率30%"],
                    ["スプレッド(ROIC-WACC)", pct(waccResult.spread), waccResult.spread>0?"#4ade80":waccResult.spread>-0.01?"#fbbf24":"#f87171", waccResult.spread>0?"価値創造":"価値毀損"],
                  ].map(([label, val, color, sub]) => (
                    <div key={label} style={{ background:"#111827", borderRadius:8, padding:"10px 14px" }}>
                      <div style={{ color:"#475569", fontSize:R_CURRENT.sm, marginBottom:2 }}>{label}</div>
                      <div style={{ color, fontWeight:700, fontSize:R_CURRENT.lg }}>{val}</div>
                      <div style={{ color:"#334155", fontSize:R_CURRENT.sm, marginTop:2 }}>{sub}</div>
                    </div>
                  ))}
                </div>

                {/* 投資判断 */}
                <div style={{ background:"#111827", borderRadius:10, padding:16, marginBottom:16, border:"2px solid "+(waccResult.verdictColor)+"44" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                    <div style={{ color:"#94a3b8", fontSize:R_CURRENT.md, fontWeight:700 }}>総合投資判断</div>
                    <div style={{ color:waccResult.verdictColor, fontWeight:900, fontSize:R_CURRENT.xl }}>{waccResult.verdict}</div>
                  </div>
                  <div style={{ display:"flex", gap:6, marginBottom:12 }}>
                    {[...Array(8)].map((_, i) => (
                      <div key={i} style={{ flex:1, height:6, borderRadius:3, background: i < waccResult.score ? waccResult.verdictColor : "#1e293b" }} />
                    ))}
                  </div>
                  <div style={{ color:"#475569", fontSize:R_CURRENT.sm, marginBottom:10 }}>{waccResult.score}/8項目クリア</div>
                  <div style={{ display:"grid", gridTemplateColumns:R_CURRENT.grid2, gap:6 }}>
                    {waccResult.checks.map(({ label, ok, val, impact }) => (
                      <div key={label} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 10px", background:"#0d1424", borderRadius:6, border:"1px solid "+(ok?"#4ade8022":"#f8717122")+"" }}>
                        <span style={{ color:ok?"#4ade80":"#f87171", fontSize:R_CURRENT.lg, flexShrink:0 }}>{ok?"✓":"✗"}</span>
                        <div style={{ flex:1 }}>
                          <div style={{ color:"#94a3b8", fontSize:R_CURRENT.sm }}>{label}</div>
                          <div style={{ color:ok?"#4ade80":"#f87171", fontSize:R_CURRENT.sm, fontWeight:700 }}>{val}</div>
                        </div>
                        <span style={{ fontSize:R_CURRENT.sm, color: impact==="high"?"#f87171":impact==="mid"?"#fbbf24":"#475569" }}>
                          {impact==="high"?"重要":impact==="mid"?"中":"参考"}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop:12, padding:"10px 12px", background:"#0a0f1a", borderRadius:6, fontSize:R_CURRENT.sm, color:"#475569", lineHeight:1.8 }}>
                    ⚠️ この分析は財務データのみに基づく機械的な判断です。事業内容・成長性・経営者の質・マクロ環境等は考慮されていません。最終的な投資判断はご自身でお願いします。
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ color:"#475569", fontSize:R_CURRENT.sm, padding:"12px 0" }}>
                βを入力してください。借入金利は支払利息から自動計算、または手動入力できます。
              </div>
            )}
          </div>
        </div>
      )}

      {metricsView === "trend" && (
        <div>
          {/* 年次比較テーブル */}
          <div style={{ ...S.card, overflowX:"auto", marginBottom:16 }}>
            <div style={{ color:"#94a3b8", fontWeight:700, marginBottom:12 }}>年次財務指標比較（前期比変化率付き）</div>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:16 }}>
              <thead>
                <tr style={{ borderBottom:"1px solid #1e293b" }}>
                  <th style={{ textAlign:"left", padding:"6px 10px", color:"#475569", fontSize:16 }}>指標</th>
                  {annualData.map(({ label, key }, i) => (
                    <th key={key} style={{ textAlign:"right", padding:"6px 10px", color:"#60a5fa", fontSize:16, minWidth:100 }}>
                      {label}
                      {i > 0 && <span style={{ display:"block", color:"#334155", fontSize:16 }}>前年比</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["― 規模 ―",      null, null],
                  ["売上高",         d => n(d.f.sales),      v => fmtM(v)],
                  ["営業利益",       d => n(d.f.opProfit),   v => fmtM(v)],
                  ["経常利益",       d => n(d.f.ordProfit),  v => fmtM(v)],
                  ["当期純利益",     d => n(d.f.netProfit),  v => fmtM(v)],
                  ["EBITDA",        d => d.c.ebitda,        v => fmtM(v)],
                  ["― 収益性 ―",    null, null],
                  ["粗利率",         d => d.c.grossMargin,   v => pct(v)],
                  ["営業利益率",     d => d.c.opMargin,      v => pct(v)],
                  ["経常利益率",     d => d.c.ordMargin,     v => pct(v)],
                  ["純利益率",       d => d.c.netMargin,     v => pct(v)],
                  ["ROE",           d => d.c.roe,           v => pct(v)],
                  ["ROA",           d => d.c.roa,           v => pct(v)],
                  ["ROIC",          d => d.c.roic,          v => pct(v)],
                  ["― 安全性 ―",    null, null],
                  ["自己資本比率",   d => d.c.equityRatio,   v => pct(v)],
                  ["流動比率",       d => d.c.currentRatio,  v => pct(v)],
                  ["固定長期適合率", d => d.c.fixedLTRatio,  v => pct(v)],
                  ["― キャッシュ ―", null, null],
                  ["EV/EBITDA",     d => d.c.evEbitda,      v => v?xfmt(v):"—"],
                  ["― 株価 ―",      null, null],
                  ["PER",           d => d.c.per,           v => v?xfmt(v):"—"],
                  ["PBR",           d => d.c.pbr,           v => v?xfmt(v):"—"],
                  ["EPS",           d => d.c.eps,           v => v?"¥"+v.toFixed(1):"—"],
                  ["1株配当",        d => n(d.f.dividend),   v => v?"¥"+v:"—"],
                ].map(([label, getter, formatter]) => {
                  // セクションヘッダー行
                  if (getter === null) return (
                    <tr key={label}>
                      <td colSpan={annualData.length+1} style={{ padding:"8px 10px", color:"#475569", fontSize:16, background:"#111827", letterSpacing:1 }}>{label}</td>
                    </tr>
                  );
                  return (
                  <tr key={label} style={{ borderBottom:"1px solid #1e293b" }}>
                    <td style={{ padding:"6px 10px", color:"#64748b", fontSize:16 }}>{label}</td>
                    {annualData.map(({ key }, i) => {
                      const cur = getter(annualData[i]);
                      const prev = i > 0 ? getter(annualData[i-1]) : null;
                      const chg = calcChg(cur, prev);
                      return (
                        <td key={key} style={{ textAlign:"right", padding:"6px 10px" }}>
                          <div style={{ color:"#e2e8f0", fontWeight:600 }}>{formatter(cur)}</div>
                          {i > 0 && <div style={{ color:chgColor(chg), fontSize:16 }}>{chgStr(chg)}</div>}
                        </td>
                      );
                    })}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 売上高・営業利益・純利益グラフ */}
          <div style={S.card}>
            <div style={{ color:"#94a3b8", fontWeight:700, marginBottom:4 }}>売上高・営業利益・純利益推移</div>
            <div style={{ color:"#475569", fontSize:16, marginBottom:12 }}>凡例をクリックで表示/非表示</div>
            <ToggleLineChart
              data={annualData.map(({ label, f: fd }) => ({
                name: label,
                売上高: n(fd.sales) ? Math.round(n(fd.sales)/1e8)/10 : null,
                営業利益: n(fd.opProfit) ? Math.round(n(fd.opProfit)/1e8)/10 : null,
                純利益: n(fd.netProfit) ? Math.round(n(fd.netProfit)/1e8)/10 : null,
                EBITDA: annualData.find(d=>d.label===label)?.c?.ebitda ? Math.round(annualData.find(d=>d.label===label).c.ebitda/1e8)/10 : null,
              }))}
              lines={[
                { key:"売上高",   color:"#60a5fa" },
                { key:"営業利益", color:"#4ade80" },
                { key:"純利益",   color:"#a78bfa" },
                { key:"EBITDA",  color:"#fbbf24" },
              ]}
              yFormatter={v => v+"億"}
              tooltipFormatter={v => v+"億円"}
              height={R_CURRENT.chartMd}
              TS={TS}
            />
          </div>

          {/* 利益率トレンド */}
          <div style={S.card}>
            <div style={{ color:"#94a3b8", fontWeight:700, marginBottom:4 }}>利益率トレンド</div>
            <div style={{ color:"#475569", fontSize:16, marginBottom:12 }}>凡例をクリックで表示/非表示</div>
            <ToggleLineChart
              data={trendData}
              lines={[
                { key:"粗利率",    color:"#fbbf24" },
                { key:"営業利益率", color:"#4ade80" },
                { key:"経常利益率", color:"#60a5fa" },
                { key:"純利益率",  color:"#a78bfa" },
              ]}
              yFormatter={v => v+"%"}
              tooltipFormatter={v => v+"%"}
              height={R_CURRENT.chartMd}
              TS={TS}
            />
          </div>

          {/* ROE・ROAトレンド / EV/EBITDA */}
          <div style={{ display:"grid", gridTemplateColumns:R_CURRENT.grid2, gap:16 }}>
            <div style={S.card}>
              <div style={{ color:"#94a3b8", fontWeight:700, marginBottom:4 }}>ROE・ROAトレンド</div>
              <div style={{ color:"#475569", fontSize:16, marginBottom:8 }}>凡例をクリックで表示/非表示</div>
              <ToggleLineChart
                data={trendData}
                lines={[
                  { key:"ROE",  color:"#4ade80" },
                  { key:"ROA",  color:"#60a5fa" },
                ]}
                yFormatter={v => v+"%"}
                tooltipFormatter={v => v+"%"}
                height={R_CURRENT.chartMd}
                TS={TS}
              />
            </div>
            <div style={S.card}>
              <div style={{ color:"#94a3b8", fontWeight:700, marginBottom:4 }}>EV/EBITDAトレンド</div>
              <div style={{ color:"#475569", fontSize:16, marginBottom:8 }}>凡例をクリックで表示/非表示</div>
              <ToggleLineChart
                data={trendData}
                lines={[
                  { key:"EV_EBITDA", color:"#a78bfa", name:"EV/EBITDA" },
                ]}
                yFormatter={v => v+"x"}
                tooltipFormatter={v => v+"倍"}
                height={R_CURRENT.chartMd}
                refLines={[{ y:10, label:"10x", color:"#4ade80" }]}
                TS={TS}
              />
            </div>
          </div>

          {/* PER・PBR・PSRグラフ（実績＋予想） */}
          <div style={S.card}>
            <div style={{ color:"#94a3b8", fontWeight:700, marginBottom:4 }}>PER・PBR・PSRトレンド</div>
            <div style={{ color:"#475569", fontSize:R_CURRENT.sm, marginBottom:12 }}>
              凡例をクリックで表示/非表示。
              <span style={{ color:"#60a5fa" }}>●実績</span>：各年の本決算データ使用。
              {fc && <span style={{ color:"#fbbf24" }}> ●今期予想：今期予想入力値使用。</span>}
            </div>
            <ToggleLineChart
              data={[
                ...trendData.filter(d => d.PER != null || d.PBR != null || d.PSR != null),
                ...(fc ? [{ name:"今期予想", PER: fc.per ? parseFloat(fc.per.toFixed(2)) : null, PBR: null, PSR: fc.psr ? parseFloat(fc.psr.toFixed(2)) : null }] : []),
              ]}
              lines={[
                { key:"PER", color:"#60a5fa" },
                { key:"PBR", color:"#4ade80" },
                { key:"PSR", color:"#f59e0b" },
              ]}
              yFormatter={v => v+"x"}
              tooltipFormatter={v => v+"倍"}
              height={R_CURRENT.chartMd}
              refLines={[{ y:15, label:"15x", color:"#60a5fa44" }, { y:1, label:"1x", color:"#4ade8044" }]}
              TS={TS}
            />
            {fc && (
              <div style={{ marginTop:12, display:"flex", gap:16, flexWrap:"wrap" }}>
                {[
                  ["予想PER", fc.per ? fc.per.toFixed(2)+"x" : "—", "#60a5fa"],
                  ["予想PSR", fc.psr ? fc.psr.toFixed(2)+"x" : "—", "#f59e0b"],
                ].map(([label, val, color]) => (
                  <div key={label} style={{ background:"#111827", borderRadius:6, padding:"8px 14px", border:"1px solid "+(color)+"44" }}>
                    <div style={{ color:"#475569", fontSize:R_CURRENT.sm, marginBottom:2 }}>{label} <span style={{ color:"#fbbf24", fontSize:R_CURRENT.sm }}>(予想)</span></div>
                    <div style={{ color, fontWeight:700, fontSize:R_CURRENT.lg }}>{val}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Rule of 40グラフ */}
          <div style={S.card}>
            <div style={{ color:"#94a3b8", fontWeight:700, marginBottom:4 }}>Rule of 40 トレンド</div>
            <div style={{ color:"#475569", fontSize:R_CURRENT.sm, marginBottom:12 }}>
              売上成長率(%) + 営業利益率(%)。40以上が優良。凡例をクリックで表示/非表示。
            </div>
            <ToggleLineChart
              data={trendData}
              lines={[
                { key:"Rule40", color:"#4ade80", name:"Rule of 40" },
                { key:"売上成長率", color:"#60a5fa" },
                { key:"営業利益率", color:"#fbbf24" },
              ]}
              yFormatter={v => v+"%"}
              tooltipFormatter={v => v+"%"}
              height={R_CURRENT.chartMd}
              refLines={[{ y:20, label:"20(優良)", color:"#4ade80" }, { y:15, label:"15(良好)", color:"#34d399" }, { y:40, label:"40(米国基準)", color:"#475569" }]}
              TS={TS}
            />
          </div>
        </div>
      )}

      {metricsView === "qtr" && (
        <div>
          <div style={{ ...S.card, overflowX:"auto", marginBottom:16 }}>
            <div style={{ color:"#94a3b8", fontWeight:700, marginBottom:4 }}>四半期単体（前年同期比付き）</div>
            <div style={{ color:"#475569", fontSize:R_CURRENT.sm, marginBottom:12 }}>累計値から四半期単体値を算出。Q1=Q1累計、Q2=Q2累計−Q1累計、Q3=Q3累計−Q2累計、Q4=通期−Q3累計。</div>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:R_CURRENT.sm }}>
              <thead>
                <tr style={{ borderBottom:"1px solid #1e293b" }}>
                  <th style={{ textAlign:"left", padding:"6px 8px", color:"#475569" }}>指標</th>
                  {qtrData.map(({ label, key }) => (
                    <th key={key} style={{ textAlign:"right", padding:"6px 8px", color:"#60a5fa", minWidth:80 }}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["売上高",   d => n(d.f.sales),    v => fmtM(v)],
                  ["営業利益", d => n(d.f.opProfit),  v => fmtM(v)],
                  ["純利益",   d => n(d.f.netProfit), v => fmtM(v)],
                ].map(([label, getter, formatter]) => (
                  <tr key={label} style={{ borderBottom:"1px solid #1e293b" }}>
                    <td style={{ padding:"6px 8px", color:"#64748b" }}>{label}</td>
                    {qtrData.map(({ key }, i) => {
                      const cumVal = getter(qtrData[i]);
                      // 同年の前Qの累計値を取得（Q1は前Qなし）
                      const qIdx = ["Q1","Q2","Q3","Q4"].indexOf(key.split("-")[1]);
                      const prevQIdx = i - 1;
                      const prevQSameYear = qIdx > 0 ? getter(qtrData[prevQIdx]) : null;
                      // 四半期単体値 = 累計 - 前Q累計
                      const singleVal = prevQSameYear != null && cumVal != null ? cumVal - prevQSameYear : cumVal;
                      // 前年同期の単体値
                      const prevYrCum = i >= 4 ? getter(qtrData[i-4]) : null;
                      const prevYrPrevQCum = i >= 4 && qIdx > 0 ? getter(qtrData[i-5]) : null;
                      const prevYrSingle = prevYrCum != null ? (prevYrPrevQCum != null ? prevYrCum - prevYrPrevQCum : prevYrCum) : null;
                      const chg = calcChg(singleVal, prevYrSingle);
                      return (
                        <td key={key} style={{ textAlign:"right", padding:"6px 8px" }}>
                          <div style={{ color:"#e2e8f0" }}>{singleVal != null ? formatter(singleVal) : "—"}</div>
                          {prevYrSingle != null && <div style={{ color:chgColor(chg), fontSize:R_CURRENT.sm }}>{chgStr(chg)}</div>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 四半期推移グラフ */}
          <div style={{ ...S.card, background:"#0a1628", border:"1px solid #1e3a5f", marginBottom:16 }}>
            <div style={{ color:"#60a5fa", fontSize:R_CURRENT.sm }}>
              📌 入力値は<strong>累計値</strong>です。Q1=第1四半期累計、Q2=上半期累計、Q3=第3四半期累計、Q4=通期。
            </div>
          </div>

          {/* 四半期単体値グラフ */}
          <div style={S.card}>
            <div style={{ color:"#94a3b8", fontWeight:700, marginBottom:4 }}>四半期単体推移</div>
            <div style={{ color:"#475569", fontSize:R_CURRENT.sm, marginBottom:12 }}>累計値から四半期単体値を算出。凡例をクリックで表示/非表示</div>
            <ToggleLineChart
              data={qtrData.map(({ label, f: fd }, i) => {
                const qIdx = ["Q1","Q2","Q3","Q4"].indexOf(qtrData[i].key.split("-")[1]);
                const prevQCum = qIdx > 0 ? n(qtrData[i-1].f.sales) : null;
                const prevQOp  = qIdx > 0 ? n(qtrData[i-1].f.opProfit) : null;
                const prevQNet = qIdx > 0 ? n(qtrData[i-1].f.netProfit) : null;
                const s = n(fd.sales);
                const o = n(fd.opProfit);
                const nt = n(fd.netProfit);
                return {
                  name: label,
                  売上高: s != null ? Math.round((qIdx > 0 && prevQCum != null ? s - prevQCum : s)/1e8)/10 : null,
                  営業利益: o != null ? Math.round((qIdx > 0 && prevQOp != null ? o - prevQOp : o)/1e8)/10 : null,
                  純利益: nt != null ? Math.round((qIdx > 0 && prevQNet != null ? nt - prevQNet : nt)/1e8)/10 : null,
                };
              })}
              lines={[
                { key:"売上高",   color:"#60a5fa" },
                { key:"営業利益", color:"#4ade80" },
                { key:"純利益",   color:"#a78bfa" },
              ]}
              yFormatter={v => v+"億"}
              tooltipFormatter={v => v+"億円"}
              height={R_CURRENT.chartMd}
              TS={TS}
            />
          </div>

          {/* 累計値グラフ（棒グラフ・表示非表示切替） */}
          <div style={S.card}>
            <div style={{ color:"#94a3b8", fontWeight:700, marginBottom:4 }}>四半期累計値推移</div>
            <div style={{ color:"#475569", fontSize:R_CURRENT.sm, marginBottom:12 }}>入力した累計値そのまま。凡例をクリックで表示/非表示</div>
            <ToggleBarChart
              data={qtrData.map(({ label, f: fd }) => ({
                name: label,
                売上高: n(fd.sales) ? Math.round(n(fd.sales)/1e8)/10 : null,
                営業利益: n(fd.opProfit) ? Math.round(n(fd.opProfit)/1e8)/10 : null,
                純利益: n(fd.netProfit) ? Math.round(n(fd.netProfit)/1e8)/10 : null,
              }))}
              bars={[
                { key:"売上高",   color:"#60a5fa" },
                { key:"営業利益", color:"#4ade80" },
                { key:"純利益",   color:"#a78bfa" },
              ]}
              yFormatter={v => v+"億"}
              tooltipFormatter={v => v+"億円"}
              height={R_CURRENT.chartMd}
              TS={TS}
            />
          </div>

          {/* 前年同期比グラフ（折れ線・ToggleLineChart） */}
          <div style={S.card}>
            <div style={{ color:"#94a3b8", fontWeight:700, marginBottom:4 }}>前年同期比推移</div>
            <div style={{ color:"#475569", fontSize:R_CURRENT.sm, marginBottom:12 }}>四半期単体値ベース。凡例をクリックで表示/非表示</div>
            <ToggleLineChart
              data={qtrData.map(({ label, f: fd }, i) => {
                const qIdx = ["Q1","Q2","Q3","Q4"].indexOf(qtrData[i].key.split("-")[1]);
                const curS = n(fd.sales), curO = n(fd.opProfit), curN = n(fd.netProfit);
                const pqS = qIdx>0?n(qtrData[i-1].f.sales):null, pqO = qIdx>0?n(qtrData[i-1].f.opProfit):null, pqN = qIdx>0?n(qtrData[i-1].f.netProfit):null;
                const sS = curS!=null?(qIdx>0&&pqS!=null?curS-pqS:curS):null;
                const sO = curO!=null?(qIdx>0&&pqO!=null?curO-pqO:curO):null;
                const sN = curN!=null?(qIdx>0&&pqN!=null?curN-pqN:curN):null;
                const pi = i-4, pqi = pi>=0?["Q1","Q2","Q3","Q4"].indexOf(qtrData[pi]?.key.split("-")[1]):-1;
                const pcS=pi>=0?n(qtrData[pi].f.sales):null, pcO=pi>=0?n(qtrData[pi].f.opProfit):null, pcN=pi>=0?n(qtrData[pi].f.netProfit):null;
                const ppS=pi>0&&pqi>0?n(qtrData[pi-1].f.sales):null, ppO=pi>0&&pqi>0?n(qtrData[pi-1].f.opProfit):null, ppN=pi>0&&pqi>0?n(qtrData[pi-1].f.netProfit):null;
                const psS=pcS!=null?(pqi>0&&ppS!=null?pcS-ppS:pcS):null;
                const psO=pcO!=null?(pqi>0&&ppO!=null?pcO-ppO:pcO):null;
                const psN=pcN!=null?(pqi>0&&ppN!=null?pcN-ppN:pcN):null;
                const chg = (a,b) => a!=null&&b!=null&&b!==0?parseFloat(((a-b)/Math.abs(b)*100).toFixed(1)):null;
                return { name:label, 売上高前年比:chg(sS,psS), 営業利益前年比:chg(sO,psO), 純利益前年比:chg(sN,psN) };
              })}
              lines={[
                { key:"売上高前年比",   color:"#60a5fa" },
                { key:"営業利益前年比", color:"#4ade80" },
                { key:"純利益前年比",   color:"#a78bfa" },
              ]}
              yFormatter={v => v+"%"}
              tooltipFormatter={v => v+"%"}
              height={R_CURRENT.chartMd}
              refLines={[{ y:0, label:"0%", color:"#475569" }]}
              TS={TS}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// 数値入力タブ（多期間対応）
// 銘柄ごとのundo ボタン
function StockUndoButton({ selected, updatePeriod, S, undoTrigger }) {
  const undoKey = "kabulens_undo_stock_"+selected.id;
  const [saved, setSaved] = useState(null);

  useEffect(() => {
    try { const d = localStorage.getItem(undoKey); setSaved(d ? JSON.parse(d) : null); } catch { setSaved(null); }
  }, [selected.id, undoTrigger]);

  if (!saved) return null;
  return (
    <button
      style={{ ...S.miniBtn, color:"#fbbf24", borderColor:"#fbbf24" }}
      onClick={() => {
        if (!window.confirm(selected.name+" の決算年更新を元に戻します。よろしいですか？")) return;
        updatePeriod(selected.id, "__meta__", "latestFiscalYear", String(saved.stockBase));
        updatePeriod(selected.id, "__meta__", "__periods__", saved.periods);
        try { localStorage.removeItem(undoKey); } catch {}
        setSaved(null);
      }}
    >
      ↩ 更新を元に戻す
    </button>
  );
}

function InputTab({ selected, periods, updatePeriod, baseYear, annualKeys, qtrKeys, TS }) {
  const [inputView, setInputView] = useState("annual"); // annual | qtr
  const [activeYear, setActiveYear] = useState(String(baseYear));
  const [activeQtrYear, setActiveQtrYear] = useState(String(baseYear));
  const [undoTrigger, setUndoTrigger] = useState(0);

  const handleChange = (periodKey, fieldKey, val) => {
    if (val === "" || val === "-" || /^-?\d*\.?\d*$/.test(val)) {
      updatePeriod(selected.id, periodKey, fieldKey, val);
    }
  };

  return (
    <div>
      <div style={{ marginBottom:12, padding:10, background:"#111827", borderRadius:6, fontSize:16, color:"#475569" }}>
        参考先:{" "}
        <a href="https://finance.yahoo.co.jp" target="_blank" rel="noreferrer" style={{ color:"#60a5fa" }}>Yahoo Finance</a>
        {" / "}<a href="https://www.kabutan.jp" target="_blank" rel="noreferrer" style={{ color:"#60a5fa" }}>株探</a>
        {" / "}<a href="https://irbank.net" target="_blank" rel="noreferrer" style={{ color:"#60a5fa" }}>IRバンク</a>
        {" / "}<a href="https://www.buffett-code.com" target="_blank" rel="noreferrer" style={{ color:"#60a5fa" }}>バフェットコード</a>
      </div>

      {/* 銘柄設定 */}
      <div style={{ ...S.card, border:"1px solid #334155", marginBottom:16 }}>
        <div style={{ color:"#94a3b8", fontWeight:700, marginBottom:12 }}>銘柄設定</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(min(200px,45vw),1fr))", gap:14 }}>
          <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
            <label style={{ color:"#64748b", fontSize:R_CURRENT.sm }}>決算月</label>
            <select
              value={selected.fiscalMonth || "3"}
              onChange={e => updatePeriod(selected.id, "__meta__", "fiscalMonth", e.target.value)}
              style={S.sel}
            >
              {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                <option key={m} value={String(m)}>{m}月期</option>
              ))}
            </select>
            <span style={{ color:"#334155", fontSize:R_CURRENT.sm }}>例: 3月期→3、11月期→11</span>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
            <label style={{ color:"#64748b", fontSize:R_CURRENT.sm }}>最新本決算年（直近期）</label>
            <input
              value={selected.latestFiscalYear || ""}
              onChange={e => updatePeriod(selected.id, "__meta__", "latestFiscalYear", e.target.value)}
              style={S.input}
              placeholder={"例: "+baseYear}
              inputMode="numeric"
            />
            <span style={{ color:"#334155", fontSize:R_CURRENT.sm }}>この年を基準に±2年が表示されます</span>
          </div>
        </div>
        <div style={{ marginTop:10, fontSize:R_CURRENT.sm, color:"#475569", marginBottom:12 }}>
          現在の表示範囲: {annualKeys[0]}年 〜 {annualKeys[annualKeys.length-1]}年（財務指標は{annualKeys[annualKeys.length-2]}年を使用）
        </div>
        {/* 銘柄ごとの年次更新ボタン */}
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
          <button
            style={{ ...S.miniBtn, color:"#a78bfa", borderColor:"#a78bfa" }}
            onClick={() => {
              const stockBase = getStockBaseYear(selected, baseYear);
              const next = stockBase + 1;
              const oldestYr = String(stockBase - 2);
              if (!window.confirm(selected.name+" の決算年を "+stockBase+"→"+next+"年 に進めます。\n\n"+oldestYr+"年のデータは削除されます。\nよろしいですか？")) return;
              // undo用に保存
              const undoKey = "kabulens_undo_stock_"+selected.id;
              try { localStorage.setItem(undoKey, JSON.stringify({ stockBase, periods: selected.periods || {} })); } catch {}
              // 最古年削除
              const oldPeriods = selected.periods || {};
              const newPeriods = {};
              Object.keys(oldPeriods).forEach(key => {
                if (key === oldestYr) return;
                if (key.includes("-Q") && key.startsWith(oldestYr)) return;
                newPeriods[key] = oldPeriods[key];
              });
              if (oldPeriods[FORECAST_KEY]) newPeriods[FORECAST_KEY] = oldPeriods[FORECAST_KEY];
              updatePeriod(selected.id, "__meta__", "latestFiscalYear", String(next));
              updatePeriod(selected.id, "__meta__", "__periods__", newPeriods);
              setUndoTrigger(t => t + 1);
            }}
          >
            📅 {getStockBaseYear(selected, baseYear)}→{getStockBaseYear(selected, baseYear)+1}年 更新
          </button>
          <StockUndoButton selected={selected} updatePeriod={updatePeriod} S={S} undoTrigger={undoTrigger} />
        </div>
      </div>

      <div style={{ display:"flex", gap:4, marginBottom:16 }}>
        <button style={{ ...S.navBtn, ...(inputView==="annual"?S.navOn:{}) }} onClick={() => setInputView("annual")}>本決算（年次）</button>
        <button style={{ ...S.navBtn, ...(inputView==="qtr"?S.navOn:{}) }} onClick={() => setInputView("qtr")}>四半期決算</button>
      </div>

      {inputView === "annual" && (
        <div>
          <div style={{ display:"flex", gap:8, marginBottom:16 }}>
            {annualKeys.map(yr => (
              <button key={yr} style={{ ...S.navBtn, ...(activeYear===yr?S.navOn:{}) }} onClick={() => setActiveYear(yr)}>{yr}年</button>
            ))}
          </div>
          <div style={{ ...S.card, border:"1px solid #334155" }}>
            <div style={{ color:"#60a5fa", fontWeight:700, marginBottom:16 }}>{activeYear}年 本決算データ</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(min(200px,45vw),1fr))", gap:14 }}>
              {PERIOD_FIELDS.map(({ label, key, hint }) => (
                <div key={key} style={{ display:"flex", flexDirection:"column", gap:3 }}>
                  <label style={{ color:"#64748b", fontSize:16 }}>{label}</label>
                  <input
                    value={periods[activeYear]?.[key] || ""}
                    onChange={e => handleChange(activeYear, key, e.target.value)}
                    style={S.input}
                    placeholder="数値を入力"
                    inputMode="decimal"
                  />
                  {hint && <span style={{ color:"#334155", fontSize:16 }}>{hint}</span>}
                </div>
              ))}
            </div>
          </div>

          {/* 今期予想セクション：翌年度選択時のみ表示 */}
          {activeYear === String(baseYear+1) && (
            <div style={{ ...S.card, border:"1px solid #fbbf2444" }}>
              <div style={{ color:"#fbbf24", fontWeight:700, marginBottom:8 }}>今期予想データ</div>
              <div style={{ color:"#475569", fontSize:16, marginBottom:14 }}>
                株価・株式数・純資産は最新本決算を自動継承。予想PER・PSR・配当利回り・営業利益率の計算に使用されます。
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(min(200px,45vw),1fr))", gap:14 }}>
                {FORECAST_FIELDS.map(({ label, key, hint }) => (
                  <div key={key} style={{ display:"flex", flexDirection:"column", gap:3 }}>
                    <label style={{ color:"#64748b", fontSize:16 }}>{label}</label>
                    <input
                      value={periods[FORECAST_KEY]?.[key] || ""}
                      onChange={e => handleChange(FORECAST_KEY, key, e.target.value)}
                      style={S.input} placeholder="数値を入力" inputMode="decimal"
                    />
                    {hint && <span style={{ color:"#334155", fontSize:16 }}>{hint}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4年並べて比較表示 */}
          <div style={{ ...S.card, overflowX:"auto" }}>
            <div style={{ color:"#94a3b8", fontWeight:700, marginBottom:12 }}>4年分 入力済みデータ確認</div>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:16 }}>
              <thead>
                <tr style={{ borderBottom:"1px solid #1e293b" }}>
                  <th style={{ textAlign:"left", padding:"6px 10px", color:"#475569" }}>項目</th>
                  {annualKeys.map(yr => <th key={yr} style={{ textAlign:"right", padding:"6px 10px", color:"#60a5fa" }}>{yr}年</th>)}
                </tr>
              </thead>
              <tbody>
                {PERIOD_FIELDS.slice(2, 9).map(({ label, key }) => (
                  <tr key={key} style={{ borderBottom:"1px solid #1e293b" }}>
                    <td style={{ padding:"6px 10px", color:"#64748b" }}>{label}</td>
                    {annualKeys.map(yr => (
                      <td key={yr} style={{ textAlign:"right", padding:"6px 10px", color:"#e2e8f0" }}>
                        {periods[yr]?.[key] ? fmtM(n(periods[yr][key])) : "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {inputView === "qtr" && (
        <div>
          <div style={{ ...S.card, marginBottom:12, background:"#0a1628", border:"1px solid #1e3a5f" }}>
            <div style={{ color:"#60a5fa", fontSize:R_CURRENT.sm, lineHeight:1.8 }}>
              📌 <strong>累計値で入力してください。</strong>例: Q1は第1四半期累計、Q2は第2四半期累計（上半期）、Q3は第3四半期累計、Q4は通期（本決算と同じ）。
            </div>
          </div>
          <div style={{ display:"flex", gap:8, marginBottom:16 }}>
            {annualKeys.map(yr => (
              <button key={yr} style={{ ...S.navBtn, ...(activeQtrYear===yr?S.navOn:{}) }} onClick={() => setActiveQtrYear(yr)}>{yr}年</button>
            ))}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:R_CURRENT.grid2, gap:16 }}>
            {["Q1","Q2","Q3","Q4"].map(q => {
              const key = activeQtrYear+"-"+q;
              const qLabel = { Q1:"第1四半期累計", Q2:"第2四半期累計（上半期）", Q3:"第3四半期累計", Q4:"通期（本決算同）" }[q];
              return (
                <div key={key} style={{ ...S.card, border:"1px solid #334155" }}>
                  <div style={{ color:"#fbbf24", fontWeight:700, marginBottom:4 }}>{activeQtrYear}年 {q}</div>
                  <div style={{ color:"#475569", fontSize:R_CURRENT.sm, marginBottom:12 }}>{qLabel}</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr", gap:10 }}>
                    {PERIOD_FIELDS.filter(f2 => ["price","shares","sales","opProfit","netProfit","totalAssets","equity"].includes(f2.key)).map(({ label, key: fk }) => (
                      <div key={fk} style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <label style={{ color:"#64748b", fontSize:R_CURRENT.sm, minWidth:120, flexShrink:0 }}>{label}</label>
                        <input
                          value={periods[key]?.[fk] || ""}
                          onChange={e => handleChange(key, fk, e.target.value)}
                          style={{ ...S.input, fontSize:R_CURRENT.md }}
                          placeholder="数値"
                          inputMode="decimal"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function WatchDetail({ watchSelected, watchlist, baseYear, annualKeys, qtrKeys, detailTab, setDetailTab, updateWatchPeriod, sc, R, TS, S }) {
  const wf = watchSelected.financials || {};
  const wc = calcAll(wf);
  const wh = watchlist.find(h => h.id === watchSelected.id) || watchSelected;
  return (
    <>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12, flexWrap:"wrap", gap:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
          <span style={{ fontSize:20, fontWeight:800, color:"#f1f5f9" }}>{watchSelected.name}</span>
          <Tag color="#f59e0b">{watchSelected.ticker}</Tag>
          <Tag color="#a78bfa">{watchSelected.sector}</Tag>
          <span style={{ background:"#1a1200", color:"#f59e0b", border:"1px solid #f59e0b44", borderRadius:6, padding:"4px 10px", fontSize:R.sm }}>👀 保有候補</span>
          {sc != null && <ScoreBadge sc={sc} stockId={selected?.id} large={true} />}
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:24, fontWeight:900, color:"#f1f5f9" }}>¥{watchSelected.currentPrice.toLocaleString()}</div>
        </div>
      </div>
      <div style={{ display:"flex", gap:4, marginBottom:20, borderBottom:"1px solid #1e293b", paddingBottom:8, flexWrap:"wrap" }}>
        {[["metrics","財務指標"],["memo","投資メモ"],["input","数値入力"],["ir","IRニュース"]].map(([k,v]) => (
          <button key={k} style={{ ...S.navBtn, ...(detailTab===k?S.navOn:{}) }} onClick={() => setDetailTab(k)}>{v}</button>
        ))}
      </div>
      {detailTab === "metrics" && (
        <MetricsTab c={wc} f={wf} selected={wh} periods={wh.periods||{}} baseYear={baseYear} annualKeys={annualKeys} qtrKeys={qtrKeys} R={R} TS={TS} />
      )}
      {detailTab === "input" && (
        <InputTab selected={wh} periods={wh.periods||{}} updatePeriod={(periodKey, fieldKey, val) => updateWatchPeriod(watchSelected.id, periodKey, fieldKey, val)} baseYear={baseYear} annualKeys={annualKeys} qtrKeys={qtrKeys} TS={TS} />
      )}
      {detailTab === "memo" && (
        <div style={S.card}><div style={{ color:"#475569" }}>投資メモは保有銘柄のみ対応しています。</div></div>
      )}
      {detailTab === "ir" && (
        <div style={S.card}><div style={{ color:"#475569" }}>IRニュースは保有銘柄のみ対応しています。</div></div>
      )}
    </>
  );
}

export default function App() {
  const [zoom, setZoom] = useState(100);

  const R = useResponsive();
  S = makeS(R);
  R_CURRENT = R;
  const [tab, setTab]             = useState("portfolio");
  const [portfolio, setPortfolio] = useState(() => loadData() || INIT);
  const [selected, setSelected]   = useState(() => (loadData() || INIT)[0]);
  const [detailTab, setDetailTab] = useState("metrics");
  const [compareIds, setCompareIds] = useState([]);
  const [baseYear, setBaseYear]   = useState(() => loadBaseYear());
  const [undoData, setUndoData]   = useState(() => loadUndoData());
  const [watchlist, setWatchlist] = useState(() => loadWatch());
  const [watchSelected, setWatchSelected] = useState(null);
  const [portfolioMode, setPortfolioMode] = useState("portfolio"); // "portfolio" | "watchlist"
  const ANNUAL_KEYS = getAnnualKeys(baseYear);
  const QTR_KEYS = getQtrKeys(baseYear);
  const [simParams, setSimParams] = useState({ years:"5", growthRate:"15", targetMargin:"15", targetPer:"20", targetEvEbitda:"", dividendRate:"2", reinvest:true });
  const [simTab, setSimTab]       = useState("scenario");
  const [irForm, setIrForm]       = useState({ date:"", title:"", url:"", type:"決算" });
  const [showIrForm, setShowIrForm] = useState(false);
  const [addForm, setAddForm]     = useState({ ticker:"", name:"", sector:"", qty:"", avgCost:"", currentPrice:"" });
  const [showAdd, setShowAdd]     = useState(false);
  const [showPriceUpdate, setShowPriceUpdate] = useState(false);
  const [priceInputs, setPriceInputs] = useState({});
  const [shinInputs, setShinInputs] = useState({});
  const [qtyInputs, setQtyInputs] = useState({});
  const [costInputs, setCostInputs] = useState({});

  const save = useCallback(updater => {
    setPortfolio(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveData(next);
      return next;
    });
  }, []);

  const tc = portfolio.reduce((s, h) => s + h.qty * h.avgCost, 0);
  const tv = portfolio.reduce((s, h) => s + h.qty * h.currentPrice, 0);
  const tPnL = tv - tc;
  const tPnLPct = tc > 0 ? (tPnL / tc) * 100 : 0;

  const updateF = useCallback((id, key, val) => {
    save(p => p.map(h => h.id === id ? { ...h, financials:{ ...h.financials, [key]:val } } : h));
    if (selected?.id === id) setSelected(s => ({ ...s, financials:{ ...s.financials, [key]:val } }));
  }, [selected, save]);

  const updateMemo = useCallback((id, key, val) => {
    save(p => p.map(h => h.id === id ? { ...h, memo:{ ...(h.memo||EMPTY_MEMO), [key]:val } } : h));
    if (selected?.id === id) setSelected(s => ({ ...s, memo:{ ...(s.memo||EMPTY_MEMO), [key]:val } }));
  }, [selected, save]);

  // 多期間データ更新
  const updatePeriod = useCallback((id, periodKey, fieldKey, val) => {
    save(p => p.map(h => {
      if (h.id !== id) return h;
      if (periodKey === "__meta__") {
        if (fieldKey === "__periods__") return { ...h, periods: val }; // periodsをまるごと更新
        return { ...h, [fieldKey]: val };
      }
      const periods = { ...(h.periods || {}) };
      periods[periodKey] = { ...(periods[periodKey] || {}), [fieldKey]: val };
      return { ...h, periods };
    }));
    if (selected?.id === id) {
      setSelected(s => {
        if (periodKey === "__meta__") {
          if (fieldKey === "__periods__") return { ...s, periods: val };
          return { ...s, [fieldKey]: val };
        }
        const periods = { ...(s.periods || {}) };
        periods[periodKey] = { ...(periods[periodKey] || {}), [fieldKey]: val };
        return { ...s, periods };
      });
    }
  }, [selected, save]);

  const addStock = () => {
    const { ticker, name, sector, qty, avgCost, currentPrice } = addForm;
    if (!ticker||!name||!currentPrice) return;
    const base = { id:Date.now(), ticker, name, sector:sector||"—", currentPrice:+currentPrice, financials:{ ...EMPTY_F, price:currentPrice }, memo:{ ...EMPTY_MEMO }, irList:[], periods:{} };
    if (portfolioMode === "watchlist") {
      // 候補リストに追加（qty/avgCostは不要）
      saveWatch2(p => [...p, { ...base, qty:0, avgCost:0, isWatch:true }]);
    } else {
      if (!qty||!avgCost) return;
      save(p => [...p, { ...base, qty:+qty, avgCost:+avgCost }]);
    }
    setAddForm({ ticker:"", name:"", sector:"", qty:"", avgCost:"", currentPrice:"" });
    setShowAdd(false);
  };

  const deleteStock = useCallback(id => {
    if (!window.confirm("この銘柄を削除しますか？")) return;
    save(p => p.filter(h => h.id !== id));
    setCompareIds(p => p.filter(x => x !== id));
    if (selected?.id === id) {
      const rem = portfolio.filter(h => h.id !== id);
      setSelected(rem.length > 0 ? rem[0] : null);
    }
  }, [selected, portfolio, save]);

  const applyPrices = () => {
    save(p => p.map(h => {
      const np = priceInputs[h.id];
      const ns = shinInputs[h.id];
      const nq = qtyInputs[h.id];
      const nc = costInputs[h.id];
      let updated = { ...h };
      if (np && !isNaN(+np)) updated = { ...updated, currentPrice:+np, financials:{ ...updated.financials, price:np } };
      if (ns !== undefined && ns !== "") updated = { ...updated, financials:{ ...updated.financials, shinyoBairitu:ns } };
      if (nq && !isNaN(+nq) && +nq > 0) updated = { ...updated, qty:+nq };
      if (nc && !isNaN(+nc) && +nc > 0) updated = { ...updated, avgCost:+nc };
      return updated;
    }));
    if (selected) {
      const np = priceInputs[selected.id];
      const ns = shinInputs[selected.id];
      const nq = qtyInputs[selected.id];
      const nc = costInputs[selected.id];
      let upd = { ...selected };
      if (np && !isNaN(+np)) upd = { ...upd, currentPrice:+np, financials:{ ...upd.financials, price:np } };
      if (ns !== undefined && ns !== "") upd = { ...upd, financials:{ ...upd.financials, shinyoBairitu:ns } };
      if (nq && !isNaN(+nq) && +nq > 0) upd = { ...upd, qty:+nq };
      if (nc && !isNaN(+nc) && +nc > 0) upd = { ...upd, avgCost:+nc };
      setSelected(upd);
    }
    setPriceInputs({});
    setShinInputs({});
    setQtyInputs({});
    setCostInputs({});
    setShowPriceUpdate(false);
  };

  const saveWatch2 = useCallback(updater => {
    setWatchlist(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveWatch(next);
      return next;
    });
  }, []);

  const addToWatch = (h) => {
    // ポートフォリオから候補リストへコピー（qty/avgCostは0に）
    const wh = { ...h, id: Date.now(), qty: 0, avgCost: 0, isWatch: true };
    saveWatch2(p => [...p, wh]);
  };

  const [moveForm, setMoveForm] = useState({ qty:"", avgCost:"", id:null });

  const moveToPortfolio = (wh) => {
    setMoveForm({ qty:"100", avgCost:String(wh.currentPrice), id:wh.id });
  };

  const applyMove = () => {
    const wh = watchlist.find(h => h.id === moveForm.id);
    if (!wh) return;
    const qty = parseFloat(moveForm.qty);
    const avgCost = parseFloat(moveForm.avgCost);
    if (!qty || !avgCost) return;
    // idはそのまま引き継ぐ（データが全て保持される）
    const ph = { ...wh, qty, avgCost, isWatch:false };
    save(p => [...p, ph]);
    saveWatch2(p => p.filter(w => w.id !== wh.id));
    setSelected(ph);
    setWatchSelected(null);
    setPortfolioMode("portfolio");
    setMoveForm({ qty:"", avgCost:"", id:null });
  };

  const deleteWatch = useCallback(id => {
    if (!window.confirm("この候補銘柄を削除しますか？")) return;
    saveWatch2(p => p.filter(h => h.id !== id));
    if (watchSelected?.id === id) setWatchSelected(watchlist.find(w => w.id !== id) || null);
  }, [watchSelected, watchlist, saveWatch2]);

  const updateWatchPeriod = useCallback((id, periodKey, fieldKey, val) => {
    saveWatch2(p => p.map(h => {
      if (h.id !== id) return h;
      const periods = { ...(h.periods || {}) };
      periods[periodKey] = { ...(periods[periodKey] || {}), [fieldKey]: val };
      return { ...h, periods };
    }));
    if (watchSelected?.id === id) {
      setWatchSelected(s => {
        const periods = { ...(s.periods || {}) };
        periods[periodKey] = { ...(periods[periodKey] || {}), [fieldKey]: val };
        return { ...s, periods };
      });
    }
  }, [watchSelected, saveWatch2]);

  const addIR = () => {
    if (!irForm.title||!irForm.date) return;
    save(p => p.map(h => h.id === selected.id ? { ...h, irList:[irForm, ...(h.irList||[])] } : h));
    setSelected(s => ({ ...s, irList:[irForm, ...(s.irList||[])] }));
    setIrForm({ date:"", title:"", url:"", type:"決算" });
    setShowIrForm(false);
  };

  const deleteIR = idx => {
    save(p => p.map(h => h.id === selected.id ? { ...h, irList:h.irList.filter((_, i) => i !== idx) } : h));
    setSelected(s => ({ ...s, irList:s.irList.filter((_, i) => i !== idx) }));
  };

  const handleAdvanceYear = useCallback(() => {
    const nextBase = baseYear + 1;
    const msg = "決算年度を1年進めます。\n\n全銘柄のデフォルト基準年: "+baseYear+"→"+nextBase+"年\n\n・各銘柄に「最新本決算年」が設定されている場合はその銘柄固有の値が更新されます\n・"+String(baseYear-2)+"年のデータは削除されます\n\nよろしいですか？";
    if (!window.confirm(msg)) return;

    const undo = { baseYear, portfolio: JSON.parse(JSON.stringify(portfolio)) };
    setUndoData(undo);
    saveUndoData(undo);

    save(p => p.map(h => {
      const oldPeriods = h.periods || {};
      const newPeriods = {};
      const stockBase = getStockBaseYear(h, baseYear);
      const oldestYr = String(stockBase - 2);

      Object.keys(oldPeriods).forEach(key => {
        if (key === oldestYr) return;
        if (key.includes("-Q") && key.startsWith(oldestYr)) return;
        newPeriods[key] = oldPeriods[key];
      });
      if (oldPeriods[FORECAST_KEY]) newPeriods[FORECAST_KEY] = oldPeriods[FORECAST_KEY];

      // latestFiscalYearを1年進める
      const newLatest = stockBase + 1;
      return { ...h, periods: newPeriods, latestFiscalYear: String(newLatest) };
    }));

    setBaseYear(nextBase);
    saveBaseYear(nextBase);
  }, [baseYear, portfolio, save]);

  const handleUndoYear = useCallback(() => {
    if (!undoData) return;
    const msg = "決算年度の更新を元に戻します。\n\n" + (undoData.baseYear+1) + "->" + undoData.baseYear + "年 に戻りますがよろしいですか？";
    if (!window.confirm(msg)) return;
    // portfolioを復元
    setPortfolio(undoData.portfolio);
    saveData(undoData.portfolio);
    // selectedも復元（同じidの銘柄を探す）
    if (selected) {
      const restoredSelected = undoData.portfolio.find(h => h.id === selected.id);
      if (restoredSelected) setSelected(restoredSelected);
    }
    setBaseYear(undoData.baseYear);
    saveBaseYear(undoData.baseYear);
    setUndoData(null);
    clearUndoData();
  }, [undoData, selected]);

  const toggleCompare = id => setCompareIds(p => p.includes(id) ? p.filter(x => x !== id) : p.length < 4 ? [...p, id] : p);

  const simRows = useCallback(() => {
    if (!selected) return [];
    const f = selected.financials;
    const price = n(f.price)||selected.currentPrice;
    const sales = n(f.sales)||0, sh = n(f.shares)||1;
    const eb = n(f.ebitda)||0, curNet = n(f.netProfit)||0, curOp = n(f.opProfit)||0;
    const g = +simParams.growthRate/100, tm = +simParams.targetMargin/100;
    const cm = sales > 0 && curOp ? curOp/sales : tm*0.5;
    const tPer = +simParams.targetPer, tEv = simParams.targetEvEbitda ? +simParams.targetEvEbitda : null;
    const dr = +simParams.dividendRate/100, yr = +simParams.years||5;
    return Array.from({ length:yr+1 }, (_, y) => {
      const gf = Math.pow(1+g, y), mp = yr > 0 ? y/yr : 1;
      const pm = cm+(tm-cm)*mp, ps = sales*gf, po = ps*pm;
      const nr = curOp > 0 ? curNet/curOp : 0.7, pn = po*nr;
      const pe = sh > 0 ? pn/(sh*1000) : 0, peb = eb*gf;
      const base = pe > 0 ? Math.round(pe*tPer) : null;
      const bear = pe > 0 ? Math.round(pe*Math.pow(1+g*0.4,y)*tPer*0.8) : null;
      const bull = pe > 0 ? Math.round(pe*Math.pow(1+g*1.6,y)*tPer*1.2) : null;
      const evp = tEv != null && sh > 0 ? Math.round((peb*tEv)/(sh*1000)) : null;
      const dc = simParams.reinvest ? Math.round(price*(Math.pow(1+dr,y)-1)) : Math.round(price*dr*y);
      return { year:y===0?"現在":y+"年後", base, bear, bull, evp, dc, ps:Math.round(ps), po:Math.round(po), pe:parseFloat(pe.toFixed(2)) };
    });
  }, [selected, simParams]);

  const f  = selected?.financials || {};
  const c  = selected ? calcAll(f) : {};
  // 総合スコアは最新本決算データで計算
  const sc = useMemo(() => {
    if (!selected) return null;
    const h = portfolio.find(h=>h.id===selected.id)||selected;
    return scoreFromPeriods(h, baseYear);
  }, [selected, portfolio, baseYear]);
  const cmpStocks = portfolio.filter(h => compareIds.includes(h.id));
  const radarData = useMemo(() => {
    const norm = (v, lo, hi, inv=false) => {
      if (v==null||isNaN(v)) return 0;
      const s = (Math.min(Math.max(v,lo),hi)-lo)/(hi-lo)*100;
      return inv ? 100-s : s;
    };
    return [
      { m:"割安(PER)",   ...Object.fromEntries(cmpStocks.map(h => [h.ticker, norm(calcAll(h.financials).per,5,40,true)])) },
      { m:"収益性(ROE)", ...Object.fromEntries(cmpStocks.map(h => [h.ticker, norm((calcAll(h.financials).roe||0)*100,0,30)])) },
      { m:"効率性(ROA)", ...Object.fromEntries(cmpStocks.map(h => [h.ticker, norm((calcAll(h.financials).roa||0)*100,0,15)])) },
      { m:"利益率(営業)", ...Object.fromEntries(cmpStocks.map(h => [h.ticker, norm((calcAll(h.financials).opMargin||0)*100,0,30)])) },
      { m:"安全性",      ...Object.fromEntries(cmpStocks.map(h => [h.ticker, norm((calcAll(h.financials).equityRatio||0)*100,0,80)])) },
      { m:"流動性",      ...Object.fromEntries(cmpStocks.map(h => [h.ticker, norm((calcAll(h.financials).currentRatio||0)*100,0,300)])) },
      { m:"配当",        ...Object.fromEntries(cmpStocks.map(h => [h.ticker, norm((calcAll(h.financials).dividendYield||0)*100,0,6)])) },
    ];
  }, [cmpStocks]);

  const summary = useMemo(() => {
    if (!portfolio.length) return null;
    const sm = {};
    portfolio.forEach(h => { sm[h.sector] = (sm[h.sector]||0) + h.qty*h.currentPrice; });
    const sectorData = Object.entries(sm).map(([name, value]) => ({ name, value:Math.round(value) })).sort((a,b) => b.value-a.value);
    const pers = portfolio.map(h => calcAll(h.financials).per).filter(v => v && v > 0 && v < 200);
    const avgPer = pers.length > 0 ? (pers.reduce((a,b) => a+b, 0)/pers.length).toFixed(1) : null;
    const sortedPnl = [...portfolio].sort((a,b) => ((b.currentPrice-b.avgCost)/b.avgCost)-((a.currentPrice-a.avgCost)/a.avgCost));
    return { sectorData, avgPer, sortedPnl, afterTax: tPnL > 0 ? tPnL*(1-TAX) : tPnL };
  }, [portfolio, tPnL]);

  const safetyMargin = useMemo(() => {
    if (!selected||!c.eps||c.eps<=0) return null;
    const price = n(f.price)||selected.currentPrice;
    const fair = c.eps * +simParams.targetPer;
    return { fair:Math.round(fair), price, margin:(fair-price)/price*100 };
  }, [selected, f, c, simParams.targetPer]);

  const monteData = useMemo(() => {
    if (!selected||!c.eps||c.eps<=0) return null;
    const price = n(f.price)||selected.currentPrice;
    const g = +simParams.growthRate/100, tPer = +simParams.targetPer, yr = +simParams.years||5;
    const finals = [];
    for (let t = 0; t < 1000; t++) {
      let e = c.eps;
      for (let y = 0; y < yr; y++) {
        const u1 = Math.random(), u2 = Math.random();
        e *= (1 + g + Math.sqrt(-2*Math.log(u1))*Math.cos(2*Math.PI*u2)*g*0.5);
      }
      finals.push(e > 0 ? Math.round(e*(tPer+(Math.random()-0.5)*tPer*0.3)) : 0);
    }
    finals.sort((a,b) => a-b);
    const p = pct2 => finals[Math.floor(1000*pct2)];
    const rng = finals[999]-finals[0]||1;
    const bins = Array.from({ length:20 }, (_, i) => {
      const lo = finals[0]+i*rng/20, hi = lo+rng/20;
      return { range:Math.round((lo+hi)/2).toLocaleString(), count:finals.filter(v => v>=lo&&v<hi).length };
    });
    return { bins, p10:p(0.10), p25:p(0.25), p50:p(0.50), p75:p(0.75), p90:p(0.90), mean:Math.round(finals.reduce((a,b)=>a+b,0)/1000), probUp:finals.filter(v=>v>price).length/10, price };
  }, [selected, f, c, simParams]);

  const pnlSummary = useMemo(() => {
    if (!selected) return [];
    const pnl = (selected.currentPrice-selected.avgCost)*selected.qty;
    const at  = pnl > 0 ? pnl*(1-TAX) : pnl;
    const pt  = (selected.currentPrice-selected.avgCost)/selected.avgCost*100;
    return [
      ["保有数量",          selected.qty.toLocaleString()+"株",                               "#94a3b8"],
      ["平均取得単価",      "¥"+selected.avgCost.toLocaleString(),                            "#94a3b8"],
      ["現在株価",          "¥"+selected.currentPrice.toLocaleString(),                       "#e2e8f0"],
      ["投資元本",          "¥"+(selected.qty*selected.avgCost).toLocaleString(),             "#94a3b8"],
      ["評価額",            "¥"+(selected.qty*selected.currentPrice).toLocaleString(),        "#e2e8f0"],
      ["含み損益（税引前）",(pnl>=0?"▲":"▼")+"¥"+Math.abs(Math.round(pnl)).toLocaleString(), pnl>=0?"#4ade80":"#f87171"],
      ["含み損益（税引後）",(at>=0?"▲":"▼")+"¥"+Math.abs(Math.round(at)).toLocaleString(),   at>=0?"#4ade80":"#f87171"],
      ["損益率",            pt.toFixed(2)+"%",                                                pt>=0?"#4ade80":"#f87171"],
    ];
  }, [selected]);

  return (
    <div style={{ ...S.root, transformOrigin:"top left", transform:"scale(" + String(zoom/100) + ")", width:String(Math.round(10000/zoom)) + "%" }}>
      <header style={S.header}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:22 }}>📈</span>
          <span style={{ fontSize:22, fontWeight:900, color:"#f1f5f9", letterSpacing:2 }}>KABU<span style={{ color:"#4ade80" }}>LENS</span></span>
          <span style={{ fontSize:16, color:"#334155" }}>日本株専用</span>
        </div>
        <nav style={{ display:"flex", gap:4, flexWrap:"wrap", alignItems:"center" }}>
          {[["portfolio","ポートフォリオ"],["detail","銘柄詳細"],["compare","他社比較"],["simulation","シミュレーション"]].map(([k,v]) => (
            <button key={k} style={{ ...S.navBtn, ...(tab===k?S.navOn:{}) }} onClick={() => setTab(k)}>{v}</button>
          ))}
          <div style={{ display:"flex", alignItems:"center", gap:4, background:"#111827", border:"1px solid #334155", borderRadius:6, padding:"2px 6px" }}>
            <button style={{ background:"none", border:"none", color:"#94a3b8", cursor:"pointer", fontSize:16, padding:"0 4px", fontFamily:"inherit" }} onClick={() => setZoom(z => Math.max(50, z-10))}>−</button>
            <span style={{ color:"#64748b", fontSize:12, minWidth:36, textAlign:"center" }}>{zoom}%</span>
            <button style={{ background:"none", border:"none", color:"#94a3b8", cursor:"pointer", fontSize:16, padding:"0 4px", fontFamily:"inherit" }} onClick={() => setZoom(z => Math.min(200, z+10))}>＋</button>
            <button style={{ background:"none", border:"none", color:"#475569", cursor:"pointer", fontSize:11, padding:"0 4px", fontFamily:"inherit" }} onClick={() => setZoom(100)}>reset</button>
          </div>
        </nav>
      </header>

      <div style={{ display:"flex", background:"#0d1424", borderBottom:"1px solid #1e293b", flexWrap:"wrap" }}>
        <div style={{ ...S.sbItem, minWidth:R.isMobile?"50%":"120px" }}>
          <div style={S.sbLabel}>評価額合計</div>
          <div style={S.sbVal}>¥{Math.round(tv).toLocaleString()}</div>
        </div>
        <div style={{ ...S.sbItem, minWidth:R.isMobile?"50%":"120px" }}>
          <div style={S.sbLabel}>損益</div>
          <div style={S.sbVal}><Delta val={tPnL} fmt={v => "¥"+Math.round(v).toLocaleString()} /></div>
        </div>
        <div style={{ ...S.sbItem, minWidth:R.isMobile?"50%":"120px" }}>
          <div style={S.sbLabel}>損益率</div>
          <div style={S.sbVal}><Delta val={tPnLPct} fmt={v => v.toFixed(2)+"%"} /></div>
        </div>
        <div style={{ ...S.sbItem, minWidth:R.isMobile?"50%":"120px" }}>
          <div style={S.sbLabel}>保有銘柄数</div>
          <div style={S.sbVal}>{portfolio.length}銘柄</div>
        </div>
      </div>

      <main style={{ padding:R.scale==="sm"?"16px 16px":"40px 60px", maxWidth:1300, margin:"0 auto" }}>

        {tab === "portfolio" && (
          <div>
            {/* 保有/候補切り替え */}
            <div style={{ display:"flex", gap:8, marginBottom:16 }}>
              <button style={{ ...S.navBtn, ...(portfolioMode==="portfolio"?S.navOn:{}) }} onClick={() => setPortfolioMode("portfolio")}>
                📈 保有銘柄（{portfolio.length}）
              </button>
              <button style={{ ...S.navBtn, ...(portfolioMode==="watchlist"?{ ...S.navOn, borderColor:"#f59e0b", color:"#f59e0b", background:"#1a1200" }:{}) }} onClick={() => setPortfolioMode("watchlist")}>
                👀 保有候補（{watchlist.length}）
              </button>
            </div>

            {portfolioMode === "watchlist" && (
              <div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:8 }}>
                  <h2 style={{ ...S.h2, color:"#f59e0b" }}>保有候補リスト</h2>
                  <button style={{ ...S.addBtn, borderColor:"#f59e0b", color:"#f59e0b", background:"#1a1200" }} onClick={() => setShowAdd(v => !v)}>+ 候補追加</button>
                </div>
                <div style={{ color:"#475569", fontSize:R.sm, marginBottom:12 }}>
                  売却済み・検討中の銘柄を保存。財務指標・数値入力は「銘柄詳細」から確認できます。保有に移行する場合は「保有へ」ボタンを押してください。
                </div>
                {/* 保有移行フォーム */}
                {moveForm.id && (
                  <div style={{ ...S.card, border:"1px solid #4ade8044", marginBottom:16 }}>
                    <div style={{ color:"#4ade80", fontWeight:700, marginBottom:12 }}>保有銘柄に追加</div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
                      <div>
                        <label style={{ color:"#64748b", fontSize:R.sm, display:"block", marginBottom:4 }}>保有数量（株）</label>
                        <input value={moveForm.qty} onChange={e => setMoveForm(p=>({...p,qty:e.target.value}))} style={S.input} inputMode="decimal" />
                      </div>
                      <div>
                        <label style={{ color:"#64748b", fontSize:R.sm, display:"block", marginBottom:4 }}>平均取得単価（円）</label>
                        <input value={moveForm.avgCost} onChange={e => setMoveForm(p=>({...p,avgCost:e.target.value}))} style={S.input} inputMode="decimal" />
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:8 }}>
                      <button style={S.addBtn} onClick={applyMove}>保有に追加する</button>
                      <button style={S.miniBtn} onClick={() => setMoveForm({qty:"",avgCost:"",id:null})}>キャンセル</button>
                    </div>
                  </div>
                )}

                {watchlist.length === 0 ? (
                  <div style={{ ...S.card, color:"#475569", textAlign:"center", padding:32 }}>
                    候補銘柄がありません。「+ 候補追加」から追加してください。
                  </div>
                ) : (
                  <div style={{ ...S.table, overflowX:"auto" }}>
                    <div style={{ minWidth:700 }}>
                      <div style={{ display:"grid", gridTemplateColumns:"2fr 0.6fr 1fr 1fr 0.6fr 1.4fr", padding:"12px 20px", background:"#111827", gap:10 }}>
                        {["銘柄","コード","現在値","スコア","","操作"].map(h => (
                          <span key={h} style={{ fontSize:R.sm, color:"#475569" }}>{h}</span>
                        ))}
                      </div>
                      {watchlist.map(h => {
                        const wsc = scoreFromPeriods(h, baseYear);
                        return (
                          <div key={h.id} style={{ display:"grid", gridTemplateColumns:"2fr 0.6fr 1fr 1fr 0.6fr 1.4fr", padding:"12px 20px", gap:10, borderTop:"1px solid #1e293b", alignItems:"center", ...(watchSelected?.id===h.id?{ background:"#1a1200" }:{}) }}>
                            <span style={{ fontWeight:700, color:"#e2e8f0" }}>{h.name}<br/><span style={{ color:"#475569", fontSize:R.sm }}>{h.sector}</span></span>
                            <span><Tag color="#f59e0b">{h.ticker}</Tag></span>
                            <span style={{ fontWeight:700, color:"#e2e8f0" }}>¥{h.currentPrice.toLocaleString()}</span>
                            <span style={{ color:wsc!=null?scoreColor(wsc):"#475569", fontWeight:700 }}>{wsc!=null?wsc+"pt":"—"}</span>
                            <span></span>
                            <span style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                              <button style={S.miniBtn} onClick={() => { setWatchSelected(h); setTab("detail"); setDetailTab("metrics"); }}>詳細</button>
                              <button style={{ ...S.miniBtn, color:"#4ade80", borderColor:"#4ade80" }} onClick={() => moveToPortfolio(h)}>保有へ</button>
                              <button style={{ ...S.miniBtn, color:"#f87171", borderColor:"#f87171" }} onClick={() => deleteWatch(h.id)}>削除</button>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {portfolioMode === "portfolio" && (
            <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:8 }}>
              <h2 style={S.h2}>保有銘柄一覧</h2>
              <div style={{ display:"flex", gap:8 }}>
                <button style={{ ...S.miniBtn, color:"#fbbf24", borderColor:"#fbbf24" }} onClick={() => {
                  const inp = {};
                  const shin = {};
                  const qty = {};
                  const cost = {};
                  portfolio.forEach(h => {
                    inp[h.id] = String(h.currentPrice);
                    shin[h.id] = h.financials?.shinyoBairitu || "";
                    qty[h.id] = String(h.qty);
                    cost[h.id] = String(h.avgCost);
                  });
                  setPriceInputs(inp);
                  setShinInputs(shin);
                  setQtyInputs(qty);
                  setCostInputs(cost);
                  setShowPriceUpdate(v => !v);
                }}>📊 株価を更新</button>
                <button style={S.addBtn} onClick={() => setShowAdd(v => !v)}>+ 銘柄追加</button>
              </div>
            </div>

            {showPriceUpdate && (
              <div style={{ ...S.card, marginBottom:16, border:"1px solid #fbbf2444" }}>
                <div style={{ color:"#fbbf24", fontWeight:700, marginBottom:8 }}>📊 株価・保有情報の一括更新</div>
                <div style={{ color:"#64748b", fontSize:R.sm, marginBottom:12 }}>空欄の場合は現在の値を維持します。</div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(min(280px,90vw),1fr))", gap:12, marginBottom:12 }}>
                  {portfolio.map(h => (
                    <div key={h.id} style={{ background:"#111827", borderRadius:8, padding:"12px 14px" }}>
                      <div style={{ color:"#94a3b8", fontWeight:700, marginBottom:10, fontSize:R.md }}>{h.name}（{h.ticker}）</div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                        <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                          <label style={{ color:"#64748b", fontSize:R.sm }}>現在株価（円）</label>
                          <input value={priceInputs[h.id] ?? String(h.currentPrice)} onChange={e => { const v=e.target.value; if(v===""||/^\d*\.?\d*$/.test(v)) setPriceInputs(p=>({...p,[h.id]:v})); }} style={S.input} inputMode="decimal" />
                          <span style={{ fontSize:R.sm, color:"#334155" }}>前回: ¥{h.currentPrice.toLocaleString()}</span>
                        </div>
                        <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                          <label style={{ color:"#64748b", fontSize:R.sm }}>信用倍率（倍）</label>
                          <input value={shinInputs[h.id] ?? (h.financials?.shinyoBairitu || "")} onChange={e => { const v=e.target.value; if(v===""||/^\d*\.?\d*$/.test(v)) setShinInputs(p=>({...p,[h.id]:v})); }} style={S.input} inputMode="decimal" placeholder="例: 2.5" />
                          <span style={{ fontSize:R.sm, color:"#334155" }}>前回: {h.financials?.shinyoBairitu || "—"}倍</span>
                        </div>
                        <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                          <label style={{ color:"#64748b", fontSize:R.sm }}>保有数（株）</label>
                          <input value={qtyInputs[h.id] ?? String(h.qty)} onChange={e => { const v=e.target.value; if(v===""||/^\d*$/.test(v)) setQtyInputs(p=>({...p,[h.id]:v})); }} style={S.input} inputMode="numeric" />
                          <span style={{ fontSize:R.sm, color:"#334155" }}>前回: {h.qty.toLocaleString()}株</span>
                        </div>
                        <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                          <label style={{ color:"#64748b", fontSize:R.sm }}>平均取得単価（円）</label>
                          <input value={costInputs[h.id] ?? String(h.avgCost)} onChange={e => { const v=e.target.value; if(v===""||/^\d*\.?\d*$/.test(v)) setCostInputs(p=>({...p,[h.id]:v})); }} style={S.input} inputMode="decimal" />
                          <span style={{ fontSize:R.sm, color:"#334155" }}>前回: ¥{h.avgCost.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <button style={S.addBtn} onClick={applyPrices}>更新を適用</button>
                  <button style={S.miniBtn} onClick={() => setShowPriceUpdate(false)}>キャンセル</button>
                </div>
              </div>
            )}

            {showAdd && (
              <div style={{ ...S.card, marginBottom:16, border:"1px solid "+(portfolioMode==="watchlist"?"#f59e0b44":"#334155")+"" }}>
                <div style={{ color: portfolioMode==="watchlist"?"#f59e0b":"#94a3b8", fontWeight:700, marginBottom:12 }}>
                  {portfolioMode==="watchlist" ? "👀 候補銘柄を追加" : "新規銘柄追加"}
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(min(160px,45vw),1fr))", gap:12 }}>
                  <FInput label="証券コード（例: 7203）" value={addForm.ticker} onChange={v => setAddForm(p => ({ ...p, ticker:v }))} inputType="ticker" />
                  <FInput label="銘柄名" value={addForm.name} onChange={v => setAddForm(p => ({ ...p, name:v }))} maxLen={30} />
                  <FInput label="セクター" value={addForm.sector} onChange={v => setAddForm(p => ({ ...p, sector:v }))} maxLen={20} />
                  {portfolioMode !== "watchlist" && <>
                    <FInput label="保有数量（株）" value={addForm.qty} onChange={v => setAddForm(p => ({ ...p, qty:v }))} numOnly={true} />
                    <FInput label="平均取得単価（円）" value={addForm.avgCost} onChange={v => setAddForm(p => ({ ...p, avgCost:v }))} numOnly={true} />
                  </>}
                  <FInput label="現在株価（円）" value={addForm.currentPrice} onChange={v => setAddForm(p => ({ ...p, currentPrice:v }))} numOnly={true} />
                </div>
                <div style={{ marginTop:12, display:"flex", gap:8 }}>
                  <button style={{ ...S.addBtn, ...(portfolioMode==="watchlist"?{ borderColor:"#f59e0b", color:"#f59e0b", background:"#1a1200" }:{}) }} onClick={addStock}>追加する</button>
                  <button style={S.miniBtn} onClick={() => setShowAdd(false)}>キャンセル</button>
                </div>
              </div>
            )}

            <div style={{ ...S.table, overflowX:"auto" }}>
              <div style={{ minWidth:800 }}>
              <div style={{ display:"grid", gridTemplateColumns:"2fr 0.6fr 0.7fr 0.9fr 0.9fr 0.9fr 1.1fr 1fr 0.8fr 1.5fr", padding:"12px 20px", background:"#111827", gap:10 }}>
                {["銘柄","コード","保有数","取得単価","現在値","目標株価","評価額","損益率","スコア","操作"].map(h => (
                  <span key={h} style={{ fontSize:R.sm, color:"#475569", textTransform:"uppercase" }}>{h}</span>
                ))}
              </div>
              {portfolio.map(h => {
                const pnlPct = ((h.currentPrice-h.avgCost)/h.avgCost)*100;
                const hsc = scoreFromPeriods(h, baseYear);
                const tp = n(h.memo?.targetPrice);
                const tpPct = tp ? ((h.currentPrice-tp)/tp*100) : null;
                return (
                  <div key={h.id} style={{ display:"grid", gridTemplateColumns:"2fr 0.6fr 0.7fr 0.9fr 0.9fr 0.9fr 1.1fr 1fr 0.8fr 1.5fr", padding:"14px 20px", gap:10, borderTop:"1px solid #1e293b", alignItems:"start", ...(selected?.id===h.id?{ background:"#0f2a1a" }:{}) }}>
                    <span style={{ fontWeight:700, color:"#e2e8f0" }}>{h.name}<br/><span style={{ color:"#475569", fontSize:R.sm }}>{h.sector}</span></span>
                    <span><Tag color="#60a5fa">{h.ticker}</Tag></span>
                    <span style={{ color:"#94a3b8" }}>{h.qty.toLocaleString()}</span>
                    <span style={{ color:"#94a3b8" }}>¥{h.avgCost.toLocaleString()}</span>
                    <span style={{ fontWeight:700, color:"#e2e8f0" }}>¥{h.currentPrice.toLocaleString()}</span>
                    <span>
                      {tp ? (
                        <div>
                          <div style={{ color:"#a78bfa", fontWeight:700, fontSize:R.sm }}>¥{tp.toLocaleString()}</div>
                          {tpPct != null && <div style={{ fontSize:R.sm, color:tpPct>=0?"#4ade80":"#f87171" }}>{tpPct>=0?"▲":"▼"}{Math.abs(tpPct).toFixed(1)}%</div>}
                        </div>
                      ) : <span style={{ color:"#334155", fontSize:R.sm }}>未設定</span>}
                    </span>
                    <span style={{ color:"#e2e8f0" }}>¥{(h.qty*h.currentPrice).toLocaleString()}</span>
                    <span><Delta val={pnlPct} fmt={v => v.toFixed(2)+"%"} /></span>
                    <ScoreBadge sc={hsc} stockId={h.id} />
                    <span style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                      <button style={S.miniBtn} onClick={() => { setSelected(h); setTab("detail"); setDetailTab("memo"); }}>メモ</button>
                      <button style={S.miniBtn} onClick={() => { setSelected(h); setTab("detail"); setDetailTab("metrics"); }}>詳細</button>
                      <button style={{ ...S.miniBtn, ...(compareIds.includes(h.id)?{ color:"#4ade80", borderColor:"#4ade80" }:{}) }} onClick={() => toggleCompare(h.id)}>{compareIds.includes(h.id)?"比較中":"比較"}</button>
                      <button style={{ ...S.miniBtn, color:"#f59e0b", borderColor:"#f59e0b" }} onClick={() => {
                        if (!window.confirm(h.name+" を保有候補リストに移動します。データはそのまま保持されます。")) return;
                        saveWatch2(p => [...p, { ...h, isWatch:true }]);
                        save(p => p.filter(x => x.id !== h.id));
                        if (selected?.id === h.id) setSelected(portfolio.find(x => x.id !== h.id) || null);
                      }}>候補へ</button>
                      <button style={{ ...S.miniBtn, color:"#f87171", borderColor:"#f87171" }} onClick={() => deleteStock(h.id)}>削除</button>
                    </span>
                  </div>
                );
              })}
              </div>
            </div>
            {portfolio.length === 0 && <div style={{ ...S.card, textAlign:"center", color:"#475569", padding:40 }}>「+ 銘柄追加」から追加してください。</div>}

            {summary && (
              <div style={{ marginTop:24 }}>
                <h3 style={{ fontSize:16, fontWeight:800, color:"#f1f5f9", margin:"0 0 16px 0" }}>ポートフォリオサマリー</h3>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(min(160px,45vw),1fr))", gap:12, marginBottom:20 }}>
                  <div style={S.kpi}><div style={S.kpiL}>投資元本</div><div style={{ ...S.kpiV, color:"#94a3b8" }}>¥{Math.round(tc).toLocaleString()}</div></div>
                  <div style={S.kpi}><div style={S.kpiL}>評価額合計</div><div style={{ ...S.kpiV, color:"#e2e8f0" }}>¥{Math.round(tv).toLocaleString()}</div></div>
                  <div style={S.kpi}><div style={S.kpiL}>含み損益（税引前）</div><div style={{ ...S.kpiV, color:tPnL>=0?"#4ade80":"#f87171" }}>{tPnL>=0?"▲":"▼"}¥{Math.round(Math.abs(tPnL)).toLocaleString()}</div></div>
                  <div style={S.kpi}><div style={S.kpiL}>含み損益（税引後）</div><div style={{ ...S.kpiV, color:summary.afterTax>=0?"#4ade80":"#f87171" }}>{summary.afterTax>=0?"▲":"▼"}¥{Math.round(Math.abs(summary.afterTax)).toLocaleString()}</div></div>
                  <div style={S.kpi}><div style={S.kpiL}>平均PER</div><div style={{ ...S.kpiV, color:"#60a5fa" }}>{summary.avgPer?summary.avgPer+"倍":"—"}</div></div>
                  <div style={S.kpi}><div style={S.kpiL}>保有銘柄数</div><div style={{ ...S.kpiV, color:"#a78bfa" }}>{portfolio.length}銘柄</div></div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:R.grid2, gap:16 }}>
                  <div style={S.card}>
                    <div style={{ color:"#94a3b8", fontWeight:700, marginBottom:12 }}>セクター別配分</div>
                    <ResponsiveContainer width="100%" height={R.chartMd}>
                      <PieChart>
                        <Pie data={summary.sectorData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3}>
                          {summary.sectorData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i%8]} />)}
                        </Pie>
                        <Tooltip formatter={(v, name) => ["¥"+v.toLocaleString(), name]} contentStyle={TS} labelStyle={{ color:"#94a3b8" }} itemStyle={{ color:"#e2e8f0" }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:"6px 14px", justifyContent:"center", marginTop:8 }}>
                      {summary.sectorData.map((d, i) => {
                        const tot = summary.sectorData.reduce((a, b) => a+b.value, 0);
                        return (
                          <span key={d.name} style={{ display:"flex", alignItems:"center", gap:5, fontSize:16, color:"#94a3b8" }}>
                            <span style={{ width:10, height:10, borderRadius:2, background:PIE_COLORS[i%8], display:"inline-block", flexShrink:0 }} />
                            {d.name} {((d.value/tot)*100).toFixed(0)}%
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div style={S.card}>
                    <div style={{ color:"#94a3b8", fontWeight:700, marginBottom:12 }}>損益率ランキング</div>
                    <ResponsiveContainer width="100%" height={R.chartMd}>
                      <BarChart layout="vertical" margin={{ left:10, right:20 }}
                        data={summary.sortedPnl.map(h => ({ name:h.name.length>8?h.name.slice(0,8)+"…":h.name, v:parseFloat(((h.currentPrice-h.avgCost)/h.avgCost*100).toFixed(2)) }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis type="number" tick={{ fill:"#64748b", fontSize:R.sm }} tickFormatter={v => v+"%"} />
                        <YAxis dataKey="name" type="category" tick={{ fill:"#94a3b8", fontSize:R.sm }} width={90} />
                        <Tooltip formatter={v => [v+"%","損益率"]} contentStyle={TS} labelStyle={{ color:"#94a3b8" }} itemStyle={{ color:"#e2e8f0" }} />
                        <ReferenceLine x={0} stroke="#475569" />
                        <Bar dataKey="v" fill="#4ade80" radius={[0,4,4,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
          </div>
        )}

        {tab === "detail" && (
          <div>
            <h2 style={S.h2}>銘柄詳細</h2>
            {/* 保有銘柄チップ */}
            <div style={S.chips}>
              {portfolio.map(h => (
                <button key={h.id} style={{ ...S.chip, ...(selected?.id===h.id&&!watchSelected?S.chipOn:{}) }}
                  onClick={() => { setSelected(h); setWatchSelected(null); }}>{h.ticker} {h.name}</button>
              ))}
              {watchlist.length > 0 && <span style={{ color:"#475569", fontSize:R.sm, alignSelf:"center" }}>｜候補:</span>}
              {watchlist.map(h => (
                <button key={h.id} style={{ ...S.chip, ...(watchSelected?.id===h.id?{ ...S.chipOn, borderColor:"#f59e0b", color:"#f59e0b", background:"#1a1200" }:{}), borderStyle:"dashed" }}
                  onClick={() => { setWatchSelected(h); setSelected(null); }}>{h.ticker} {h.name}</button>
              ))}
            </div>

            {/* 候補銘柄の詳細 */}
            {watchSelected && !selected && (
              <WatchDetail
                watchSelected={watchSelected}
                watchlist={watchlist}
                baseYear={baseYear}
                annualKeys={ANNUAL_KEYS}
                qtrKeys={QTR_KEYS}
                detailTab={detailTab}
                setDetailTab={setDetailTab}
                updateWatchPeriod={updateWatchPeriod}
                sc={scoreFromPeriods(watchSelected, baseYear)}
                R={R} TS={TS} S={S}
              />
            )}

            {!selected && !watchSelected && <div style={S.card}><span style={{ color:"#64748b" }}>銘柄を選択してください。</span></div>}
            {selected && (
              <>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12, flexWrap:"wrap", gap:8 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                    <span style={{ fontSize:20, fontWeight:800, color:"#f1f5f9" }}>{selected.name}</span>
                    <Tag color="#60a5fa">{selected.ticker}</Tag>
                    <Tag color="#a78bfa">{selected.sector}</Tag>
                    {sc != null && <span style={{ background:scoreColor(sc)+"22", color:scoreColor(sc), border:"1px solid "+(scoreColor(sc))+"44", borderRadius:6, padding:"4px 10px", fontSize:16, fontWeight:700 }}>総合スコア {sc}pt</span>}
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:24, fontWeight:900, color:"#f1f5f9" }}>¥{selected.currentPrice.toLocaleString()}</div>
                    <Delta val={((selected.currentPrice-selected.avgCost)/selected.avgCost)*100} fmt={v => v.toFixed(2)+"%"} />
                  </div>
                </div>
                <div style={{ display:"flex", gap:4, marginBottom:20, borderBottom:"1px solid #1e293b", paddingBottom:8, flexWrap:"wrap" }}>
                  {[["metrics","財務指標"],["memo","投資メモ"],["input","数値入力"],["ir","IRニュース"]].map(([k,v]) => (
                    <button key={k} style={{ ...S.navBtn, ...(detailTab===k?S.navOn:{}) }} onClick={() => setDetailTab(k)}>{v}</button>
                  ))}
                </div>

                {detailTab === "metrics" && selected && (
                  <MetricsTab
                    c={c} f={f}
                    selected={portfolio.find(h=>h.id===selected.id)||selected}
                    periods={(portfolio.find(h=>h.id===selected.id)||selected).periods||{}}
                    baseYear={getStockBaseYear(portfolio.find(h=>h.id===selected.id)||selected, baseYear)}
                    annualKeys={getAnnualKeys(getStockBaseYear(portfolio.find(h=>h.id===selected.id)||selected, baseYear))}
                    qtrKeys={getQtrKeys(getStockBaseYear(portfolio.find(h=>h.id===selected.id)||selected, baseYear))}
                    R={R} TS={TS}
                  />
                )}

                {detailTab === "memo" && (
                  <div>
                    <div style={{ display:"grid", gridTemplateColumns:R.grid2, gap:16, marginBottom:16 }}>
                      <div style={S.card}>
                        <div style={{ color:"#a78bfa", fontWeight:700, marginBottom:12 }}>目標・判断</div>
                        <FInput label="目標株価（円）" value={selected.memo?.targetPrice||""} onChange={v => updateMemo(selected.id,"targetPrice",v)} numOnly={true} />
                        {selected.memo?.targetPrice && n(selected.memo.targetPrice) && (
                          <div style={{ marginTop:12, background:"#111827", borderRadius:6, padding:"10px 12px" }}>
                            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                              <span style={{ color:"#475569", fontSize:16 }}>現在株価</span>
                              <span style={{ color:"#e2e8f0", fontWeight:700 }}>¥{selected.currentPrice.toLocaleString()}</span>
                            </div>
                            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                              <span style={{ color:"#475569", fontSize:16 }}>目標株価</span>
                              <span style={{ color:"#a78bfa", fontWeight:700 }}>¥{Number(selected.memo.targetPrice).toLocaleString()}</span>
                            </div>
                            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                              <span style={{ color:"#475569", fontSize:16 }}>目標まであと</span>
                              <span style={{ color:n(selected.memo.targetPrice)>selected.currentPrice?"#4ade80":"#f87171", fontWeight:700 }}>
                                {((n(selected.memo.targetPrice)-selected.currentPrice)/selected.currentPrice*100).toFixed(1)}%
                              </span>
                            </div>
                            <div style={{ height:6, background:"#1e293b", borderRadius:3, overflow:"hidden" }}>
                              <div style={{ height:"100%", width:(Math.min(100,Math.max(0,(selected.currentPrice/n(selected.memo.targetPrice))*100)))+"%", background:"#a78bfa", borderRadius:3 }} />
                            </div>
                          </div>
                        )}
                      </div>
                      <div style={S.card}>
                        <div style={{ color:"#4ade80", fontWeight:700, marginBottom:12 }}>投資理由・メモ</div>
                        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                          <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                            <label style={{ color:"#64748b", fontSize:16 }}>投資理由・買った根拠</label>
                            <textarea value={selected.memo?.buyReason||""} onChange={e => updateMemo(selected.id,"buyReason",e.target.value.slice(0,300))}
                              style={{ ...S.input, height:80, resize:"vertical", lineHeight:1.6 }}
                              placeholder="例: PERが割安で配当利回りも高い。業績回復トレンド。" />
                          </div>
                          <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                            <label style={{ color:"#64748b", fontSize:16 }}>メモ・注意事項</label>
                            <textarea value={selected.memo?.memo||""} onChange={e => updateMemo(selected.id,"memo",e.target.value.slice(0,300))}
                              style={{ ...S.input, height:80, resize:"vertical", lineHeight:1.6 }}
                              placeholder="例: 決算発表は8月。為替リスクに注意。" />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div style={S.card}>
                      <div style={{ color:"#94a3b8", fontWeight:700, marginBottom:12 }}>損益サマリー</div>
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(min(160px,45vw),1fr))", gap:10 }}>
                        {pnlSummary.map(([label, val, color]) => (
                          <div key={label} style={{ background:"#111827", borderRadius:8, padding:"10px 14px" }}>
                            <div style={{ color:"#475569", fontSize:16, marginBottom:3 }}>{label}</div>
                            <div style={{ color, fontWeight:700, fontSize:16 }}>{val}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {detailTab === "input" && selected && (
                  <InputTab
                    selected={portfolio.find(h=>h.id===selected.id)||selected}
                    periods={(portfolio.find(h=>h.id===selected.id)||selected).periods||{}}
                    updatePeriod={updatePeriod}
                    baseYear={getStockBaseYear(portfolio.find(h=>h.id===selected.id)||selected, baseYear)}
                    annualKeys={getAnnualKeys(getStockBaseYear(portfolio.find(h=>h.id===selected.id)||selected, baseYear))}
                    qtrKeys={getQtrKeys(getStockBaseYear(portfolio.find(h=>h.id===selected.id)||selected, baseYear))}
                    TS={TS}
                  />
                )}

                {detailTab === "ir" && (
                  <div>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                      <span style={{ color:"#64748b", fontSize:16 }}>IRニュース・適時開示情報</span>
                      <button style={S.addBtn} onClick={() => setShowIrForm(v => !v)}>+ 追加</button>
                    </div>
                    {showIrForm && (
                      <div style={{ ...S.card, marginBottom:16 }}>
                        <div style={{ display:"grid", gridTemplateColumns:R.grid2, gap:12, marginBottom:12 }}>
                          <FInput label="日付（例: 2025-05-08）" value={irForm.date} onChange={v => setIrForm(p => ({ ...p, date:v }))} inputType="date" />
                          <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                            <label style={{ color:"#64748b", fontSize:16 }}>種別</label>
                            <select value={irForm.type} style={S.sel} onChange={e => setIrForm(p => ({ ...p, type:e.target.value }))}>
                              {["決算","配当","人事","自社株買い","その他"].map(t => <option key={t}>{t}</option>)}
                            </select>
                          </div>
                        </div>
                        <div style={{ marginBottom:12 }}><FInput label="タイトル" value={irForm.title} onChange={v => setIrForm(p => ({ ...p, title:v }))} maxLen={100} /></div>
                        <div style={{ marginBottom:12 }}><FInput label="URL（任意）" value={irForm.url} onChange={v => setIrForm(p => ({ ...p, url:v }))} inputType="url" /></div>
                        <button style={S.addBtn} onClick={addIR}>保存</button>
                      </div>
                    )}
                    {!(selected.irList||[]).length && <div style={S.card}><span style={{ color:"#64748b" }}>「+ 追加」からIRニュースを入力してください。</span></div>}
                    {(selected.irList||[]).map((item, i) => (
                      <div key={i} style={{ ...S.card, marginBottom:12 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                          <div style={{ display:"flex", gap:8 }}><Tag color={typeColor(item.type)}>{item.type}</Tag><span style={{ color:"#475569", fontSize:16 }}>{item.date}</span></div>
                          <button style={{ ...S.miniBtn, color:"#f87171", borderColor:"#f87171" }} onClick={() => deleteIR(i)}>削除</button>
                        </div>
                        <div style={{ fontWeight:700, color:"#f1f5f9", fontSize:16 }}>
                          {item.url ? <a href={item.url} target="_blank" rel="noreferrer" style={{ color:"#f1f5f9", textDecoration:"none" }}>{item.title} ↗</a> : item.title}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {tab === "compare" && (
          <div>
            <h2 style={S.h2}>他社比較</h2>
            <div style={{ marginBottom:8, color:"#64748b", fontSize:16 }}>比較したい銘柄を選択してください（最大4社）</div>
            <div style={S.chips}>
              {portfolio.map(h => (
                <button key={h.id} style={{ ...S.chip, ...(compareIds.includes(h.id)?S.chipOn:{}) }} onClick={() => toggleCompare(h.id)}>{h.ticker} {h.name}</button>
              ))}
            </div>
            {cmpStocks.length < 2 ? (
              <div style={S.card}><span style={{ color:"#64748b" }}>2社以上選択してください。</span></div>
            ) : (
              <>
                <div style={{ ...S.card, overflowX:"auto", marginBottom:20 }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:16 }}>
                    <thead>
                      <tr style={{ borderBottom:"1px solid #1e293b" }}>
                        <th style={{ textAlign:"left", padding:"8px 12px", color:"#475569", fontSize:16, minWidth:150 }}>指標</th>
                        {cmpStocks.map((h, i) => (
                          <th key={h.id} style={{ textAlign:"right", padding:"8px 12px", color:CMP_COLORS[i], minWidth:110 }}>
                            {h.ticker}<br/><span style={{ fontSize:16, color:"#475569" }}>{h.name}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ["総合スコア", h => scoreFromPeriods(h, baseYear), v => v!=null?v+"pt ("+scoreLabel(v)+")":"—", v => v!=null?scoreColor(v):"#475569"],
                        ["PER",        h => calcAll(h.financials).per,             v => v?xfmt(v):"—",      v => v&&v<15?"#4ade80":v&&v<25?"#fbbf24":"#f87171"],
                        ["PBR",        h => calcAll(h.financials).pbr,             v => v?xfmt(v):"—",      v => v&&v<1.5?"#4ade80":"#94a3b8"],
                        ["PSR",        h => calcAll(h.financials).psr,             v => v?xfmt(v):"—",      () => "#94a3b8"],
                        ["EV/EBITDA",  h => calcAll(h.financials).evEbitda,        v => v?xfmt(v):"—",      v => v&&v<10?"#4ade80":"#94a3b8"],
                        ["ROE",        h => calcAll(h.financials).roe,             v => v?pct(v):"—",       v => v&&v>0.15?"#4ade80":"#94a3b8"],
                        ["ROA",        h => calcAll(h.financials).roa,             v => v?pct(v):"—",       v => v&&v>0.05?"#4ade80":"#94a3b8"],
                        ["営業利益率", h => calcAll(h.financials).opMargin,        v => v?pct(v):"—",       v => v&&v>0.10?"#4ade80":"#94a3b8"],
                        ["粗利率",     h => calcAll(h.financials).grossMargin,     v => v?pct(v):"—",       v => v&&v>0.40?"#4ade80":"#94a3b8"],
                        ["自己資本比率",h => calcAll(h.financials).equityRatio,    v => v?pct(v):"—",       v => v&&v>0.40?"#4ade80":"#94a3b8"],
                        ["流動比率",   h => calcAll(h.financials).currentRatio,    v => v?pct(v):"—",       v => v&&v>2?"#4ade80":v&&v>1?"#fbbf24":"#f87171"],
                        ["配当利回り", h => calcAll(h.financials).dividendYield,   v => v?pct(v):"—",       v => v&&v>0.03?"#4ade80":"#94a3b8"],
                        ["信用倍率",   h => h.financials.shinyoBairitu,            v => v?v+"倍":"—",        v => n(v)>3?"#f87171":"#94a3b8"],
                        ["時価総額",   h => calcAll(h.financials).marketCap,       v => v?fmtM(v):"—",      () => "#e2e8f0"],
                      ].map(([label, getter, formatter, colorFn]) => (
                        <tr key={label} style={{ borderBottom:"1px solid #1e293b" }}>
                          <td style={{ padding:"8px 12px", color:"#64748b", fontSize:16 }}>{label}</td>
                          {cmpStocks.map(h => {
                            const val = getter(h);
                            return <td key={h.id} style={{ textAlign:"right", padding:"8px 12px", color:colorFn(val), fontWeight:700 }}>{formatter(val)}</td>;
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={S.card}>
                  <div style={{ color:"#94a3b8", fontWeight:700, marginBottom:4 }}>総合レーダーチャート</div>
                  <div style={{ color:"#475569", fontSize:16, marginBottom:12 }}>各指標を0〜100点に正規化して比較。外側ほど優秀。</div>
                  <ResponsiveContainer width="100%" height={R.chartXl}>
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="#1e293b" />
                      <PolarAngleAxis dataKey="m" tick={{ fill:"#64748b", fontSize:R.sm }} />
                      {cmpStocks.map((h, i) => (
                        <Radar key={h.id} name={h.ticker} dataKey={h.ticker} stroke={CMP_COLORS[i]} fill={CMP_COLORS[i]} fillOpacity={0.15} strokeWidth={2} />
                      ))}
                      <Legend wrapperStyle={{ color:"#94a3b8", fontSize:R.sm }} />
                      <Tooltip formatter={v => Math.round(v)+"点"} contentStyle={TS} itemStyle={{ color:"#e2e8f0" }} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>

                <div style={S.card}>
                  <div style={{ color:"#94a3b8", fontWeight:700, marginBottom:4 }}>収益性 vs 安全性マップ</div>
                  <div style={{ color:"#475569", fontSize:16, marginBottom:12 }}>右上ほど「高収益・高安全性」の理想企業。</div>
                  <div style={{ position:"relative", height:240, background:"#111827", borderRadius:8, overflow:"hidden" }}>
                    <div style={{ position:"absolute", top:8, left:8, fontSize:16, color:"#334155" }}>低収益・高安全</div>
                    <div style={{ position:"absolute", top:8, right:8, fontSize:16, color:"#4ade8044" }}>高収益・高安全</div>
                    <div style={{ position:"absolute", bottom:8, left:8, fontSize:16, color:"#f8717144" }}>低収益・低安全</div>
                    <div style={{ position:"absolute", bottom:8, right:8, fontSize:16, color:"#334155" }}>高収益・低安全</div>
                    <div style={{ position:"absolute", top:0, bottom:0, left:"50%", width:1, background:"#1e293b" }} />
                    <div style={{ position:"absolute", left:0, right:0, top:"50%", height:1, background:"#1e293b" }} />
                    {cmpStocks.map((h, i) => {
                      const cm = calcAll(h.financials);
                      const px = Math.min(Math.max((cm.equityRatio||0)*100,0),80)/80*85+7;
                      const py = 100-Math.min(Math.max((cm.opMargin||0)*100,0),30)/30*85-7;
                      return (
                        <div key={h.id} style={{ position:"absolute", left:(px)+"%", top:(py)+"%", transform:"translate(-50%,-50%)", background:CMP_COLORS[i], borderRadius:"50%", width:36, height:36, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, fontWeight:700, color:"#0a0f1a", boxShadow:"0 0 12px "+(CMP_COLORS[i])+"66" }}>
                          {h.ticker}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display:"flex", justifyContent:"center", gap:16, marginTop:8, flexWrap:"wrap" }}>
                    {cmpStocks.map((h, i) => <span key={h.id} style={{ fontSize:16, color:CMP_COLORS[i] }}>● {h.ticker} {h.name}</span>)}
                  </div>
                </div>

                <div style={{ display:"grid", gridTemplateColumns:R.grid2, gap:16 }}>
                  <div style={S.card}>
                    <div style={{ color:"#94a3b8", fontSize:16, marginBottom:12 }}>ROE・ROA・ROIC比較</div>
                    <ResponsiveContainer width="100%" height={R.chartSm}>
                      <BarChart data={cmpStocks.map(h => {
                        const cm = calcAll(h.financials);
                        return { name:h.ticker, ROE:parseFloat(((cm.roe||0)*100).toFixed(1)), ROA:parseFloat(((cm.roa||0)*100).toFixed(1)), ROIC:parseFloat(((cm.roic||0)*100).toFixed(1)) };
                      })}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="name" tick={{ fill:"#94a3b8", fontSize:R.sm }} />
                        <YAxis tick={{ fill:"#64748b", fontSize:R.sm }} tickFormatter={v => v+"%"} />
                        <Tooltip formatter={v => v+"%"} contentStyle={TS} itemStyle={{ color:"#e2e8f0" }} />
                        <ReferenceLine y={15} stroke="#4ade80" strokeDasharray="4 4" />
                        <Legend wrapperStyle={{ color:"#94a3b8", fontSize:R.sm }} />
                        <Bar dataKey="ROE" fill="#4ade80" radius={[3,3,0,0]} />
                        <Bar dataKey="ROA" fill="#60a5fa" radius={[3,3,0,0]} />
                        <Bar dataKey="ROIC" fill="#a78bfa" radius={[3,3,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={S.card}>
                    <div style={{ color:"#94a3b8", fontSize:16, marginBottom:12 }}>PER比較</div>
                    <ResponsiveContainer width="100%" height={R.chartSm}>
                      <BarChart data={cmpStocks.map(h => ({ name:h.ticker, PER:parseFloat((calcAll(h.financials).per||0).toFixed(2)) }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="name" tick={{ fill:"#94a3b8", fontSize:R.sm }} />
                        <YAxis tick={{ fill:"#64748b", fontSize:R.sm }} tickFormatter={v => v+"x"} />
                        <Tooltip formatter={v => v+"倍"} contentStyle={TS} itemStyle={{ color:"#e2e8f0" }} />
                        <ReferenceLine y={15} stroke="#4ade80" strokeDasharray="4 4" />
                        <Bar dataKey="PER" fill="#818cf8" radius={[4,4,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {tab === "simulation" && (
          <div>
            <h2 style={S.h2}>シミュレーション</h2>
            <div style={S.chips}>
              {portfolio.map(h => (
                <button key={h.id} style={{ ...S.chip, ...(selected?.id===h.id?S.chipOn:{}) }} onClick={() => setSelected(h)}>{h.ticker} {h.name}</button>
              ))}
            </div>
            {!selected && <div style={S.card}><span style={{ color:"#64748b" }}>銘柄を選択してください。</span></div>}
            {selected && (
              <>
                <div style={{ ...S.card, marginBottom:16 }}>
                  <div style={{ color:"#94a3b8", fontWeight:700, marginBottom:12 }}>設定 — {selected.name}（{selected.ticker}）</div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(min(155px,45vw),1fr))", gap:12 }}>
                    <FInput label="予測年数（年）" value={simParams.years} onChange={v => setSimParams(p => ({ ...p, years:v }))} numOnly={true} />
                    <FInput label="売上成長率（基本）%" value={simParams.growthRate} onChange={v => setSimParams(p => ({ ...p, growthRate:v }))} numOnly={true} />
                    <FInput label="目標営業利益率 %" value={simParams.targetMargin} onChange={v => setSimParams(p => ({ ...p, targetMargin:v }))} numOnly={true} />
                    <FInput label="目標PER（倍）" value={simParams.targetPer} onChange={v => setSimParams(p => ({ ...p, targetPer:v }))} numOnly={true} />
                    <FInput label="目標EV/EBITDA（任意）" value={simParams.targetEvEbitda} onChange={v => setSimParams(p => ({ ...p, targetEvEbitda:v }))} numOnly={true} />
                    <FInput label="配当利回り %" value={simParams.dividendRate} onChange={v => setSimParams(p => ({ ...p, dividendRate:v }))} numOnly={true} />
                    <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                      <label style={{ color:"#64748b", fontSize:16 }}>配当再投資</label>
                      <button style={{ ...S.miniBtn, padding:"8px 12px", color:simParams.reinvest?"#4ade80":"#64748b", borderColor:simParams.reinvest?"#4ade80":"#334155" }} onClick={() => setSimParams(p => ({ ...p, reinvest:!p.reinvest }))}>
                        {simParams.reinvest?"あり（複利）":"なし（単純）"}
                      </button>
                    </div>
                  </div>
                  <div style={{ marginTop:10, fontSize:16, color:"#334155" }}>強気: 成長率x1.6 / 弱気: 成長率x0.4（自動計算）</div>
                </div>

                <div style={{ display:"flex", gap:4, marginBottom:16, flexWrap:"wrap" }}>
                  {[["scenario","シナリオ分析"],["margin","安全余裕率"],["monte","モンテカルロ"]].map(([k,v]) => (
                    <button key={k} style={{ ...S.navBtn, ...(simTab===k?S.navOn:{}) }} onClick={() => setSimTab(k)}>{v}</button>
                  ))}
                </div>

                {simTab === "scenario" && (
                  <div>
                    <div style={S.card}>
                      <div style={{ color:"#94a3b8", fontWeight:700, marginBottom:4 }}>株価推定（3シナリオ）</div>
                      <div style={{ color:"#475569", fontSize:16, marginBottom:12 }}>
                        強気: {Math.round(+simParams.growthRate*1.6)}% / 基本: {simParams.growthRate}% / 弱気: {Math.round(+simParams.growthRate*0.4)}%
                      </div>
                      <ResponsiveContainer width="100%" height={R.chartXl}>
                        <AreaChart data={simRows()}>
                          <defs>
                            <linearGradient id="gbull" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#4ade80" stopOpacity={0.2}/><stop offset="95%" stopColor="#4ade80" stopOpacity={0}/></linearGradient>
                            <linearGradient id="gbase" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#60a5fa" stopOpacity={0.2}/><stop offset="95%" stopColor="#60a5fa" stopOpacity={0}/></linearGradient>
                            <linearGradient id="gbear" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f87171" stopOpacity={0.15}/><stop offset="95%" stopColor="#f87171" stopOpacity={0}/></linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="year" tick={{ fill:"#94a3b8", fontSize:R.sm }} />
                          <YAxis tick={{ fill:"#64748b", fontSize:R.sm }} tickFormatter={v => v?.toLocaleString()} />
                          <Tooltip formatter={v => v?"¥"+v?.toLocaleString():"—"} contentStyle={TS} itemStyle={{ color:"#e2e8f0" }} />
                          <ReferenceLine y={n(f.price)||selected.currentPrice} stroke="#f59e0b" strokeDasharray="4 4" label={{ value:"現在株価", fill:"#f59e0b", fontSize:16 }} />
                          <ReferenceLine y={selected.avgCost} stroke="#a78bfa" strokeDasharray="4 4" label={{ value:"取得単価", fill:"#a78bfa", fontSize:16 }} />
                          <Legend wrapperStyle={{ color:"#94a3b8", fontSize:R.sm }} />
                          <Area type="monotone" dataKey="bull" stroke="#4ade80" strokeWidth={2} fill="url(#gbull)" name="強気" />
                          <Area type="monotone" dataKey="base" stroke="#60a5fa" strokeWidth={2} fill="url(#gbase)" name="基本" />
                          <Area type="monotone" dataKey="bear" stroke="#f87171" strokeWidth={2} fill="url(#gbear)" name="弱気" />
                          {simRows().some(d => d.evp) && <Line type="monotone" dataKey="evp" stroke="#a78bfa" strokeWidth={2} strokeDasharray="4 4" name="EV/EBITDA法" />}
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>

                    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(min(200px,45vw),1fr))", gap:12, marginBottom:16 }}>
                      {[["bull","強気","#4ade80"],["base","基本","#60a5fa"],["bear","弱気","#f87171"]].map(([key, label, color]) => {
                        const rows = simRows();
                        const last = rows[rows.length-1]?.[key];
                        const breakY = rows.findIndex(r => r[key] && r[key] > selected.avgCost);
                        const cagr = last && selected.currentPrice > 0 ? ((Math.pow(last/selected.currentPrice, 1/(+simParams.years||1))-1)*100).toFixed(1) : null;
                        return (
                          <div key={key} style={{ background:"#111827", border:"1px solid "+(color)+"33", borderRadius:8, padding:"12px 16px" }}>
                            <div style={{ color, fontWeight:700, marginBottom:8 }}>{label}シナリオ</div>
                            <div style={{ color:"#475569", fontSize:16, marginBottom:4 }}>最終推定株価</div>
                            <div style={{ color, fontWeight:700, fontSize:18, marginBottom:8 }}>{"¥"+(last?.toLocaleString()||"—")}</div>
                            <div style={{ color:"#475569", fontSize:16 }}>年率: <span style={{ color }}>{cagr?cagr+"%":"—"}</span></div>
                            <div style={{ color:"#475569", fontSize:16, marginTop:4 }}>取得単価超え: <span style={{ color }}>{breakY===0?"すでに超過":breakY>0?breakY+"年後":"期間内に未達"}</span></div>
                          </div>
                        );
                      })}
                    </div>

                    <div style={{ display:"grid", gridTemplateColumns:R.grid2, gap:16 }}>
                      <div style={S.card}>
                        <div style={{ color:"#94a3b8", fontWeight:700, marginBottom:4 }}>配当累計</div>
                        <div style={{ color:"#475569", fontSize:16, marginBottom:8 }}>利回り{simParams.dividendRate}% {simParams.reinvest?"複利":"単純"}</div>
                        <ResponsiveContainer width="100%" height={R.chartSm}>
                          <BarChart data={simRows()}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis dataKey="year" tick={{ fill:"#94a3b8", fontSize:R.sm }} />
                            <YAxis tick={{ fill:"#64748b", fontSize:R.sm }} tickFormatter={v => v?.toLocaleString()} />
                            <Tooltip formatter={v => "¥"+v?.toLocaleString()} contentStyle={TS} itemStyle={{ color:"#e2e8f0" }} />
                            <Bar dataKey="dc" fill="#fbbf24" radius={[4,4,0,0]} name="配当累計" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div style={S.card}>
                        <div style={{ color:"#94a3b8", fontWeight:700, marginBottom:4 }}>売上・営業利益推移</div>
                        <div style={{ color:"#475569", fontSize:16, marginBottom:8 }}>成長率{simParams.growthRate}% x 利益率{simParams.targetMargin}%</div>
                        <ResponsiveContainer width="100%" height={R.chartSm}>
                          <LineChart data={simRows()}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis dataKey="year" tick={{ fill:"#94a3b8", fontSize:R.sm }} />
                            <YAxis tick={{ fill:"#64748b", fontSize:R.sm }} tickFormatter={v => fmtM(v)} />
                            <Tooltip formatter={v => fmtM(v)} contentStyle={TS} itemStyle={{ color:"#e2e8f0" }} />
                            <Legend wrapperStyle={{ color:"#94a3b8", fontSize:R.sm }} />
                            <Line type="monotone" dataKey="ps" stroke="#60a5fa" strokeWidth={2} dot={false} name="売上" />
                            <Line type="monotone" dataKey="po" stroke="#4ade80" strokeWidth={2} dot={false} name="営業利益" />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div style={S.card}>
                      <div style={{ color:"#94a3b8", fontWeight:700, marginBottom:12 }}>サマリーテーブル</div>
                      <div style={{ overflowX:"auto" }}>
                        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:16 }}>
                          <thead>
                            <tr style={{ borderBottom:"1px solid #1e293b" }}>
                              {["年","強気株価","基本株価","弱気株価","EV法","EPS","売上","営業利益","配当累計"].map(h => (
                                <th key={h} style={{ textAlign:"right", padding:"6px 10px", color:"#475569", fontSize:16, whiteSpace:"nowrap" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {simRows().map((r, i) => (
                              <tr key={i} style={{ borderBottom:"1px solid #1e293b", background:i===0?"#111827":"transparent" }}>
                                <td style={{ padding:"8px 10px", color:"#94a3b8", fontWeight:i===0?700:400 }}>{r.year}</td>
                                <td style={{ textAlign:"right", padding:"8px 10px", color:"#4ade80", fontWeight:700 }}>{"¥"+(r.bull?.toLocaleString()||"—")}</td>
                                <td style={{ textAlign:"right", padding:"8px 10px", color:"#60a5fa", fontWeight:700 }}>{"¥"+(r.base?.toLocaleString()||"—")}</td>
                                <td style={{ textAlign:"right", padding:"8px 10px", color:"#f87171" }}>{"¥"+(r.bear?.toLocaleString()||"—")}</td>
                                <td style={{ textAlign:"right", padding:"8px 10px", color:"#a78bfa" }}>{r.evp?"¥"+r.evp.toLocaleString():"—"}</td>
                                <td style={{ textAlign:"right", padding:"8px 10px", color:"#e2e8f0" }}>{"¥"+r.pe}</td>
                                <td style={{ textAlign:"right", padding:"8px 10px", color:"#94a3b8" }}>{fmtM(r.ps)}</td>
                                <td style={{ textAlign:"right", padding:"8px 10px", color:"#94a3b8" }}>{fmtM(r.po)}</td>
                                <td style={{ textAlign:"right", padding:"8px 10px", color:"#fbbf24" }}>{"¥"+r.dc?.toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {simTab === "margin" && (
                  <div>
                    {!safetyMargin ? (
                      <div style={S.card}><span style={{ color:"#64748b" }}>純利益・発行済株式数・目標PERを入力すると計算されます。</span></div>
                    ) : (
                      <div>
                        <div style={{ display:"grid", gridTemplateColumns:R.grid3, gap:16, marginBottom:16 }}>
                          <div style={{ background:"#111827", borderRadius:8, padding:16, textAlign:"center" }}>
                            <div style={{ color:"#475569", fontSize:16, marginBottom:6 }}>適正株価（PERベース）</div>
                            <div style={{ color:"#f1f5f9", fontWeight:900, fontSize:28 }}>¥{safetyMargin.fair.toLocaleString()}</div>
                            <div style={{ color:"#475569", fontSize:16, marginTop:4 }}>目標PER {simParams.targetPer}倍 x EPS</div>
                          </div>
                          <div style={{ background:"#111827", borderRadius:8, padding:16, textAlign:"center" }}>
                            <div style={{ color:"#475569", fontSize:16, marginBottom:6 }}>現在株価</div>
                            <div style={{ color:"#f1f5f9", fontWeight:900, fontSize:28 }}>¥{safetyMargin.price.toLocaleString()}</div>
                          </div>
                          <div style={{ background:safetyMargin.margin>0?"#0f2a1a":"#2a0f0f", border:"1px solid "+(safetyMargin.margin>0?"#4ade80":"#f87171")+"44", borderRadius:8, padding:16, textAlign:"center" }}>
                            <div style={{ color:"#475569", fontSize:16, marginBottom:6 }}>安全余裕率</div>
                            <div style={{ color:safetyMargin.margin>0?"#4ade80":"#f87171", fontWeight:900, fontSize:28 }}>{safetyMargin.margin>0?"+":""}{safetyMargin.margin.toFixed(1)}%</div>
                            <div style={{ color:"#475569", fontSize:16, marginTop:4 }}>{safetyMargin.margin>0?"割安（買い余地あり）":"割高（適正価格超え）"}</div>
                          </div>
                        </div>
                        <div style={S.card}>
                          <div style={{ color:"#94a3b8", fontWeight:700, marginBottom:12 }}>株価ポジショニング</div>
                          <div style={{ position:"relative", height:60, background:"#111827", borderRadius:8, overflow:"hidden", marginBottom:8 }}>
                            <div style={{ position:"absolute", inset:0, background:"linear-gradient(to right, #f87171, #fbbf24, #4ade80)", opacity:0.15 }} />
                            <div style={{ position:"absolute", top:0, bottom:0, left:"50%", width:2, background:"#4ade80", opacity:0.6 }} />
                            <div style={{ position:"absolute", top:4, left:"50%", transform:"translateX(-50%)", color:"#4ade80", fontSize:16, whiteSpace:"nowrap" }}>適正 ¥{safetyMargin.fair.toLocaleString()}</div>
                            <div style={{ position:"absolute", top:0, bottom:0, left:(50-Math.min(Math.max(safetyMargin.margin,-50),50))+"%", width:3, background:"#f59e0b", borderRadius:2 }}>
                              <div style={{ position:"absolute", bottom:4, left:"50%", transform:"translateX(-50%)", color:"#f59e0b", fontSize:16, whiteSpace:"nowrap" }}>現在 ¥{safetyMargin.price.toLocaleString()}</div>
                            </div>
                          </div>
                          <div style={{ display:"flex", justifyContent:"space-between", fontSize:16, color:"#334155" }}>
                            <span>割高</span><span>適正</span><span>割安</span>
                          </div>
                        </div>
                        {c.eps && c.eps > 0 && (
                          <div style={S.card}>
                            <div style={{ color:"#94a3b8", fontWeight:700, marginBottom:12 }}>PER感度分析</div>
                            <ResponsiveContainer width="100%" height={R.chartSm}>
                              <BarChart data={[10,12,15,18,20,25,30].map(p => ({ per:p+"倍", v:Math.round(c.eps*p) }))}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                <XAxis dataKey="per" tick={{ fill:"#94a3b8", fontSize:R.sm }} />
                                <YAxis tick={{ fill:"#64748b", fontSize:R.sm }} tickFormatter={v => v.toLocaleString()} />
                                <Tooltip formatter={v => "¥"+v.toLocaleString()} contentStyle={TS} itemStyle={{ color:"#e2e8f0" }} />
                                <ReferenceLine y={safetyMargin.price} stroke="#f59e0b" strokeDasharray="4 4" label={{ value:"現在株価", fill:"#f59e0b", fontSize:16 }} />
                                <Bar dataKey="v" fill="#60a5fa" radius={[4,4,0,0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {simTab === "monte" && (
                  <div>
                    {!monteData ? (
                      <div style={S.card}><span style={{ color:"#64748b" }}>純利益・発行済株式数を入力するとシミュレーションできます。</span></div>
                    ) : (
                      <div>
                        <div style={S.card}>
                          <div style={{ color:"#94a3b8", fontWeight:700, marginBottom:4 }}>モンテカルロシミュレーション（1,000回試行）</div>
                          <div style={{ color:"#475569", fontSize:16, marginBottom:16 }}>成長率にランダムなブレとPERの変動を加えた{simParams.years}年後の株価分布です。</div>
                          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(min(140px,45vw),1fr))", gap:10, marginBottom:20 }}>
                            {[
                              ["10%ile",     monteData.p10,  "#f87171"],
                              ["25%ile",     monteData.p25,  "#fbbf24"],
                              ["中央値(50%)",monteData.p50,  "#60a5fa"],
                              ["75%ile",     monteData.p75,  "#4ade80"],
                              ["90%ile",     monteData.p90,  "#a78bfa"],
                              ["平均値",     monteData.mean, "#e2e8f0"],
                            ].map(([label, val, color]) => (
                              <div key={label} style={{ background:"#111827", borderRadius:8, padding:"10px 12px" }}>
                                <div style={{ color:"#475569", fontSize:16, marginBottom:4 }}>{label}</div>
                                <div style={{ color, fontWeight:700, fontSize:16 }}>¥{val?.toLocaleString()}</div>
                              </div>
                            ))}
                          </div>
                          <div style={{ background:"#111827", borderRadius:8, padding:"12px 16px", marginBottom:16 }}>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                              <span style={{ color:"#94a3b8", fontSize:16 }}>現在株価より上昇する確率</span>
                              <span style={{ color:monteData.probUp>50?"#4ade80":"#f87171", fontWeight:700, fontSize:20 }}>{monteData.probUp.toFixed(1)}%</span>
                            </div>
                            <div style={{ height:8, background:"#1e293b", borderRadius:4, overflow:"hidden" }}>
                              <div style={{ height:"100%", width:""+(monteData.probUp)+"%", background:monteData.probUp>50?"#4ade80":"#f87171", borderRadius:4 }} />
                            </div>
                            <div style={{ display:"flex", justifyContent:"space-between", marginTop:4, fontSize:16, color:"#334155" }}>
                              <span>現在 ¥{monteData.price.toLocaleString()}</span>
                              <span>{(100-monteData.probUp).toFixed(1)}% が下落</span>
                            </div>
                          </div>
                          <div style={{ color:"#94a3b8", fontSize:16, marginBottom:12 }}>{simParams.years}年後の株価分布（ヒストグラム）</div>
                          <ResponsiveContainer width="100%" height={R.chartMd}>
                            <BarChart data={monteData.bins}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                              <XAxis dataKey="range" tick={{ fill:"#64748b", fontSize:R.sm }} interval={3} />
                              <YAxis tick={{ fill:"#64748b", fontSize:R.sm }} tickFormatter={v => v+"件"} />
                              <Tooltip formatter={v => v+"件"} contentStyle={TS} itemStyle={{ color:"#e2e8f0" }} />
                              <Bar dataKey="count" fill="#60a5fa" radius={[2,2,0,0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
