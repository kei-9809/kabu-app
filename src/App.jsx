import { useState, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend
} from "recharts";

// ── utils ─────────────────────────────────────────────────────────────────────
const n = v => (v === "" || v == null) ? null : parseFloat(v);
const pct = v => v == null || isNaN(v) ? "—" : (v * 100).toFixed(2) + "%";
const x = v => v == null || isNaN(v) ? "—" : v.toFixed(2) + "x";
const yen = v => v == null || isNaN(v) ? "—" : Math.round(v).toLocaleString();
const fmtM = v => { if (v == null || isNaN(v)) return "—"; const a = Math.abs(v); return a >= 1e12 ? (v/1e12).toFixed(2)+"兆" : a >= 1e8 ? (v/1e8).toFixed(1)+"億" : a >= 1e4 ? (v/1e4).toFixed(0)+"万" : v.toFixed(0); };
const safe = (a, b) => (n(a) != null && n(b) != null && n(b) !== 0) ? n(a) / n(b) : null;

function calcAll(f) {
  const price = n(f.price);
  const shares = n(f.shares); // 千株
  const eps = n(f.eps);
  const bps = n(f.bps);
  const sales = n(f.sales);
  const grossProfit = n(f.grossProfit);
  const sgaExpense = n(f.sgaExpense);
  const laborCost = n(f.laborCost);
  const operatingProfit = n(f.operatingProfit);
  const interestIncome = n(f.interestIncome);
  const ordinaryProfit = n(f.ordinaryProfit);
  const netProfit = n(f.netProfit);
  const totalAssets = n(f.totalAssets);
  const operatingAssets = n(f.operatingAssets);
  const equity = n(f.equity);
  const currentAssets = n(f.currentAssets);
  const fixedAssets = n(f.fixedAssets);
  const currentLiabilities = n(f.currentLiabilities);
  const fixedLiabilities = n(f.fixedLiabilities);
  const cashDeposits = n(f.cashDeposits);
  const receivables = n(f.receivables);
  const inventory = n(f.inventory);
  const tangibleFixedAssets = n(f.tangibleFixedAssets);
  const quickAssets = n(f.quickAssets);
  const interestExpense = n(f.interestExpense);
  const depreciation = n(f.depreciation);
  const dividend = n(f.dividend);
  const epsGrowth = n(f.epsGrowth);
  const netDebt = n(f.netDebt);
  const ebitda = n(f.ebitda) ?? ((operatingProfit != null && depreciation != null) ? operatingProfit + depreciation : null);
  const businessProfit = operatingProfit != null && interestIncome != null ? operatingProfit + interestIncome : operatingProfit;
  const financialCost = interestExpense;
  const marketCap = (price != null && shares != null) ? price * shares * 1000 : null;
  const ev = (marketCap != null && netDebt != null) ? marketCap + netDebt : null;

  // 収益性
  const roa = safe(ordinaryProfit ?? businessProfit, totalAssets);
  const roe = safe(netProfit, equity);
  const roic = safe(operatingProfit, operatingAssets);
  const grossMargin = safe(grossProfit, sales);
  const operatingMargin = safe(operatingProfit, sales);
  const ordinaryMargin = safe(ordinaryProfit, sales);
  const sgaRatio = safe(sgaExpense, sales);
  const laborRatio = safe(laborCost, sales);
  const financialCostRatio = safe(financialCost, sales);
  const ebitdaMargin = safe(ebitda, sales);

  // 効率性
  const totalAssetTurnover = safe(sales, totalAssets);
  const operatingAssetTurnover = safe(sales, operatingAssets);
  const receivableTurnover = safe(sales, receivables);
  const inventoryTurnover = safe(sales, inventory);
  const tangibleFixedAssetTurnover = safe(sales, tangibleFixedAssets);

  // 安全性
  const currentRatio = safe(currentAssets, currentLiabilities);
  const quickRatio = safe(quickAssets, currentLiabilities);
  const fixedRatio = safe(fixedAssets, equity);
  const fixedLongTermRatio = (fixedAssets != null && equity != null && fixedLiabilities != null) ? fixedAssets / (equity + fixedLiabilities) : null;
  const equityRatio = safe(equity, totalAssets);
  const debtRatio = (totalAssets != null && equity != null) ? (totalAssets - equity) / equity : null;
  const icr = safe(businessProfit, financialCost);

  // 株価指標
  const per = safe(price, eps);
  const pbr = safe(price, bps);
  const psr = (marketCap != null && sales != null && sales !== 0) ? marketCap / sales : null;
  const evEbitda = safe(ev, ebitda);
  const dividendYield = safe(dividend, price);
  const payoutRatio = safe(dividend != null && shares != null ? dividend * shares * 1000 : null, netProfit);
  const peg = (per != null && epsGrowth != null && epsGrowth !== 0) ? per / epsGrowth : null;

  return {
    marketCap, ev, ebitda, businessProfit, financialCost,
    roa, roe, roic, grossMargin, operatingMargin, ordinaryMargin, sgaRatio, laborRatio, financialCostRatio, ebitdaMargin,
    totalAssetTurnover, operatingAssetTurnover, receivableTurnover, inventoryTurnover, tangibleFixedAssetTurnover,
    currentRatio, quickRatio, fixedRatio, fixedLongTermRatio, equityRatio, debtRatio, icr,
    per, pbr, psr, evEbitda, dividendYield, payoutRatio, peg
  };
}

const EMPTY_F = {
  price:"", shares:"", eps:"", bps:"", sales:"", grossProfit:"", sgaExpense:"", laborCost:"",
  operatingProfit:"", interestIncome:"", ordinaryProfit:"", netProfit:"", totalAssets:"",
  operatingAssets:"", equity:"", currentAssets:"", fixedAssets:"", currentLiabilities:"",
  fixedLiabilities:"", cashDeposits:"", receivables:"", inventory:"", tangibleFixedAssets:"",
  quickAssets:"", interestExpense:"", depreciation:"", ebitda:"", netDebt:"", dividend:"", epsGrowth:""
};

const INITIAL_PORTFOLIO = [
  { id:1, ticker:"7203", name:"トヨタ自動車", market:"JP", qty:100, avgCost:2850, currentPrice:3124, sector:"自動車",
    financials:{ price:"3124", shares:"14430000", eps:"306", bps:"2841", sales:"4390000000000", grossProfit:"900000000000", sgaExpense:"550000000000", laborCost:"200000000000", operatingProfit:"350000000000", interestIncome:"10000000000", ordinaryProfit:"360000000000", netProfit:"400000000000", totalAssets:"9000000000000", operatingAssets:"7000000000000", equity:"3700000000000", currentAssets:"5000000000000", fixedAssets:"4000000000000", currentLiabilities:"3000000000000", fixedLiabilities:"2300000000000", cashDeposits:"1500000000000", receivables:"800000000000", inventory:"400000000000", tangibleFixedAssets:"2000000000000", quickAssets:"2300000000000", interestExpense:"50000000000", depreciation:"100000000000", ebitda:"450000000000", netDebt:"1500000000000", dividend:"75", epsGrowth:"8" },
    irList:[] },
  { id:2, ticker:"AAPL", name:"Apple Inc.", market:"US", qty:20, avgCost:168, currentPrice:189, sector:"Technology",
    financials:{ price:"189", shares:"15200000", eps:"6.43", bps:"4.0", sales:"385600000000", grossProfit:"170800000000", sgaExpense:"25000000000", laborCost:"", operatingProfit:"114300000000", interestIncome:"3750000000", ordinaryProfit:"118050000000", netProfit:"97000000000", totalAssets:"352600000000", operatingAssets:"300000000000", equity:"62100000000", currentAssets:"143600000000", fixedAssets:"209000000000", currentLiabilities:"145300000000", fixedLiabilities:"145100000000", cashDeposits:"61000000000", receivables:"60600000000", inventory:"6300000000", tangibleFixedAssets:"43700000000", quickAssets:"121900000000", interestExpense:"3900000000", depreciation:"11100000000", ebitda:"125400000000", netDebt:"-59000000000", dividend:"1.0", epsGrowth:"10" },
    irList:[] },
  { id:3, ticker:"NVDA", name:"NVIDIA Corp.", market:"US", qty:10, avgCost:450, currentPrice:875, sector:"Technology",
    financials:{ price:"875", shares:"24400000", eps:"13.4", bps:"22.9", sales:"60900000000", grossProfit:"45400000000", sgaExpense:"5900000000", laborCost:"", operatingProfit:"32000000000", interestIncome:"900000000", ordinaryProfit:"32900000000", netProfit:"29760000000", totalAssets:"65700000000", operatingAssets:"55000000000", equity:"42900000000", currentAssets:"45000000000", fixedAssets:"20700000000", currentLiabilities:"10600000000", fixedLiabilities:"12200000000", cashDeposits:"26000000000", receivables:"11200000000", inventory:"5300000000", tangibleFixedAssets:"4000000000", quickAssets:"37200000000", interestExpense:"", depreciation:"1900000000", ebitda:"33900000000", netDebt:"-14900000000", dividend:"0.04", epsGrowth:"35" },
    irList:[] },
];

// ── sub components ─────────────────────────────────────────────────────────────
const Tag = ({ children, color="#4ade80" }) => (
  <span style={{ background:color+"22", color, border:`1px solid ${color}44`, borderRadius:4, padding:"2px 8px", fontSize:11, fontWeight:600 }}>{children}</span>
);
const Δ = ({ val, fmt: f = v => v.toFixed(2) }) => (
  <span style={{ color:val>=0?"#4ade80":"#f87171", fontWeight:700 }}>{val>=0?"▲":"▼"} {f(Math.abs(val))}</span>
);

const MBox = ({ label, value, color="#94a3b8", hint="", badge="" }) => (
  <div style={{ background:"#111827", borderRadius:8, padding:"10px 14px" }}>
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
      <span style={{ color:"#475569", fontSize:11 }}>{label}</span>
      {badge && <span style={{ background:"#0f2a1a", color:"#4ade80", fontSize:9, padding:"1px 5px", borderRadius:3 }}>{badge}</span>}
    </div>
    <div style={{ color, fontWeight:700, fontSize:15, marginTop:3 }}>{value}</div>
    {hint && <div style={{ color:"#334155", fontSize:10, marginTop:2 }}>{hint}</div>}
  </div>
);

const Section = ({ title, children }) => (
  <div style={{ marginBottom:24 }}>
    <div style={{ fontSize:13, fontWeight:700, color:"#60a5fa", marginBottom:10, paddingBottom:6, borderBottom:"1px solid #1e293b" }}>{title}</div>
    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(145px,1fr))", gap:10 }}>{children}</div>
  </div>
);

const FInput = ({ label, value, onChange, unit="" }) => (
  <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
    <label style={{ color:"#64748b", fontSize:10 }}>{label}{unit && <span style={{color:"#334155"}}> ({unit})</span>}</label>
    <input value={value} onChange={e=>onChange(e.target.value)} style={S.input} />
  </div>
);

const scoreColor = v => v >= 80 ? "#4ade80" : v >= 50 ? "#fbbf24" : "#f87171";

function financialScore(c) {
  let score = 0, total = 0;
  const add = (cond, pts) => { if (cond != null) { if (cond) score += pts; total += pts; } };
  add(c.per != null && c.per < 20, 10);
  add(c.pbr != null && c.pbr < 2, 10);
  add(c.psr != null && c.psr < 3, 8);
  add(c.evEbitda != null && c.evEbitda < 15, 10);
  add(c.roe != null && c.roe > 0.10, 10);
  add(c.roa != null && c.roa > 0.05, 8);
  add(c.grossMargin != null && c.grossMargin > 0.30, 8);
  add(c.operatingMargin != null && c.operatingMargin > 0.10, 8);
  add(c.currentRatio != null && c.currentRatio > 1.5, 8);
  add(c.equityRatio != null && c.equityRatio > 0.30, 8);
  add(c.icr != null && c.icr > 3, 6);
  add(c.peg != null && c.peg < 1.5, 6);
  return total > 0 ? Math.round((score / total) * 100) : null;
}

const COLORS = ["#4ade80","#60a5fa","#f59e0b","#a78bfa"];

// ── main ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("portfolio");
  const [portfolio, setPortfolio] = useState(INITIAL_PORTFOLIO);
  const [selected, setSelected] = useState(INITIAL_PORTFOLIO[0]);
  const [detailTab, setDetailTab] = useState("overview");
  const [compareIds, setCompareIds] = useState([]);
  const [simParams, setSimParams] = useState({ years:"5", growthRate:"15", targetMargin:"15", targetPer:"20", targetEvEbitda:"", dividendRate:"2", reinvest:true, scenario:"base" });
  const [irForm, setIrForm] = useState({ date:"", title:"", url:"", type:"決算" });
  const [showIrForm, setShowIrForm] = useState(false);
  const [addForm, setAddForm] = useState({ ticker:"", name:"", market:"JP", qty:"", avgCost:"", currentPrice:"" });
  const [showAdd, setShowAdd] = useState(false);

  const totalCost = portfolio.reduce((s,h)=>s+h.qty*h.avgCost,0);
  const totalValue = portfolio.reduce((s,h)=>s+h.qty*h.currentPrice,0);
  const totalPnL = totalValue - totalCost;
  const totalPnLPct = (totalPnL/totalCost)*100;

  const updateF = useCallback((id, key, val) => {
    setPortfolio(p=>p.map(h=>h.id===id?{...h,financials:{...h.financials,[key]:val}}:h));
    if (selected?.id===id) setSelected(s=>({...s,financials:{...s.financials,[key]:val}}));
  },[selected]);

  const handleSelect = h => { setSelected(h); };

  const handleAddStock = () => {
    const {ticker,name,market,qty,avgCost,currentPrice}=addForm;
    if (!ticker||!name||!qty||!avgCost||!currentPrice) return;
    setPortfolio(p=>[...p,{id:Date.now(),ticker,name,market,qty:+qty,avgCost:+avgCost,currentPrice:+currentPrice,sector:"—",financials:{...EMPTY_F,price:currentPrice},irList:[]}]);
    setAddForm({ticker:"",name:"",market:"JP",qty:"",avgCost:"",currentPrice:""});
    setShowAdd(false);
  };

  const handleDeleteStock = useCallback((id) => {
    if (!window.confirm("この銘柄を削除しますか？")) return;
    setPortfolio(p => p.filter(h => h.id !== id));
    setCompareIds(p => p.filter(x => x !== id));
    if (selected?.id === id) {
      setSelected(prev => {
        const remaining = portfolio.filter(h => h.id !== id);
        return remaining.length > 0 ? remaining[0] : null;
      });
    }
  }, [selected, portfolio]);

  const addIR = () => {
    if (!irForm.title||!irForm.date) return;
    setPortfolio(p=>p.map(h=>h.id===selected.id?{...h,irList:[irForm,...(h.irList||[])]}:h));
    setSelected(s=>({...s,irList:[irForm,...(s.irList||[])]}));
    setIrForm({date:"",title:"",url:"",type:"決算"}); setShowIrForm(false);
  };

  const deleteIR = idx => {
    setPortfolio(p=>p.map(h=>h.id===selected.id?{...h,irList:h.irList.filter((_,i)=>i!==idx)}:h));
    setSelected(s=>({...s,irList:s.irList.filter((_,i)=>i!==idx)}));
  };

  const toggleCompare = id => setCompareIds(p=>p.includes(id)?p.filter(x=>x!==id):p.length<4?[...p,id]:p);

  // simulation
  const simData = useCallback(() => {
    if (!selected) return [];
    const f = selected.financials;
    const price = n(f.price) || selected.currentPrice;
    const sales = n(f.sales) || 0;
    const shares = n(f.shares) || 1;
    const eps = n(f.eps) || 0;
    const ebitdaCur = n(f.ebitda) || 0;
    const netDebt = n(f.netDebt) || 0;
    const g = +simParams.growthRate / 100;
    const gBear = g * 0.4;
    const gBull = g * 1.6;
    const tMargin = +simParams.targetMargin / 100;
    const curMargin = sales > 0 && n(f.operatingProfit) ? n(f.operatingProfit)/sales : tMargin * 0.5;
    const tPer = +simParams.targetPer;
    const tEvEb = simParams.targetEvEbitda ? +simParams.targetEvEbitda : null;
    const divRate = +simParams.dividendRate / 100;
    const years = +simParams.years || 5;
    const rows = [];
    for (let y = 0; y <= years; y++) {
      const gf = Math.pow(1+g, y);
      const gfBear = Math.pow(1+gBear, y);
      const gfBull = Math.pow(1+gBull, y);
      // margin interpolation
      const marginProgress = years > 0 ? y / years : 1;
      const projMargin = curMargin + (tMargin - curMargin) * marginProgress;
      const projSales = sales * gf;
      const projSalesBear = sales * gfBear;
      const projSalesBull = sales * gfBull;
      const projOP = projSales * projMargin;
      const projEps = eps > 0 ? eps * gf : (projSales * projMargin / shares);
      const projEpsBear = eps > 0 ? eps * gfBear : (projSalesBear * projMargin * 0.7 / shares);
      const projEpsBull = eps > 0 ? eps * gfBull : (projSalesBull * tMargin / shares);
      const priceBase = projEps > 0 ? projEps * tPer : null;
      const priceBear = projEpsBear > 0 ? projEpsBear * tPer * 0.8 : null;
      const priceBull = projEpsBull > 0 ? projEpsBull * tPer * 1.2 : null;
      const projEbitda = ebitdaCur * gf;
      const marketCapFromEv = tEvEb != null ? (projEbitda * tEvEb - netDebt) : null;
      const priceFromEv = (marketCapFromEv != null && shares > 0) ? marketCapFromEv / shares : null;
      const divCum = simParams.reinvest ? price*(Math.pow(1+divRate,y)-1) : price*divRate*y;
      rows.push({
        year: y===0?"現在":`${y}年後`,
        base株価: priceBase ? Math.round(priceBase) : null,
        bear株価: priceBear ? Math.round(priceBear) : null,
        bull株価: priceBull ? Math.round(priceBull) : null,
        EV推定株価: priceFromEv ? Math.round(priceFromEv) : null,
        配当累計: Math.round(divCum),
        売上: Math.round(projSales),
        営業利益: Math.round(projOP),
        EPS: parseFloat(projEps.toFixed(2)),
        EBITDAマージン: parseFloat((projOP / projSales * 100).toFixed(1)),
      });
    }
    return rows;
  },[selected, simParams]);

  const f = selected?.financials || {};
  const c = selected ? calcAll(f) : {};
  const score = financialScore(c);
  const compareStocks = portfolio.filter(h=>compareIds.includes(h.id));
  const typeColor = t=>t==="決算"?"#4ade80":t==="配当"?"#fbbf24":t==="人事"?"#a78bfa":"#64748b";

  const INPUT_FIELDS = [
    [["株価","price",selected?.market==="US"?"$":"円"],["発行済株式数","shares","株"],["EPS（1株純利益）","eps",selected?.market==="US"?"$":"円"]],
    [["BPS（1株純資産）","bps",selected?.market==="US"?"$":"円"],["配当（1株）","dividend",""],["EPS成長率（来期予想）","epsGrowth","%"]],
    [["売上高","sales",""],["売上総利益","grossProfit",""],["販管費","sgaExpense",""]],
    [["人件費","laborCost",""],["営業利益","operatingProfit",""],["受取利息・配当","interestIncome",""]],
    [["経常利益","ordinaryProfit",""],["当期純利益","netProfit",""],["総資本（総資産）","totalAssets",""]],
    [["経営資本","operatingAssets",""],["自己資本（純資産）","equity",""],["流動資産","currentAssets",""]],
    [["固定資産","fixedAssets",""],["流動負債","currentLiabilities",""],["固定負債","fixedLiabilities",""]],
    [["現金及び預金","cashDeposits",""],["売上債権","receivables",""],["棚卸資産","inventory",""]],
    [["有形固定資産","tangibleFixedAssets",""],["当座資産","quickAssets",""],["支払利息","interestExpense",""]],
    [["減価償却費","depreciation",""],["EBITDA","ebitda",""],["純有利子負債","netDebt",""]],
  ];

  return (
    <div style={S.root}>
      <header style={S.header}>
        <div style={S.logo}><span style={{fontSize:22}}>📈</span><span style={S.logoText}>KABU<span style={{color:"#4ade80"}}>LENS</span></span></div>
        <nav style={S.nav}>
          {["portfolio","detail","compare","simulation"].map(t=>(
            <button key={t} style={{...S.navBtn,...(tab===t?S.navActive:{})}} onClick={()=>setTab(t)}>
              {{"portfolio":"ポートフォリオ","detail":"銘柄詳細","compare":"他社比較","simulation":"シミュレーション"}[t]}
            </button>
          ))}
        </nav>
      </header>

      <div style={S.summaryBar}>
        <div style={S.summaryItem}><span style={S.summaryLabel}>評価額合計</span><span style={S.summaryValue}>¥{Math.round(totalValue).toLocaleString()}</span></div>
        <div style={S.summaryItem}><span style={S.summaryLabel}>損益</span><span style={S.summaryValue}><Δ val={totalPnL} fmt={v=>"¥"+Math.round(v).toLocaleString()}/></span></div>
        <div style={S.summaryItem}><span style={S.summaryLabel}>損益率</span><span style={S.summaryValue}><Δ val={totalPnLPct} fmt={v=>v.toFixed(2)+"%"}/></span></div>
        <div style={S.summaryItem}><span style={S.summaryLabel}>保有銘柄数</span><span style={S.summaryValue}>{portfolio.length}</span></div>
      </div>

      <main style={S.main}>

        {/* ── PORTFOLIO ── */}
        {tab==="portfolio"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h2 style={S.sectionTitle}>保有銘柄一覧</h2>
              <button style={S.addBtn} onClick={()=>setShowAdd(v=>!v)}>＋ 銘柄追加</button>
            </div>
            {showAdd&&(
              <div style={S.addForm}>
                {[["ticker","ティッカー"],["name","銘柄名"],["qty","数量"],["avgCost","取得単価"],["currentPrice","現在値"]].map(([k,l])=>(
                  <input key={k} placeholder={l} value={addForm[k]} style={S.input} onChange={e=>setAddForm(p=>({...p,[k]:e.target.value}))}/>
                ))}
                <select value={addForm.market} style={S.select} onChange={e=>setAddForm(p=>({...p,market:e.target.value}))}>
                  <option value="JP">日本株</option><option value="US">米国株</option>
                </select>
                <button style={S.addBtn} onClick={handleAddStock}>追加</button>
              </div>
            )}
            <div style={S.table}>
              <div style={S.tableHeader}>
                {["銘柄","市場","保有数","取得単価","現在値","評価額","損益","損益率","スコア",""].map(h=>(<span key={h} style={S.th}>{h}</span>))}
              </div>
              {portfolio.map(h=>{
                const pnl=(h.currentPrice-h.avgCost)*h.qty;
                const pnlPct=((h.currentPrice-h.avgCost)/h.avgCost)*100;
                const sc=financialScore(calcAll(h.financials));
                return (
                  <div key={h.id} style={{...S.tableRow,...(selected?.id===h.id?S.tableRowActive:{})}}>
                    <span style={{fontWeight:700,color:"#e2e8f0"}}>{h.name}<br/><Tag color={h.market==="JP"?"#60a5fa":"#f59e0b"}>{h.ticker}</Tag></span>
                    <span><Tag color={h.market==="JP"?"#60a5fa":"#f59e0b"}>{h.market}</Tag></span>
                    <span style={{color:"#94a3b8"}}>{h.qty.toLocaleString()}</span>
                    <span style={{color:"#94a3b8"}}>{h.avgCost.toLocaleString()}</span>
                    <span style={{fontWeight:700,color:"#e2e8f0"}}>{h.currentPrice.toLocaleString()}</span>
                    <span>{(h.qty*h.currentPrice).toLocaleString()}</span>
                    <span><Δ val={pnl} fmt={v=>Math.round(v).toLocaleString()}/></span>
                    <span><Δ val={pnlPct} fmt={v=>v.toFixed(2)+"%"}/></span>
                    <span style={{color:sc!=null?scoreColor(sc):"#475569",fontWeight:700}}>{sc!=null?sc+"pt":"—"}</span>
                    <span style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                      <button style={S.miniBtn} onClick={()=>{handleSelect(h);setTab("detail");}}>詳細</button>
                      <button style={{...S.miniBtn,...(compareIds.includes(h.id)?{color:"#4ade80",borderColor:"#4ade80"}:{})}} onClick={()=>toggleCompare(h.id)}>{compareIds.includes(h.id)?"比較中":"比較"}</button>
                      <button style={{...S.miniBtn,color:"#f87171",borderColor:"#f87171"}} onClick={()=>handleDeleteStock(h.id)}>削除</button>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── DETAIL ── */}
        {tab==="detail"&&(
          <div>
            <h2 style={S.sectionTitle}>銘柄詳細</h2>
            <div style={S.stockSelector}>
              {portfolio.map(h=>(
                <button key={h.id} style={{...S.chipBtn,...(selected?.id===h.id?S.chipActive:{})}} onClick={()=>handleSelect(h)}>{h.ticker}</button>
              ))}
            </div>
            {selected&&(
              <>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <span style={{fontSize:20,fontWeight:800,color:"#f1f5f9"}}>{selected.name}</span>
                    <Tag color={selected.market==="JP"?"#60a5fa":"#f59e0b"}>{selected.ticker}</Tag>
                    {score!=null&&<span style={{background:scoreColor(score)+"22",color:scoreColor(score),border:`1px solid ${scoreColor(score)}44`,borderRadius:6,padding:"4px 10px",fontSize:13,fontWeight:700}}>総合スコア {score}pt</span>}
                  </div>
                </div>
                <div style={{display:"flex",gap:4,marginBottom:20,borderBottom:"1px solid #1e293b",paddingBottom:8,flexWrap:"wrap"}}>
                  {["overview","profitability","efficiency","safety","valuation","input","ir"].map(t=>(
                    <button key={t} style={{...S.navBtn,...(detailTab===t?S.navActive:{})}} onClick={()=>setDetailTab(t)}>
                      {{"overview":"概要","profitability":"収益性","efficiency":"効率性","safety":"安全性","valuation":"株価指標","input":"数値入力","ir":"IRニュース"}[t]}
                    </button>
                  ))}
                </div>

                {/* OVERVIEW */}
                {detailTab==="overview"&&(
                  <div>
                    <div style={{...S.card,marginBottom:16}}>
                      <div style={{color:"#64748b",fontSize:12,marginBottom:12}}>主要指標サマリー（数値入力タブから入力してください）</div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(145px,1fr))",gap:10}}>
                        <MBox label="PER" value={c.per?x(c.per):"—"} color={c.per&&c.per<15?"#4ade80":c.per&&c.per<25?"#fbbf24":"#f87171"} hint="株価収益率" badge={c.per&&c.per<15?"割安":""}/>
                        <MBox label="PBR" value={c.pbr?x(c.pbr):"—"} color={c.pbr&&c.pbr<1.5?"#4ade80":"#94a3b8"} hint="株価純資産倍率"/>
                        <MBox label="PSR" value={c.psr?x(c.psr):"—"} color={c.psr&&c.psr<2?"#4ade80":"#94a3b8"} hint="株価売上高倍率"/>
                        <MBox label="EV/EBITDA" value={c.evEbitda?x(c.evEbitda):"—"} color={c.evEbitda&&c.evEbitda<10?"#4ade80":"#94a3b8"} hint="企業価値倍率"/>
                        <MBox label="ROE" value={c.roe?pct(c.roe):"—"} color={c.roe&&c.roe>0.15?"#4ade80":"#94a3b8"} hint="自己資本利益率"/>
                        <MBox label="ROA" value={c.roa?pct(c.roa):"—"} color={c.roa&&c.roa>0.05?"#4ade80":"#94a3b8"} hint="総資本利益率"/>
                        <MBox label="営業利益率" value={c.operatingMargin?pct(c.operatingMargin):"—"} color={c.operatingMargin&&c.operatingMargin>0.10?"#4ade80":"#94a3b8"} hint=""/>
                        <MBox label="自己資本比率" value={c.equityRatio?pct(c.equityRatio):"—"} color={c.equityRatio&&c.equityRatio>0.40?"#4ade80":"#94a3b8"} hint=""/>
                        <MBox label="時価総額" value={c.marketCap?fmtM(c.marketCap):"—"} color="#e2e8f0"/>
                        <MBox label="EV" value={c.ev?fmtM(c.ev):"—"} color="#e2e8f0" hint="企業価値"/>
                        <MBox label="EBITDA" value={c.ebitda?fmtM(c.ebitda):"—"} color="#60a5fa"/>
                        <MBox label="PEGレシオ" value={c.peg?x(c.peg):"—"} color={c.peg&&c.peg<1?"#4ade80":c.peg&&c.peg<2?"#fbbf24":"#f87171"} hint="1倍以下割安"/>
                      </div>
                    </div>
                  </div>
                )}

                {/* PROFITABILITY */}
                {detailTab==="profitability"&&(
                  <div>
                    <Section title="① 資本利益率">
                      <MBox label="総資本経常利益率(ROA)" value={c.roa?pct(c.roa):"—"} color={c.roa&&c.roa>0.05?"#4ade80":"#94a3b8"} hint="5%超で優良"/>
                      <MBox label="総資本事業利益率" value={c.roa?pct(c.roa):"—"} color="#94a3b8"/>
                      <MBox label="経営資本営業利益率" value={c.roic?pct(c.roic):"—"} color={c.roic&&c.roic>0.08?"#4ade80":"#94a3b8"}/>
                      <MBox label="ROE（自己資本利益率）" value={c.roe?pct(c.roe):"—"} color={c.roe&&c.roe>0.15?"#4ade80":"#94a3b8"} hint="15%超で優良"/>
                    </Section>
                    <Section title="② 売上高利益率">
                      <MBox label="売上高総利益率（粗利率）" value={c.grossMargin?pct(c.grossMargin):"—"} color={c.grossMargin&&c.grossMargin>0.40?"#4ade80":"#94a3b8"}/>
                      <MBox label="売上高営業利益率" value={c.operatingMargin?pct(c.operatingMargin):"—"} color={c.operatingMargin&&c.operatingMargin>0.10?"#4ade80":"#94a3b8"} hint="10%超で優良"/>
                      <MBox label="売上高経常利益率" value={c.ordinaryMargin?pct(c.ordinaryMargin):"—"} color="#94a3b8"/>
                      <MBox label="売上高販管費比率" value={c.sgaRatio?pct(c.sgaRatio):"—"} color={c.sgaRatio&&c.sgaRatio<0.30?"#4ade80":"#94a3b8"} hint="低いほど良"/>
                      <MBox label="売上高人件費比率" value={c.laborRatio?pct(c.laborRatio):"—"} color="#94a3b8"/>
                      <MBox label="売上高金融費用比率" value={c.financialCostRatio?pct(c.financialCostRatio):"—"} color={c.financialCostRatio&&c.financialCostRatio<0.02?"#4ade80":"#94a3b8"} hint="低いほど良"/>
                      <MBox label="EBITDAマージン" value={c.ebitdaMargin?pct(c.ebitdaMargin):"—"} color={c.ebitdaMargin&&c.ebitdaMargin>0.20?"#4ade80":"#94a3b8"} hint="20%超で優良"/>
                    </Section>
                    {c.grossMargin&&c.operatingMargin&&c.ordinaryMargin&&(
                      <div style={S.card}>
                        <div style={{color:"#94a3b8",fontSize:13,marginBottom:12}}>利益率ウォーターフォール</div>
                        <ResponsiveContainer width="100%" height={200}>
                          <BarChart data={[
                            {name:"粗利率",value:parseFloat((c.grossMargin*100).toFixed(1))},
                            {name:"営業利益率",value:parseFloat((c.operatingMargin*100).toFixed(1))},
                            {name:"経常利益率",value:parseFloat((c.ordinaryMargin*100).toFixed(1))},
                            {name:"EBITDAマージン",value:c.ebitdaMargin?parseFloat((c.ebitdaMargin*100).toFixed(1)):0},
                          ]}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
                            <XAxis dataKey="name" tick={{fill:"#94a3b8",fontSize:11}}/>
                            <YAxis tick={{fill:"#64748b",fontSize:11}} tickFormatter={v=>v+"%"}/>
                            <Tooltip formatter={v=>v+"%"} contentStyle={S.tooltip}/>
                            <Bar dataKey="value" fill="#4ade80" radius={[4,4,0,0]}/>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                )}

                {/* EFFICIENCY */}
                {detailTab==="efficiency"&&(
                  <Section title="③ 効率性分析（回転率）">
                    <MBox label="総資本回転率" value={c.totalAssetTurnover?c.totalAssetTurnover.toFixed(2)+"回":"—"} color={c.totalAssetTurnover&&c.totalAssetTurnover>0.8?"#4ade80":"#94a3b8"} hint="高いほど効率的"/>
                    <MBox label="経営資本回転率" value={c.operatingAssetTurnover?c.operatingAssetTurnover.toFixed(2)+"回":"—"} color="#94a3b8"/>
                    <MBox label="売上債権回転率" value={c.receivableTurnover?c.receivableTurnover.toFixed(2)+"回":"—"} color={c.receivableTurnover&&c.receivableTurnover>5?"#4ade80":"#94a3b8"} hint="高いほど回収良好"/>
                    <MBox label="棚卸資産回転率" value={c.inventoryTurnover?c.inventoryTurnover.toFixed(2)+"回":"—"} color={c.inventoryTurnover&&c.inventoryTurnover>5?"#4ade80":"#94a3b8"} hint="高いほど在庫効率良"/>
                    <MBox label="有形固定資産回転率" value={c.tangibleFixedAssetTurnover?c.tangibleFixedAssetTurnover.toFixed(2)+"回":"—"} color={c.tangibleFixedAssetTurnover&&c.tangibleFixedAssetTurnover>2?"#4ade80":"#94a3b8"} hint="高いほど設備稼働率高"/>
                  </Section>
                )}

                {/* SAFETY */}
                {detailTab==="safety"&&(
                  <div>
                    <Section title="④-1 短期安全性">
                      <MBox label="流動比率" value={c.currentRatio?pct(c.currentRatio):"—"} color={c.currentRatio&&c.currentRatio>2?"#4ade80":c.currentRatio&&c.currentRatio>1?"#fbbf24":"#f87171"} hint="200%超が理想"/>
                      <MBox label="当座比率" value={c.quickRatio?pct(c.quickRatio):"—"} color={c.quickRatio&&c.quickRatio>1?"#4ade80":"#fbbf24"} hint="100%超が望ましい"/>
                    </Section>
                    <Section title="④-2 長期安全性">
                      <MBox label="固定比率" value={c.fixedRatio?pct(c.fixedRatio):"—"} color={c.fixedRatio&&c.fixedRatio<1?"#4ade80":"#94a3b8"} hint="100%以下が望ましい"/>
                      <MBox label="固定長期適合率" value={c.fixedLongTermRatio?pct(c.fixedLongTermRatio):"—"} color={c.fixedLongTermRatio&&c.fixedLongTermRatio<1?"#4ade80":"#f87171"} hint="100%以下が望ましい"/>
                    </Section>
                    <Section title="④-3 資本調達構造">
                      <MBox label="自己資本比率" value={c.equityRatio?pct(c.equityRatio):"—"} color={c.equityRatio&&c.equityRatio>0.40?"#4ade80":"#94a3b8"} hint="40%超が安全"/>
                      <MBox label="負債比率" value={c.debtRatio?c.debtRatio.toFixed(2)+"x":"—"} color={c.debtRatio&&c.debtRatio<1?"#4ade80":"#94a3b8"} hint="低いほど安全"/>
                    </Section>
                    <Section title="⑤ その他安全性">
                      <MBox label="インタレストカバレッジ" value={c.icr?c.icr.toFixed(2)+"倍":"—"} color={c.icr&&c.icr>3?"#4ade80":c.icr&&c.icr>1?"#fbbf24":"#f87171"} hint="3倍超が安全"/>
                    </Section>
                  </div>
                )}

                {/* VALUATION */}
                {detailTab==="valuation"&&(
                  <div>
                    <Section title="⑥ 株価妥当性指標">
                      <MBox label="PER" value={c.per?x(c.per):"—"} color={c.per&&c.per<15?"#4ade80":c.per&&c.per<25?"#fbbf24":"#f87171"} hint="15倍未満が割安目安"/>
                      <MBox label="PBR" value={c.pbr?x(c.pbr):"—"} color={c.pbr&&c.pbr<1.5?"#4ade80":"#94a3b8"} hint="1倍以下は純資産割れ"/>
                      <MBox label="PSR" value={c.psr?x(c.psr):"—"} color={c.psr&&c.psr<2?"#4ade80":"#94a3b8"} hint="低いほど割安"/>
                      <MBox label="PEGレシオ" value={c.peg?x(c.peg):"—"} color={c.peg&&c.peg<1?"#4ade80":c.peg&&c.peg<2?"#fbbf24":"#f87171"} hint="1倍以下割安"/>
                      <MBox label="配当利回り" value={c.dividendYield?pct(c.dividendYield):"—"} color={c.dividendYield&&c.dividendYield>0.03?"#4ade80":"#94a3b8"}/>
                      <MBox label="配当性向" value={c.payoutRatio?pct(c.payoutRatio):"—"} color="#94a3b8" hint="30〜50%が健全"/>
                    </Section>
                    <Section title="⑦ キャッシュ指標">
                      <MBox label="EBITDA" value={c.ebitda?fmtM(c.ebitda):"—"} color="#60a5fa"/>
                      <MBox label="EV（企業価値）" value={c.ev?fmtM(c.ev):"—"} color="#60a5fa"/>
                      <MBox label="EV/EBITDA" value={c.evEbitda?x(c.evEbitda):"—"} color={c.evEbitda&&c.evEbitda<10?"#4ade80":"#94a3b8"} hint="10倍未満が割安目安"/>
                      <MBox label="EBITDAマージン" value={c.ebitdaMargin?pct(c.ebitdaMargin):"—"} color={c.ebitdaMargin&&c.ebitdaMargin>0.20?"#4ade80":"#94a3b8"}/>
                    </Section>
                  </div>
                )}

                {/* INPUT */}
                {detailTab==="input"&&(
                  <div>
                    <div style={{marginBottom:12,color:"#64748b",fontSize:13}}>数値を入力すると各指標が自動計算されます。</div>
                    <div style={{marginBottom:12,padding:10,background:"#111827",borderRadius:6,fontSize:11,color:"#475569"}}>
                      📌 参考先 →{" "}
                      {selected.market==="JP"
                        ?<><a href="https://finance.yahoo.co.jp" target="_blank" rel="noreferrer" style={{color:"#60a5fa"}}>Yahoo Finance Japan</a> / <a href="https://www.kabutan.jp" target="_blank" rel="noreferrer" style={{color:"#60a5fa"}}>株探</a> / <a href="https://irbank.net" target="_blank" rel="noreferrer" style={{color:"#60a5fa"}}>IRバンク</a></>
                        :<><a href="https://finance.yahoo.com" target="_blank" rel="noreferrer" style={{color:"#60a5fa"}}>Yahoo Finance</a> / <a href="https://www.macrotrends.net" target="_blank" rel="noreferrer" style={{color:"#60a5fa"}}>Macrotrends</a></>
                      }
                    </div>
                    {INPUT_FIELDS.map((row,i)=>(
                      <div key={i} style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:12,marginBottom:12}}>
                        {row.map(([label,key,unit])=>(
                          <FInput key={key} label={label} value={f[key]||""} onChange={v=>updateF(selected.id,key,v)} unit={unit}/>
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                {/* IR */}
                {detailTab==="ir"&&(
                  <div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                      <span style={{color:"#64748b",fontSize:13}}>IRニュース・適時開示情報</span>
                      <button style={S.addBtn} onClick={()=>setShowIrForm(v=>!v)}>＋ 追加</button>
                    </div>
                    {showIrForm&&(
                      <div style={{...S.card,marginBottom:16}}>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                          <FInput label="日付" value={irForm.date} onChange={v=>setIrForm(p=>({...p,date:v}))}/>
                          <div style={{display:"flex",flexDirection:"column",gap:3}}>
                            <label style={{color:"#64748b",fontSize:10}}>種別</label>
                            <select value={irForm.type} style={S.select} onChange={e=>setIrForm(p=>({...p,type:e.target.value}))}>
                              {["決算","配当","人事","その他"].map(t=><option key={t}>{t}</option>)}
                            </select>
                          </div>
                        </div>
                        <div style={{marginBottom:12}}><FInput label="タイトル" value={irForm.title} onChange={v=>setIrForm(p=>({...p,title:v}))}/></div>
                        <div style={{marginBottom:12}}><FInput label="URL（任意）" value={irForm.url} onChange={v=>setIrForm(p=>({...p,url:v}))}/></div>
                        <button style={S.addBtn} onClick={addIR}>保存</button>
                      </div>
                    )}
                    {(selected.irList||[]).length===0&&<div style={S.card}><span style={{color:"#64748b"}}>「追加」からIRニュースを入力してください。</span></div>}
                    {(selected.irList||[]).map((item,i)=>(
                      <div key={i} style={{...S.card,marginBottom:12}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                          <div style={{display:"flex",gap:8}}><Tag color={typeColor(item.type)}>{item.type}</Tag><span style={{color:"#475569",fontSize:12}}>{item.date}</span></div>
                          <button style={{...S.miniBtn,color:"#f87171",borderColor:"#f87171"}} onClick={()=>deleteIR(i)}>削除</button>
                        </div>
                        <div style={{fontWeight:700,color:"#f1f5f9",fontSize:14}}>
                          {item.url?<a href={item.url} target="_blank" rel="noreferrer" style={{color:"#f1f5f9",textDecoration:"none"}}>{item.title} ↗</a>:item.title}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── COMPARE ── */}
        {tab==="compare"&&(
          <div>
            <h2 style={S.sectionTitle}>他社比較</h2>
            <div style={S.stockSelector}>
              {portfolio.map(h=>(
                <button key={h.id} style={{...S.chipBtn,...(compareIds.includes(h.id)?S.chipActive:{})}} onClick={()=>toggleCompare(h.id)}>{h.ticker}</button>
              ))}
            </div>
            {compareStocks.length<2?<div style={S.card}><span style={{color:"#64748b"}}>2社以上選択してください。</span></div>:(
              <>
                <div style={{...S.card,overflowX:"auto",marginBottom:20}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                    <thead>
                      <tr style={{borderBottom:"1px solid #1e293b"}}>
                        <th style={{textAlign:"left",padding:"8px 12px",color:"#475569",fontSize:11,minWidth:160}}>指標</th>
                        {compareStocks.map((h,i)=><th key={h.id} style={{textAlign:"right",padding:"8px 12px",color:COLORS[i],minWidth:100}}>{h.ticker}<br/><span style={{fontSize:10,color:"#475569"}}>{h.name}</span></th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ["総合スコア",h=>financialScore(calcAll(h.financials)),v=>v!=null?v+"pt":"—",v=>v!=null?scoreColor(v):"#475569"],
                        ["PER",h=>calcAll(h.financials).per,v=>v?x(v):"—",v=>v&&v<15?"#4ade80":v&&v<25?"#fbbf24":"#f87171"],
                        ["PBR",h=>calcAll(h.financials).pbr,v=>v?x(v):"—",v=>v&&v<1.5?"#4ade80":"#94a3b8"],
                        ["PSR",h=>calcAll(h.financials).psr,v=>v?x(v):"—",()=>"#94a3b8"],
                        ["EV/EBITDA",h=>calcAll(h.financials).evEbitda,v=>v?x(v):"—",v=>v&&v<10?"#4ade80":"#94a3b8"],
                        ["PEGレシオ",h=>calcAll(h.financials).peg,v=>v?x(v):"—",v=>v&&v<1?"#4ade80":v&&v<2?"#fbbf24":"#f87171"],
                        ["ROE",h=>calcAll(h.financials).roe,v=>v?pct(v):"—",v=>v&&v>0.15?"#4ade80":"#94a3b8"],
                        ["ROA",h=>calcAll(h.financials).roa,v=>v?pct(v):"—",v=>v&&v>0.05?"#4ade80":"#94a3b8"],
                        ["営業利益率",h=>calcAll(h.financials).operatingMargin,v=>v?pct(v):"—",v=>v&&v>0.10?"#4ade80":"#94a3b8"],
                        ["粗利率",h=>calcAll(h.financials).grossMargin,v=>v?pct(v):"—",v=>v&&v>0.40?"#4ade80":"#94a3b8"],
                        ["EBITDAマージン",h=>calcAll(h.financials).ebitdaMargin,v=>v?pct(v):"—",v=>v&&v>0.20?"#4ade80":"#94a3b8"],
                        ["自己資本比率",h=>calcAll(h.financials).equityRatio,v=>v?pct(v):"—",v=>v&&v>0.40?"#4ade80":"#94a3b8"],
                        ["流動比率",h=>calcAll(h.financials).currentRatio,v=>v?pct(v):"—",v=>v&&v>2?"#4ade80":v&&v>1?"#fbbf24":"#f87171"],
                        ["ICR",h=>calcAll(h.financials).icr,v=>v?v.toFixed(2)+"倍":"—",v=>v&&v>3?"#4ade80":"#94a3b8"],
                        ["時価総額",h=>calcAll(h.financials).marketCap,v=>v?fmtM(v):"—",()=>"#e2e8f0"],
                      ].map(([label,getter,formatter,colorFn])=>(
                        <tr key={label} style={{borderBottom:"1px solid #1e293b"}}>
                          <td style={{padding:"8px 12px",color:"#64748b",fontSize:12}}>{label}</td>
                          {compareStocks.map(h=>{const val=getter(h);return<td key={h.id} style={{textAlign:"right",padding:"8px 12px",color:colorFn(val),fontWeight:700}}>{formatter(val)}</td>;})}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={S.card}>
                  <div style={{color:"#94a3b8",fontSize:13,marginBottom:12}}>PER比較</div>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={compareStocks.map(h=>({name:h.ticker,PER:parseFloat((calcAll(h.financials).per||0).toFixed(2))}))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
                      <XAxis dataKey="name" tick={{fill:"#94a3b8",fontSize:12}}/>
                      <YAxis tick={{fill:"#64748b",fontSize:11}} tickFormatter={v=>v+"x"}/>
                      <Tooltip formatter={v=>v+"倍"} contentStyle={S.tooltip}/>
                      <ReferenceLine y={15} stroke="#4ade80" strokeDasharray="4 4" label={{value:"割安目安15x",fill:"#4ade80",fontSize:10}}/>
                      <Bar dataKey="PER" fill="#818cf8" radius={[4,4,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div style={S.card}>
                  <div style={{color:"#94a3b8",fontSize:13,marginBottom:12}}>営業利益率比較</div>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={compareStocks.map(h=>({name:h.ticker,営業利益率:parseFloat(((calcAll(h.financials).operatingMargin||0)*100).toFixed(1))}))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
                      <XAxis dataKey="name" tick={{fill:"#94a3b8",fontSize:12}}/>
                      <YAxis tick={{fill:"#64748b",fontSize:11}} tickFormatter={v=>v+"%"}/>
                      <Tooltip formatter={v=>v+"%"} contentStyle={S.tooltip}/>
                      <ReferenceLine y={10} stroke="#4ade80" strokeDasharray="4 4" label={{value:"10%",fill:"#4ade80",fontSize:10}}/>
                      <Bar dataKey="営業利益率" fill="#4ade80" radius={[4,4,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── SIMULATION ── */}
        {tab==="simulation"&&(
          <div>
            <h2 style={S.sectionTitle}>シミュレーション</h2>
            <div style={S.stockSelector}>
              {portfolio.map(h=>(
                <button key={h.id} style={{...S.chipBtn,...(selected?.id===h.id?S.chipActive:{})}} onClick={()=>handleSelect(h)}>{h.ticker}</button>
              ))}
            </div>
            {selected&&(
              <>
                <div style={{...S.card,marginBottom:20}}>
                  <div style={{color:"#94a3b8",fontWeight:700,marginBottom:12}}>シミュレーション設定 — {selected.name}</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:12}}>
                    <FInput label="予測年数" value={simParams.years} onChange={v=>setSimParams(p=>({...p,years:v}))} unit="年"/>
                    <FInput label="売上成長率（年）" value={simParams.growthRate} onChange={v=>setSimParams(p=>({...p,growthRate:v}))} unit="%"/>
                    <FInput label="目標営業利益率" value={simParams.targetMargin} onChange={v=>setSimParams(p=>({...p,targetMargin:v}))} unit="%"/>
                    <FInput label="目標PER" value={simParams.targetPer} onChange={v=>setSimParams(p=>({...p,targetPer:v}))} unit="倍"/>
                    <FInput label="目標EV/EBITDA（任意）" value={simParams.targetEvEbitda} onChange={v=>setSimParams(p=>({...p,targetEvEbitda:v}))} unit="倍"/>
                    <FInput label="配当利回り" value={simParams.dividendRate} onChange={v=>setSimParams(p=>({...p,dividendRate:v}))} unit="%"/>
                    <div style={{display:"flex",flexDirection:"column",gap:3}}>
                      <label style={{color:"#64748b",fontSize:10}}>配当再投資</label>
                      <button style={{...S.miniBtn,color:simParams.reinvest?"#4ade80":"#64748b",borderColor:simParams.reinvest?"#4ade80":"#334155"}}
                        onClick={()=>setSimParams(p=>({...p,reinvest:!p.reinvest}))}>
                        {simParams.reinvest?"あり（複利）":"なし（単純）"}
                      </button>
                    </div>
                  </div>
                </div>

                <div style={S.card}>
                  <div style={{color:"#94a3b8",fontWeight:700,marginBottom:4}}>📈 株価推定（3シナリオ）</div>
                  <div style={{color:"#475569",fontSize:12,marginBottom:12}}>
                    Base: 成長率{simParams.growthRate}% / Bear: {Math.round(+simParams.growthRate*0.4)}% / Bull: {Math.round(+simParams.growthRate*1.6)}% → 目標PER {simParams.targetPer}倍
                  </div>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={simData()}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
                      <XAxis dataKey="year" tick={{fill:"#94a3b8",fontSize:12}}/>
                      <YAxis tick={{fill:"#64748b",fontSize:11}} tickFormatter={v=>v?.toLocaleString()}/>
                      <Tooltip formatter={v=>v?.toLocaleString()} contentStyle={S.tooltip}/>
                      <ReferenceLine y={n(f.price)||selected.currentPrice} stroke="#f59e0b" strokeDasharray="4 4" label={{value:"現在株価",fill:"#f59e0b",fontSize:10}}/>
                      <Legend wrapperStyle={{color:"#94a3b8",fontSize:12}}/>
                      <Line type="monotone" dataKey="bull株価" stroke="#4ade80" strokeWidth={2} dot={{fill:"#4ade80"}} name="強気"/>
                      <Line type="monotone" dataKey="base株価" stroke="#60a5fa" strokeWidth={2} dot={{fill:"#60a5fa"}} name="基本"/>
                      <Line type="monotone" dataKey="bear株価" stroke="#f87171" strokeWidth={2} dot={{fill:"#f87171"}} name="弱気"/>
                      {simData().some(d=>d.EV推定株価)&&<Line type="monotone" dataKey="EV推定株価" stroke="#a78bfa" strokeWidth={2} strokeDasharray="4 4" name="EV/EBITDA法"/>}
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
                  <div style={S.card}>
                    <div style={{color:"#94a3b8",fontWeight:700,marginBottom:4}}>💰 配当累計</div>
                    <div style={{color:"#475569",fontSize:12,marginBottom:12}}>配当利回り{simParams.dividendRate}% {simParams.reinvest?"複利":"単純"}</div>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={simData()}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
                        <XAxis dataKey="year" tick={{fill:"#94a3b8",fontSize:11}}/>
                        <YAxis tick={{fill:"#64748b",fontSize:10}} tickFormatter={v=>v?.toLocaleString()}/>
                        <Tooltip formatter={v=>v?.toLocaleString()} contentStyle={S.tooltip}/>
                        <Bar dataKey="配当累計" fill="#fbbf24" radius={[4,4,0,0]}/>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={S.card}>
                    <div style={{color:"#94a3b8",fontWeight:700,marginBottom:4}}>📊 売上・営業利益推移</div>
                    <div style={{color:"#475569",fontSize:12,marginBottom:12}}>成長率{simParams.growthRate}% × 目標利益率{simParams.targetMargin}%</div>
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={simData()}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
                        <XAxis dataKey="year" tick={{fill:"#94a3b8",fontSize:11}}/>
                        <YAxis tick={{fill:"#64748b",fontSize:10}} tickFormatter={v=>fmtM(v)}/>
                        <Tooltip formatter={v=>fmtM(v)} contentStyle={S.tooltip}/>
                        <Legend wrapperStyle={{color:"#94a3b8",fontSize:11}}/>
                        <Line type="monotone" dataKey="売上" stroke="#60a5fa" strokeWidth={2} dot={false}/>
                        <Line type="monotone" dataKey="営業利益" stroke="#4ade80" strokeWidth={2} dot={false}/>
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div style={S.card}>
                  <div style={{color:"#94a3b8",fontWeight:700,marginBottom:12}}>📋 シミュレーション結果サマリー</div>
                  <div style={{overflowX:"auto"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                      <thead>
                        <tr style={{borderBottom:"1px solid #1e293b"}}>
                          {["年","強気株価","基本株価","弱気株価","EV/EBITDA法","EPS","売上","配当累計"].map(h=>(
                            <th key={h} style={{textAlign:"right",padding:"6px 10px",color:"#475569",fontSize:11,whiteSpace:"nowrap"}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {simData().map((row,i)=>(
                          <tr key={i} style={{borderBottom:"1px solid #1e293b"}}>
                            <td style={{padding:"8px 10px",color:"#94a3b8",whiteSpace:"nowrap"}}>{row.year}</td>
                            <td style={{textAlign:"right",padding:"8px 10px",color:"#4ade80",fontWeight:700}}>{row.bull株価?.toLocaleString()??"—"}</td>
                            <td style={{textAlign:"right",padding:"8px 10px",color:"#60a5fa",fontWeight:700}}>{row.base株価?.toLocaleString()??"—"}</td>
                            <td style={{textAlign:"right",padding:"8px 10px",color:"#f87171"}}>{row.bear株価?.toLocaleString()??"—"}</td>
                            <td style={{textAlign:"right",padding:"8px 10px",color:"#a78bfa"}}>{row.EV推定株価?.toLocaleString()??"—"}</td>
                            <td style={{textAlign:"right",padding:"8px 10px",color:"#e2e8f0"}}>{row.EPS}</td>
                            <td style={{textAlign:"right",padding:"8px 10px",color:"#94a3b8"}}>{fmtM(row.売上)}</td>
                            <td style={{textAlign:"right",padding:"8px 10px",color:"#fbbf24"}}>{row.配当累計?.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

const S = {
  root:{ minHeight:"100vh", background:"#0a0f1a", fontFamily:"'DM Mono','Courier New',monospace", color:"#e2e8f0" },
  header:{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 24px", background:"#0d1424", borderBottom:"1px solid #1e293b", flexWrap:"wrap", gap:8 },
  logo:{ display:"flex", alignItems:"center", gap:8 },
  logoText:{ fontSize:22, fontWeight:900, color:"#f1f5f9", letterSpacing:2 },
  nav:{ display:"flex", gap:4, flexWrap:"wrap" },
  navBtn:{ background:"transparent", border:"1px solid #1e293b", color:"#64748b", padding:"6px 14px", borderRadius:6, cursor:"pointer", fontSize:12, fontFamily:"inherit" },
  navActive:{ background:"#0f2a1a", border:"1px solid #4ade80", color:"#4ade80" },
  summaryBar:{ display:"flex", background:"#0d1424", borderBottom:"1px solid #1e293b", flexWrap:"wrap" },
  summaryItem:{ flex:1, padding:"12px 20px", borderRight:"1px solid #1e293b", minWidth:120 },
  summaryLabel:{ display:"block", fontSize:11, color:"#475569", marginBottom:4, textTransform:"uppercase", letterSpacing:1 },
  summaryValue:{ fontSize:20, fontWeight:800 },
  main:{ padding:"24px", maxWidth:1200, margin:"0 auto" },
  sectionTitle:{ fontSize:18, fontWeight:800, color:"#f1f5f9", margin:"0 0 16px 0", letterSpacing:1 },
  card:{ background:"#0d1424", border:"1px solid #1e293b", borderRadius:10, padding:20, marginBottom:16 },
  table:{ background:"#0d1424", border:"1px solid #1e293b", borderRadius:10, overflow:"hidden", marginBottom:16 },
  tableHeader:{ display:"grid", gridTemplateColumns:"2fr 0.6fr 0.7fr 0.9fr 0.9fr 1fr 1.1fr 1fr 0.7fr 1fr", padding:"10px 16px", background:"#111827", gap:8 },
  th:{ fontSize:10, color:"#475569", textTransform:"uppercase", letterSpacing:1 },
  tableRow:{ display:"grid", gridTemplateColumns:"2fr 0.6fr 0.7fr 0.9fr 0.9fr 1fr 1.1fr 1fr 0.7fr 1fr", padding:"12px 16px", gap:8, borderTop:"1px solid #1e293b", alignItems:"center" },
  tableRowActive:{ background:"#0f2a1a" },
  stockSelector:{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:16 },
  chipBtn:{ background:"#111827", border:"1px solid #1e293b", color:"#94a3b8", padding:"6px 12px", borderRadius:20, cursor:"pointer", fontSize:12, fontFamily:"inherit" },
  chipActive:{ background:"#0f2a1a", border:"1px solid #4ade80", color:"#4ade80" },
  addBtn:{ background:"#0f2a1a", border:"1px solid #4ade80", color:"#4ade80", padding:"8px 16px", borderRadius:6, cursor:"pointer", fontSize:13, fontFamily:"inherit", fontWeight:700 },
  addForm:{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:16, padding:16, background:"#0d1424", border:"1px solid #1e293b", borderRadius:8 },
  input:{ background:"#111827", border:"1px solid #1e293b", color:"#e2e8f0", padding:"8px 12px", borderRadius:6, fontSize:13, fontFamily:"inherit", outline:"none", width:"100%", boxSizing:"border-box" },
  select:{ background:"#111827", border:"1px solid #1e293b", color:"#e2e8f0", padding:"8px 12px", borderRadius:6, fontSize:13, fontFamily:"inherit", width:"100%" },
  miniBtn:{ background:"#111827", border:"1px solid #334155", color:"#64748b", padding:"4px 10px", borderRadius:4, cursor:"pointer", fontSize:11, fontFamily:"inherit" },
  tooltip:{ background:"#0d1424", border:"1px solid #1e293b", borderRadius:6, color:"#e2e8f0", fontSize:12 },
};
