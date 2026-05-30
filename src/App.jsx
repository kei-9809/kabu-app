import { useState, useCallback, useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend
} from "recharts";

const n = v => (v === "" || v == null) ? null : parseFloat(v);
const pct = v => v == null || isNaN(v) ? "—" : (v * 100).toFixed(2) + "%";
const x   = v => v == null || isNaN(v) ? "—" : v.toFixed(2) + "x";
const fmtM = v => { if (v == null || isNaN(v)) return "—"; const a = Math.abs(v); return a >= 1e12 ? (v/1e12).toFixed(2)+"兆" : a >= 1e8 ? (v/1e8).toFixed(1)+"億" : a >= 1e4 ? (v/1e4).toFixed(0)+"万" : v.toFixed(0); };
const safe = (a, b) => (a != null && b != null && b !== 0) ? a / b : null;

function calcAll(f) {
  const price    = n(f.price);
  const shares   = n(f.shares);   // 千株
  const sales    = n(f.sales);
  const gp       = n(f.grossProfit);
  const op       = n(f.opProfit);
  const ord      = n(f.ordProfit);
  const net      = n(f.netProfit);
  const ta       = n(f.totalAssets);
  const eq       = n(f.equity);
  const ca       = n(f.curAssets);
  const fa       = n(f.fixAssets);
  const cl       = n(f.curLiab);
  const fl       = n(f.fixLiab);
  const ebitda   = n(f.ebitda);
  const div      = n(f.dividend);   // 1株配当（円）
  const shinyo   = n(f.shinyoBairitu);

  const marketCap = (price != null && shares != null) ? price * shares * 1000 : null;
  const netDebt   = (ta != null && eq != null && ca != null) ? (ta - eq) - ca : null;
  const ev        = (marketCap != null && netDebt != null) ? marketCap + netDebt : null;
  const eps       = (net != null && shares != null && shares > 0) ? net / (shares * 1000) : null;
  const bps       = (eq  != null && shares != null && shares > 0) ? eq  / (shares * 1000) : null;

  // 収益性
  const grossMargin = safe(gp,  sales);
  const opMargin    = safe(op,  sales);
  const ordMargin   = safe(ord, sales);

  // 資本利益率
  const roe  = safe(net, eq);
  const roa  = safe(ord, ta);
  const ic   = (ta != null && cl != null) ? ta - cl : null; // 投下資本 = 総資産 - 流動負債
  const roic = safe(op, ic);

  // 安全性
  const currentRatio  = safe(ca, cl);
  const fixedRatio    = safe(fa, eq);
  const fixedLTRatio  = (fa != null && eq != null && fl != null && (eq + fl) !== 0) ? fa / (eq + fl) : null;
  const equityRatio   = safe(eq, ta);

  // 株価指標
  const per      = (price != null && eps != null && eps > 0) ? price / eps : null;
  const pbr      = (price != null && bps != null && bps > 0) ? price / bps : null;
  const psr      = (marketCap != null && sales != null && sales > 0) ? marketCap / sales : null;
  const evEbitda = safe(ev, ebitda);

  // 配当
  const dividendYield  = safe(div, price);
  const payoutRatio    = (div != null && shares != null && net != null && net > 0)
    ? (div * shares * 1000) / net : null;

  return {
    marketCap, ev, eps, bps, ebitda, shinyo,
    grossMargin, opMargin, ordMargin,
    roe, roa, roic,
    currentRatio, fixedRatio, fixedLTRatio, equityRatio,
    per, pbr, psr, evEbitda,
    dividendYield, payoutRatio
  };
}

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
  add(c.opMargin != null && c.opMargin > 0.10, 8);
  add(c.currentRatio != null && c.currentRatio > 1.5, 8);
  add(c.equityRatio != null && c.equityRatio > 0.30, 8);
  return total > 0 ? Math.round((score / total) * 100) : null;
}

const EMPTY_F = {
  price:"", shares:"", sales:"", grossProfit:"", opProfit:"", ordProfit:"",
  netProfit:"", totalAssets:"", equity:"", curAssets:"", fixAssets:"",
  curLiab:"", fixLiab:"", ebitda:"", dividend:"", shinyoBairitu:""
};

const INPUT_FIELDS = [
  { label:"株価（円）",          key:"price" },
  { label:"発行済株式数（千株）", key:"shares",      hint:"例: 14430000" },
  { label:"売上高（円）",        key:"sales" },
  { label:"売上総利益（円）",    key:"grossProfit" },
  { label:"営業利益（円）",      key:"opProfit" },
  { label:"経常利益（円）",      key:"ordProfit" },
  { label:"当期純利益（円）",    key:"netProfit",   hint:"赤字はマイナスで" },
  { label:"総資産（円）",        key:"totalAssets" },
  { label:"純資産（円）",        key:"equity" },
  { label:"流動資産（円）",      key:"curAssets" },
  { label:"固定資産（円）",      key:"fixAssets" },
  { label:"流動負債（円）",      key:"curLiab" },
  { label:"固定負債（円）",      key:"fixLiab" },
  { label:"EBITDA（円）",       key:"ebitda",      hint:"営業利益＋減価償却費" },
  { label:"1株配当（円）",       key:"dividend" },
  { label:"信用倍率（倍）",      key:"shinyoBairitu" },
];

const INITIAL_PORTFOLIO = [
  { id:1, ticker:"7203", name:"トヨタ自動車", sector:"自動車", qty:100, avgCost:2850, currentPrice:3124,
    financials:{ price:"3124", shares:"14430000", sales:"4390000000000", grossProfit:"900000000000", opProfit:"350000000000", ordProfit:"360000000000", netProfit:"400000000000", totalAssets:"9000000000000", equity:"3700000000000", curAssets:"5000000000000", fixAssets:"4000000000000", curLiab:"3000000000000", fixLiab:"2300000000000", ebitda:"450000000000", dividend:"75", shinyoBairitu:"2.1" }, irList:[] },
  { id:2, ticker:"6758", name:"ソニーグループ", sector:"電機", qty:50, avgCost:12400, currentPrice:13250,
    financials:{ price:"13250", shares:"1190000", sales:"13000000000000", grossProfit:"4200000000000", opProfit:"1200000000000", ordProfit:"1250000000000", netProfit:"900000000000", totalAssets:"25000000000000", equity:"6800000000000", curAssets:"12000000000000", fixAssets:"13000000000000", curLiab:"8000000000000", fixLiab:"10000000000000", ebitda:"1600000000000", dividend:"95", shinyoBairitu:"1.4" }, irList:[] },
  { id:3, ticker:"9984", name:"ソフトバンクG", sector:"通信", qty:200, avgCost:7200, currentPrice:6850,
    financials:{ price:"6850", shares:"2110000", sales:"6000000000000", grossProfit:"", opProfit:"500000000000", ordProfit:"", netProfit:"-800000000000", totalAssets:"50000000000000", equity:"8000000000000", curAssets:"", fixAssets:"", curLiab:"", fixLiab:"", ebitda:"900000000000", dividend:"", shinyoBairitu:"3.2" }, irList:[] },
];

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
const FInput = ({ label, value, onChange, hint="" }) => (
  <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
    <label style={{ color:"#64748b", fontSize:10 }}>{label}</label>
    <input value={value} onChange={e=>onChange(e.target.value)} style={S.input} placeholder="数値を入力"/>
    {hint && <span style={{ color:"#334155", fontSize:9 }}>{hint}</span>}
  </div>
);
const scoreColor = v => v >= 80 ? "#4ade80" : v >= 50 ? "#fbbf24" : "#f87171";
const typeColor  = t => t==="決算"?"#4ade80":t==="配当"?"#fbbf24":t==="人事"?"#a78bfa":"#64748b";
const COLORS = ["#4ade80","#60a5fa","#f59e0b","#a78bfa"];

export default function App() {
  const [tab, setTab] = useState("portfolio");
  const [portfolio, setPortfolio] = useState(INITIAL_PORTFOLIO);
  const [selected, setSelected] = useState(INITIAL_PORTFOLIO[0]);
  const [detailTab, setDetailTab] = useState("metrics");
  const [compareIds, setCompareIds] = useState([]);
  const [simParams, setSimParams] = useState({ years:"5", growthRate:"15", targetMargin:"15", targetPer:"20", targetEvEbitda:"", dividendRate:"2", reinvest:true });
  const [simTab, setSimTab] = useState("scenario"); // scenario | margin | monte
  const [irForm, setIrForm] = useState({ date:"", title:"", url:"", type:"決算" });
  const [showIrForm, setShowIrForm] = useState(false);
  const [addForm, setAddForm] = useState({ ticker:"", name:"", sector:"", qty:"", avgCost:"", currentPrice:"" });
  const [showAdd, setShowAdd] = useState(false);

  const totalCost  = portfolio.reduce((s,h)=>s+h.qty*h.avgCost,0);
  const totalValue = portfolio.reduce((s,h)=>s+h.qty*h.currentPrice,0);
  const totalPnL   = totalValue - totalCost;
  const totalPnLPct= (totalPnL/totalCost)*100;

  const updateF = useCallback((id,key,val)=>{
    setPortfolio(p=>p.map(h=>h.id===id?{...h,financials:{...h.financials,[key]:val}}:h));
    if(selected?.id===id) setSelected(s=>({...s,financials:{...s.financials,[key]:val}}));
  },[selected]);

  const handleSelect = h => setSelected(h);

  const handleAddStock = () => {
    const {ticker,name,sector,qty,avgCost,currentPrice}=addForm;
    if(!ticker||!name||!qty||!avgCost||!currentPrice) return;
    setPortfolio(p=>[...p,{id:Date.now(),ticker,name,sector:sector||"—",qty:+qty,avgCost:+avgCost,currentPrice:+currentPrice,financials:{...EMPTY_F,price:currentPrice},irList:[]}]);
    setAddForm({ticker:"",name:"",sector:"",qty:"",avgCost:"",currentPrice:""});
    setShowAdd(false);
  };

  const handleDeleteStock = useCallback((id)=>{
    if(!window.confirm("この銘柄を削除しますか？")) return;
    setPortfolio(p=>p.filter(h=>h.id!==id));
    setCompareIds(p=>p.filter(x=>x!==id));
    if(selected?.id===id){const rem=portfolio.filter(h=>h.id!==id);setSelected(rem.length>0?rem[0]:null);}
  },[selected,portfolio]);

  const addIR = ()=>{
    if(!irForm.title||!irForm.date) return;
    setPortfolio(p=>p.map(h=>h.id===selected.id?{...h,irList:[irForm,...(h.irList||[])]}:h));
    setSelected(s=>({...s,irList:[irForm,...(s.irList||[])]}));
    setIrForm({date:"",title:"",url:"",type:"決算"}); setShowIrForm(false);
  };
  const deleteIR = idx=>{
    setPortfolio(p=>p.map(h=>h.id===selected.id?{...h,irList:h.irList.filter((_,i)=>i!==idx)}:h));
    setSelected(s=>({...s,irList:s.irList.filter((_,i)=>i!==idx)}));
  };
  const toggleCompare = id=>setCompareIds(p=>p.includes(id)?p.filter(x=>x!==id):p.length<4?[...p,id]:p);

  const simData = useCallback(()=>{
    if(!selected) return [];
    const f=selected.financials;
    const price=n(f.price)||selected.currentPrice;
    const sales=n(f.sales)||0;
    const shares=n(f.shares)||1;
    const ebitdaCur=n(f.ebitda)||0;
    const curNet=n(f.netProfit)||0;
    const curOp=n(f.opProfit)||0;
    const g=+simParams.growthRate/100;
    const tMargin=+simParams.targetMargin/100;
    const curMargin=sales>0&&curOp?curOp/sales:tMargin*0.5;
    const tPer=+simParams.targetPer;
    const tEvEb=simParams.targetEvEbitda?+simParams.targetEvEbitda:null;
    const divRate=+simParams.dividendRate/100;
    const years=+simParams.years||5;
    return Array.from({length:years+1},(_,y)=>{
      const gf=Math.pow(1+g,y);
      const mp=years>0?y/years:1;
      const projMargin=curMargin+(tMargin-curMargin)*mp;
      const projSales=sales*gf;
      const projOP=projSales*projMargin;
      const netRatio=curOp>0?curNet/curOp:0.7;
      const projNet=projOP*netRatio;
      const projEps=shares>0?projNet/(shares*1000):0;
      const projEbitda=ebitdaCur*gf;
      const priceBase=projEps>0?Math.round(projEps*tPer):null;
      const priceBear=projEps>0?Math.round(projEps*Math.pow(1+g*0.4,y)*tPer*0.8):null;
      const priceBull=projEps>0?Math.round(projEps*Math.pow(1+g*1.6,y)*tPer*1.2):null;
      const priceEv=tEvEb!=null&&shares>0?Math.round((projEbitda*tEvEb)/(shares*1000)):null;
      const divCum=simParams.reinvest?Math.round(price*(Math.pow(1+divRate,y)-1)):Math.round(price*divRate*y);
      return{year:y===0?"現在":`${y}年後`,base株価:priceBase,bear株価:priceBear,bull株価:priceBull,EV推定株価:priceEv,配当累計:divCum,売上:Math.round(projSales),営業利益:Math.round(projOP),EPS:parseFloat(projEps.toFixed(2))};
    });
  },[selected,simParams]);

  const f  = selected?.financials||{};
  const c  = selected?calcAll(f):{};
  const sc = financialScore(c);
  const compareStocks = portfolio.filter(h=>compareIds.includes(h.id));

  // 安全余裕率（適正株価 vs 現在株価）
  const safetyMargin = useMemo(()=>{
    if(!selected) return null;
    const price = n(f.price)||selected.currentPrice;
    const eps = c.eps;
    const bps = c.bps;
    const tPer = +simParams.targetPer;
    const fairPer  = eps && eps > 0 ? eps * tPer : null;
    const fairPbr  = bps ? bps * 1.5 : null;
    const fairs = [fairPer, fairPbr].filter(v=>v!=null);
    if(fairs.length===0) return null;
    const fairAvg = fairs.reduce((a,b)=>a+b,0)/fairs.length;
    return { fairPrice: Math.round(fairAvg), currentPrice: price, margin: (fairAvg - price)/price*100 };
  },[selected, f, c, simParams.targetPer]);

  // モンテカルロシミュレーション（1000回）
  const monteData = useMemo(()=>{
    if(!selected) return { chartData:[], stats:null };
    const price = n(f.price)||selected.currentPrice;
    const eps = c.eps||0;
    const tPer = +simParams.targetPer;
    const g = +simParams.growthRate/100;
    const years = +simParams.years||5;
    const TRIALS = 1000;
    const finals = [];
    for(let t=0;t<TRIALS;t++){
      // 成長率に正規分布ノイズを加える（Box-Muller法）
      let projEps = eps;
      for(let y=0;y<years;y++){
        const u1=Math.random(), u2=Math.random();
        const noise = Math.sqrt(-2*Math.log(u1))*Math.cos(2*Math.PI*u2);
        const annualG = g + noise * g * 0.5; // ±50%のブレ
        projEps *= (1 + annualG);
      }
      // PERもランダムに変動
      const perNoise = (Math.random()-0.5)*tPer*0.3;
      const finalPrice = projEps > 0 ? Math.round(projEps * (tPer + perNoise)) : 0;
      finals.push(finalPrice);
    }
    finals.sort((a,b)=>a-b);
    const p10 = finals[Math.floor(TRIALS*0.10)];
    const p25 = finals[Math.floor(TRIALS*0.25)];
    const p50 = finals[Math.floor(TRIALS*0.50)];
    const p75 = finals[Math.floor(TRIALS*0.75)];
    const p90 = finals[Math.floor(TRIALS*0.90)];
    const mean = Math.round(finals.reduce((a,b)=>a+b,0)/TRIALS);
    const probProfit = finals.filter(v=>v>price).length/TRIALS*100;

    // ヒストグラム用（20ビン）
    const min = finals[0], max = finals[TRIALS-1];
    const binSize = (max-min)/20||1;
    const bins = Array.from({length:20},(_,i)=>{
      const lo=min+i*binSize, hi=lo+binSize;
      const count=finals.filter(v=>v>=lo&&v<hi).length;
      return{ range: Math.round((lo+hi)/2).toLocaleString(), count, lo, hi };
    });
    return{ chartData:bins, stats:{ p10,p25,p50,p75,p90,mean,probProfit,price }, finals };
  },[selected, f, c, simParams]);

  const METRIC_ROWS = [
    ["PER",        h=>calcAll(h.financials).per,          v=>v?x(v):"—",    v=>v&&v<15?"#4ade80":v&&v<25?"#fbbf24":"#f87171"],
    ["PBR",        h=>calcAll(h.financials).pbr,          v=>v?x(v):"—",    v=>v&&v<1.5?"#4ade80":"#94a3b8"],
    ["PSR",        h=>calcAll(h.financials).psr,          v=>v?x(v):"—",    ()=>"#94a3b8"],
    ["EV/EBITDA",  h=>calcAll(h.financials).evEbitda,     v=>v?x(v):"—",    v=>v&&v<10?"#4ade80":"#94a3b8"],
    ["ROE",        h=>calcAll(h.financials).roe,          v=>v?pct(v):"—",  v=>v&&v>0.15?"#4ade80":"#94a3b8"],
    ["ROA",        h=>calcAll(h.financials).roa,          v=>v?pct(v):"—",  v=>v&&v>0.05?"#4ade80":"#94a3b8"],
    ["ROIC",       h=>calcAll(h.financials).roic,         v=>v?pct(v):"—",  v=>v&&v>0.08?"#4ade80":"#94a3b8"],
    ["営業利益率",  h=>calcAll(h.financials).opMargin,     v=>v?pct(v):"—",  v=>v&&v>0.10?"#4ade80":"#94a3b8"],
    ["粗利率",      h=>calcAll(h.financials).grossMargin,  v=>v?pct(v):"—",  v=>v&&v>0.40?"#4ade80":"#94a3b8"],
    ["経常利益率",  h=>calcAll(h.financials).ordMargin,    v=>v?pct(v):"—",  ()=>"#94a3b8"],
    ["自己資本比率",h=>calcAll(h.financials).equityRatio,  v=>v?pct(v):"—",  v=>v&&v>0.40?"#4ade80":"#94a3b8"],
    ["流動比率",    h=>calcAll(h.financials).currentRatio, v=>v?pct(v):"—",  v=>v&&v>2?"#4ade80":v&&v>1?"#fbbf24":"#f87171"],
    ["固定比率",    h=>calcAll(h.financials).fixedRatio,   v=>v?pct(v):"—",  v=>v&&v<1?"#4ade80":"#94a3b8"],
    ["固定長期適合率",h=>calcAll(h.financials).fixedLTRatio,v=>v?pct(v):"—", v=>v&&v<1?"#4ade80":"#f87171"],
    ["配当利回り",  h=>calcAll(h.financials).dividendYield,v=>v?pct(v):"—",  v=>v&&v>0.03?"#4ade80":"#94a3b8"],
    ["配当性向",    h=>calcAll(h.financials).payoutRatio,  v=>v?pct(v):"—",  ()=>"#94a3b8"],
    ["信用倍率",    h=>h.financials.shinyoBairitu,          v=>v?v+"倍":"—",  v=>n(v)>3?"#f87171":"#94a3b8"],
    ["時価総額",    h=>calcAll(h.financials).marketCap,    v=>v?fmtM(v):"—", ()=>"#e2e8f0"],
  ];

  return (
    <div style={S.root}>
      <header style={S.header}>
        <div style={S.logo}><span style={{fontSize:22}}>📈</span><span style={S.logoText}>KABU<span style={{color:"#4ade80"}}>LENS</span></span><span style={{fontSize:11,color:"#334155",marginLeft:8}}>日本株専用</span></div>
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

        {tab==="portfolio"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h2 style={S.sectionTitle}>保有銘柄一覧</h2>
              <button style={S.addBtn} onClick={()=>setShowAdd(v=>!v)}>＋ 銘柄追加</button>
            </div>
            {showAdd&&(
              <div style={{...S.card,marginBottom:16}}>
                <div style={{color:"#94a3b8",fontWeight:700,marginBottom:12,fontSize:13}}>新規銘柄追加</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:12}}>
                  <FInput label="証券コード（例: 7203）" value={addForm.ticker} onChange={v=>setAddForm(p=>({...p,ticker:v}))}/>
                  <FInput label="銘柄名" value={addForm.name} onChange={v=>setAddForm(p=>({...p,name:v}))}/>
                  <FInput label="セクター" value={addForm.sector} onChange={v=>setAddForm(p=>({...p,sector:v}))}/>
                  <FInput label="保有数量（株）" value={addForm.qty} onChange={v=>setAddForm(p=>({...p,qty:v}))}/>
                  <FInput label="平均取得単価（円）" value={addForm.avgCost} onChange={v=>setAddForm(p=>({...p,avgCost:v}))}/>
                  <FInput label="現在株価（円）" value={addForm.currentPrice} onChange={v=>setAddForm(p=>({...p,currentPrice:v}))}/>
                </div>
                <div style={{marginTop:12,display:"flex",gap:8}}>
                  <button style={S.addBtn} onClick={handleAddStock}>追加する</button>
                  <button style={S.miniBtn} onClick={()=>setShowAdd(false)}>キャンセル</button>
                </div>
              </div>
            )}
            <div style={S.table}>
              <div style={S.tableHeader}>
                {["銘柄","コード","保有数","取得単価","現在値","評価額","損益","損益率","スコア","操作"].map(h=>(<span key={h} style={S.th}>{h}</span>))}
              </div>
              {portfolio.map(h=>{
                const pnl=(h.currentPrice-h.avgCost)*h.qty;
                const pnlPct=((h.currentPrice-h.avgCost)/h.avgCost)*100;
                const hsc=financialScore(calcAll(h.financials));
                return(
                  <div key={h.id} style={{...S.tableRow,...(selected?.id===h.id?S.tableRowActive:{})}}>
                    <span style={{fontWeight:700,color:"#e2e8f0"}}>{h.name}<br/><span style={{color:"#475569",fontSize:11}}>{h.sector}</span></span>
                    <span><Tag color="#60a5fa">{h.ticker}</Tag></span>
                    <span style={{color:"#94a3b8"}}>{h.qty.toLocaleString()}</span>
                    <span style={{color:"#94a3b8"}}>¥{h.avgCost.toLocaleString()}</span>
                    <span style={{fontWeight:700,color:"#e2e8f0"}}>¥{h.currentPrice.toLocaleString()}</span>
                    <span>¥{(h.qty*h.currentPrice).toLocaleString()}</span>
                    <span><Δ val={pnl} fmt={v=>"¥"+Math.round(v).toLocaleString()}/></span>
                    <span><Δ val={pnlPct} fmt={v=>v.toFixed(2)+"%"}/></span>
                    <span style={{color:hsc!=null?scoreColor(hsc):"#475569",fontWeight:700}}>{hsc!=null?hsc+"pt":"—"}</span>
                    <span style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                      <button style={S.miniBtn} onClick={()=>{handleSelect(h);setTab("detail");}}>詳細</button>
                      <button style={{...S.miniBtn,...(compareIds.includes(h.id)?{color:"#4ade80",borderColor:"#4ade80"}:{})}} onClick={()=>toggleCompare(h.id)}>{compareIds.includes(h.id)?"比較中":"比較"}</button>
                      <button style={{...S.miniBtn,color:"#f87171",borderColor:"#f87171"}} onClick={()=>handleDeleteStock(h.id)}>削除</button>
                    </span>
                  </div>
                );
              })}
            </div>
            {portfolio.length===0&&<div style={{...S.card,textAlign:"center",color:"#475569",padding:40}}>「＋ 銘柄追加」から追加してください。</div>}
          </div>
        )}

        {tab==="detail"&&(
          <div>
            <h2 style={S.sectionTitle}>銘柄詳細</h2>
            <div style={S.stockSelector}>
              {portfolio.map(h=>(<button key={h.id} style={{...S.chipBtn,...(selected?.id===h.id?S.chipActive:{})}} onClick={()=>handleSelect(h)}>{h.ticker} {h.name}</button>))}
            </div>
            {!selected&&<div style={S.card}><span style={{color:"#64748b"}}>銘柄を選択してください。</span></div>}
            {selected&&(
              <>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                    <span style={{fontSize:20,fontWeight:800,color:"#f1f5f9"}}>{selected.name}</span>
                    <Tag color="#60a5fa">{selected.ticker}</Tag>
                    <Tag color="#a78bfa">{selected.sector}</Tag>
                    {sc!=null&&<span style={{background:scoreColor(sc)+"22",color:scoreColor(sc),border:`1px solid ${scoreColor(sc)}44`,borderRadius:6,padding:"4px 10px",fontSize:13,fontWeight:700}}>総合スコア {sc}pt</span>}
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:24,fontWeight:900,color:"#f1f5f9"}}>¥{selected.currentPrice.toLocaleString()}</div>
                    <Δ val={((selected.currentPrice-selected.avgCost)/selected.avgCost)*100} fmt={v=>v.toFixed(2)+"%"}/>
                  </div>
                </div>
                <div style={{display:"flex",gap:4,marginBottom:20,borderBottom:"1px solid #1e293b",paddingBottom:8,flexWrap:"wrap"}}>
                  {["metrics","input","ir"].map(t=>(
                    <button key={t} style={{...S.navBtn,...(detailTab===t?S.navActive:{})}} onClick={()=>setDetailTab(t)}>
                      {{"metrics":"財務指標","input":"数値入力","ir":"IRニュース"}[t]}
                    </button>
                  ))}
                </div>

                {detailTab==="metrics"&&(
                  <div>
                    <div style={{color:"#64748b",fontSize:12,marginBottom:12}}>「数値入力」タブの入力値から自動計算しています。</div>
                    <Section title="株価指標">
                      <MBox label="PER"       value={c.per?x(c.per):"—"}         color={c.per&&c.per<15?"#4ade80":c.per&&c.per<25?"#fbbf24":"#f87171"} hint="15倍未満が割安" badge={c.per&&c.per<15?"割安":""}/>
                      <MBox label="PBR"       value={c.pbr?x(c.pbr):"—"}         color={c.pbr&&c.pbr<1.5?"#4ade80":"#94a3b8"}  hint="1倍以下は解散価値割れ"/>
                      <MBox label="PSR"       value={c.psr?x(c.psr):"—"}         color={c.psr&&c.psr<2?"#4ade80":"#94a3b8"}    hint="低いほど割安"/>
                      <MBox label="EV/EBITDA" value={c.evEbitda?x(c.evEbitda):"—"} color={c.evEbitda&&c.evEbitda<10?"#4ade80":"#94a3b8"} hint="10倍未満が割安"/>
                      <MBox label="信用倍率"  value={f.shinyoBairitu?f.shinyoBairitu+"倍":"—"} color={n(f.shinyoBairitu)>3?"#f87171":"#94a3b8"} hint="高いと将来売り圧力"/>
                      <MBox label="配当利回り" value={c.dividendYield?pct(c.dividendYield):"—"} color={c.dividendYield&&c.dividendYield>0.03?"#4ade80":"#94a3b8"}/>
                      <MBox label="配当性向"  value={c.payoutRatio?pct(c.payoutRatio):"—"} color="#94a3b8" hint="30〜50%が健全"/>
                      <MBox label="時価総額"  value={c.marketCap?fmtM(c.marketCap):"—"} color="#e2e8f0"/>
                    </Section>
                    <Section title="収益性・資本効率">
                      <MBox label="ROE"      value={c.roe?pct(c.roe):"—"}     color={c.roe&&c.roe>0.15?"#4ade80":"#94a3b8"}  hint="15%超で優良"/>
                      <MBox label="ROA"      value={c.roa?pct(c.roa):"—"}     color={c.roa&&c.roa>0.05?"#4ade80":"#94a3b8"}  hint="5%超で優良"/>
                      <MBox label="ROIC"     value={c.roic?pct(c.roic):"—"}   color={c.roic&&c.roic>0.08?"#4ade80":"#94a3b8"} hint="8%超で優良"/>
                      <MBox label="粗利率"   value={c.grossMargin?pct(c.grossMargin):"—"} color={c.grossMargin&&c.grossMargin>0.40?"#4ade80":"#94a3b8"}/>
                      <MBox label="営業利益率" value={c.opMargin?pct(c.opMargin):"—"} color={c.opMargin&&c.opMargin>0.10?"#4ade80":"#94a3b8"} hint="10%超で優良"/>
                      <MBox label="経常利益率" value={c.ordMargin?pct(c.ordMargin):"—"} color="#94a3b8"/>
                    </Section>
                    <Section title="安全性">
                      <MBox label="自己資本比率"    value={c.equityRatio?pct(c.equityRatio):"—"}    color={c.equityRatio&&c.equityRatio>0.40?"#4ade80":"#94a3b8"} hint="40%超が安全"/>
                      <MBox label="流動比率"         value={c.currentRatio?pct(c.currentRatio):"—"} color={c.currentRatio&&c.currentRatio>2?"#4ade80":c.currentRatio&&c.currentRatio>1?"#fbbf24":"#f87171"} hint="200%超が理想"/>
                      <MBox label="固定比率"         value={c.fixedRatio?pct(c.fixedRatio):"—"}     color={c.fixedRatio&&c.fixedRatio<1?"#4ade80":"#94a3b8"}   hint="100%以下が望ましい"/>
                      <MBox label="固定長期適合率"   value={c.fixedLTRatio?pct(c.fixedLTRatio):"—"} color={c.fixedLTRatio&&c.fixedLTRatio<1?"#4ade80":"#f87171"} hint="100%以下が望ましい"/>
                    </Section>
                    {(c.grossMargin||c.opMargin)&&(
                      <div style={S.card}>
                        <div style={{color:"#94a3b8",fontSize:13,marginBottom:12}}>利益率グラフ</div>
                        <ResponsiveContainer width="100%" height={200}>
                          <BarChart data={[
                            {name:"粗利率",    value:c.grossMargin?parseFloat((c.grossMargin*100).toFixed(1)):0},
                            {name:"営業利益率",value:c.opMargin?parseFloat((c.opMargin*100).toFixed(1)):0},
                            {name:"経常利益率",value:c.ordMargin?parseFloat((c.ordMargin*100).toFixed(1)):0},
                          ]}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
                            <XAxis dataKey="name" tick={{fill:"#94a3b8",fontSize:12}}/>
                            <YAxis tick={{fill:"#64748b",fontSize:11}} tickFormatter={v=>v+"%"}/>
                            <Tooltip formatter={v=>v+"%"} contentStyle={S.tooltip}/>
                            <Bar dataKey="value" fill="#4ade80" radius={[4,4,0,0]}/>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                )}

                {detailTab==="input"&&(
                  <div>
                    <div style={{marginBottom:12,padding:10,background:"#111827",borderRadius:6,fontSize:11,color:"#475569"}}>
                      📌 参考先 →{" "}
                      <a href="https://finance.yahoo.co.jp" target="_blank" rel="noreferrer" style={{color:"#60a5fa"}}>Yahoo Finance Japan</a>
                      {" / "}<a href="https://www.kabutan.jp" target="_blank" rel="noreferrer" style={{color:"#60a5fa"}}>株探</a>
                      {" / "}<a href="https://irbank.net" target="_blank" rel="noreferrer" style={{color:"#60a5fa"}}>IRバンク</a>
                      {" / "}<a href="https://www.buffett-code.com" target="_blank" rel="noreferrer" style={{color:"#60a5fa"}}>バフェットコード</a>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:14}}>
                      {INPUT_FIELDS.map(({label,key,hint})=>(
                        <FInput key={key} label={label} value={f[key]||""} onChange={v=>updateF(selected.id,key,v)} hint={hint||""}/>
                      ))}
                    </div>
                    <div style={{marginTop:16,padding:12,background:"#111827",borderRadius:8,fontSize:11,color:"#475569"}}>
                      💡 EPS・BPS は入力不要です。純利益と発行済株式数から自動計算されます。
                    </div>
                  </div>
                )}

                {detailTab==="ir"&&(
                  <div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                      <span style={{color:"#64748b",fontSize:13}}>IRニュース・適時開示情報</span>
                      <button style={S.addBtn} onClick={()=>setShowIrForm(v=>!v)}>＋ 追加</button>
                    </div>
                    {showIrForm&&(
                      <div style={{...S.card,marginBottom:16}}>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                          <FInput label="日付（例: 2025-05-08）" value={irForm.date} onChange={v=>setIrForm(p=>({...p,date:v}))}/>
                          <div style={{display:"flex",flexDirection:"column",gap:3}}>
                            <label style={{color:"#64748b",fontSize:10}}>種別</label>
                            <select value={irForm.type} style={S.select} onChange={e=>setIrForm(p=>({...p,type:e.target.value}))}>
                              {["決算","配当","人事","自社株買い","その他"].map(t=><option key={t}>{t}</option>)}
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

        {tab==="compare"&&(
          <div>
            <h2 style={S.sectionTitle}>他社比較</h2>
            <div style={{marginBottom:8,color:"#64748b",fontSize:13}}>比較したい銘柄を選択してください（最大4社）</div>
            <div style={S.stockSelector}>
              {portfolio.map(h=>(<button key={h.id} style={{...S.chipBtn,...(compareIds.includes(h.id)?S.chipActive:{})}} onClick={()=>toggleCompare(h.id)}>{h.ticker} {h.name}</button>))}
            </div>
            {compareStocks.length<2?<div style={S.card}><span style={{color:"#64748b"}}>2社以上選択してください。</span></div>:(
              <>
                <div style={{...S.card,overflowX:"auto",marginBottom:20}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                    <thead>
                      <tr style={{borderBottom:"1px solid #1e293b"}}>
                        <th style={{textAlign:"left",padding:"8px 12px",color:"#475569",fontSize:11,minWidth:150}}>指標</th>
                        {compareStocks.map((h,i)=><th key={h.id} style={{textAlign:"right",padding:"8px 12px",color:COLORS[i],minWidth:110}}>{h.ticker}<br/><span style={{fontSize:10,color:"#475569"}}>{h.name}</span></th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ["総合スコア", h=>financialScore(calcAll(h.financials)), v=>v!=null?v+"pt":"—", v=>v!=null?scoreColor(v):"#475569"],
                        ...METRIC_ROWS
                      ].map(([label,getter,formatter,colorFn])=>(
                        <tr key={label} style={{borderBottom:"1px solid #1e293b"}}>
                          <td style={{padding:"8px 12px",color:"#64748b",fontSize:12}}>{label}</td>
                          {compareStocks.map(h=>{const val=getter(h);return<td key={h.id} style={{textAlign:"right",padding:"8px 12px",color:colorFn(val),fontWeight:700}}>{formatter(val)}</td>;})}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                  <div style={S.card}>
                    <div style={{color:"#94a3b8",fontSize:13,marginBottom:12}}>PER比較</div>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={compareStocks.map(h=>({name:h.ticker,PER:parseFloat((calcAll(h.financials).per||0).toFixed(2))}))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
                        <XAxis dataKey="name" tick={{fill:"#94a3b8",fontSize:12}}/>
                        <YAxis tick={{fill:"#64748b",fontSize:11}} tickFormatter={v=>v+"x"}/>
                        <Tooltip formatter={v=>v+"倍"} contentStyle={S.tooltip}/>
                        <ReferenceLine y={15} stroke="#4ade80" strokeDasharray="4 4" label={{value:"15x",fill:"#4ade80",fontSize:10}}/>
                        <Bar dataKey="PER" fill="#818cf8" radius={[4,4,0,0]}/>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={S.card}>
                    <div style={{color:"#94a3b8",fontSize:13,marginBottom:12}}>営業利益率比較</div>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={compareStocks.map(h=>({name:h.ticker,営業利益率:parseFloat(((calcAll(h.financials).opMargin||0)*100).toFixed(1))}))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
                        <XAxis dataKey="name" tick={{fill:"#94a3b8",fontSize:12}}/>
                        <YAxis tick={{fill:"#64748b",fontSize:11}} tickFormatter={v=>v+"%"}/>
                        <Tooltip formatter={v=>v+"%"} contentStyle={S.tooltip}/>
                        <ReferenceLine y={10} stroke="#4ade80" strokeDasharray="4 4" label={{value:"10%",fill:"#4ade80",fontSize:10}}/>
                        <Bar dataKey="営業利益率" fill="#4ade80" radius={[4,4,0,0]}/>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {tab==="simulation"&&(
          <div>
            <h2 style={S.sectionTitle}>シミュレーション</h2>
            <div style={S.stockSelector}>
              {portfolio.map(h=>(<button key={h.id} style={{...S.chipBtn,...(selected?.id===h.id?S.chipActive:{})}} onClick={()=>handleSelect(h)}>{h.ticker} {h.name}</button>))}
            </div>
            {!selected&&<div style={S.card}><span style={{color:"#64748b"}}>銘柄を選択してください。</span></div>}
            {selected&&(
              <>
                {/* 設定パネル */}
                <div style={{...S.card,marginBottom:16}}>
                  <div style={{color:"#94a3b8",fontWeight:700,marginBottom:12}}>⚙️ シミュレーション設定 — {selected.name}（{selected.ticker}）</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(155px,1fr))",gap:12}}>
                    <FInput label="予測年数（年）" value={simParams.years} onChange={v=>setSimParams(p=>({...p,years:v}))}/>
                    <FInput label="売上成長率（基本）%" value={simParams.growthRate} onChange={v=>setSimParams(p=>({...p,growthRate:v}))}/>
                    <FInput label="目標営業利益率 %" value={simParams.targetMargin} onChange={v=>setSimParams(p=>({...p,targetMargin:v}))}/>
                    <FInput label="目標PER（倍）" value={simParams.targetPer} onChange={v=>setSimParams(p=>({...p,targetPer:v}))}/>
                    <FInput label="目標EV/EBITDA（任意）" value={simParams.targetEvEbitda} onChange={v=>setSimParams(p=>({...p,targetEvEbitda:v}))}/>
                    <FInput label="配当利回り %" value={simParams.dividendRate} onChange={v=>setSimParams(p=>({...p,dividendRate:v}))}/>
                    <div style={{display:"flex",flexDirection:"column",gap:3}}>
                      <label style={{color:"#64748b",fontSize:10}}>配当再投資</label>
                      <button style={{...S.miniBtn,padding:"8px 12px",color:simParams.reinvest?"#4ade80":"#64748b",borderColor:simParams.reinvest?"#4ade80":"#334155"}} onClick={()=>setSimParams(p=>({...p,reinvest:!p.reinvest}))}>
                        {simParams.reinvest?"あり（複利）":"なし（単純）"}
                      </button>
                    </div>
                  </div>
                  <div style={{marginTop:12,fontSize:11,color:"#334155"}}>
                    強気シナリオ: 成長率×1.6 / 弱気シナリオ: 成長率×0.4（自動計算）
                  </div>
                </div>

                {/* サブタブ */}
                <div style={{display:"flex",gap:4,marginBottom:16,flexWrap:"wrap"}}>
                  {["scenario","margin","monte"].map(t=>(
                    <button key={t} style={{...S.navBtn,...(simTab===t?S.navActive:{})}} onClick={()=>setSimTab(t)}>
                      {{"scenario":"シナリオ分析","margin":"安全余裕率","monte":"モンテカルロ"}[t]}
                    </button>
                  ))}
                </div>

                {/* ── シナリオ分析 ── */}
                {simTab==="scenario"&&(
                  <div>
                    <div style={S.card}>
                      <div style={{color:"#94a3b8",fontWeight:700,marginBottom:4}}>📈 株価推定（3シナリオ比較）</div>
                      <div style={{color:"#475569",fontSize:12,marginBottom:12}}>
                        <span style={{color:"#4ade80"}}>■ 強気</span>: {Math.round(+simParams.growthRate*1.6)}%成長・PER{Math.round(+simParams.targetPer*1.2)}倍　
                        <span style={{color:"#60a5fa"}}>■ 基本</span>: {simParams.growthRate}%成長・PER{simParams.targetPer}倍　
                        <span style={{color:"#f87171"}}>■ 弱気</span>: {Math.round(+simParams.growthRate*0.4)}%成長・PER{Math.round(+simParams.targetPer*0.8)}倍
                      </div>
                      <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={simData()}>
                          <defs>
                            <linearGradient id="gbull" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#4ade80" stopOpacity={0.2}/><stop offset="95%" stopColor="#4ade80" stopOpacity={0}/></linearGradient>
                            <linearGradient id="gbase" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#60a5fa" stopOpacity={0.2}/><stop offset="95%" stopColor="#60a5fa" stopOpacity={0}/></linearGradient>
                            <linearGradient id="gbear" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f87171" stopOpacity={0.15}/><stop offset="95%" stopColor="#f87171" stopOpacity={0}/></linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
                          <XAxis dataKey="year" tick={{fill:"#94a3b8",fontSize:12}}/>
                          <YAxis tick={{fill:"#64748b",fontSize:11}} tickFormatter={v=>v?.toLocaleString()}/>
                          <Tooltip formatter={v=>v?"¥"+v?.toLocaleString():"—"} contentStyle={S.tooltip}/>
                          <ReferenceLine y={n(f.price)||selected.currentPrice} stroke="#f59e0b" strokeDasharray="4 4" label={{value:"現在株価",fill:"#f59e0b",fontSize:10}}/>
                          <ReferenceLine y={selected.avgCost} stroke="#a78bfa" strokeDasharray="4 4" label={{value:"取得単価",fill:"#a78bfa",fontSize:10}}/>
                          <Legend wrapperStyle={{color:"#94a3b8",fontSize:12}}/>
                          <Area type="monotone" dataKey="bull株価" stroke="#4ade80" strokeWidth={2} fill="url(#gbull)" name="強気"/>
                          <Area type="monotone" dataKey="base株価" stroke="#60a5fa" strokeWidth={2} fill="url(#gbase)" name="基本"/>
                          <Area type="monotone" dataKey="bear株価" stroke="#f87171" strokeWidth={2} fill="url(#gbear)" name="弱気"/>
                          {simData().some(d=>d.EV推定株価)&&<Line type="monotone" dataKey="EV推定株価" stroke="#a78bfa" strokeWidth={2} strokeDasharray="4 4" name="EV/EBITDA法"/>}
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>

                    {/* 損益分岐点カード */}
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12,marginBottom:16}}>
                      {["bull株価","base株価","bear株価"].map((key,i)=>{
                        const label=["強気","基本","弱気"][i];
                        const color=["#4ade80","#60a5fa","#f87171"][i];
                        const rows=simData();
                        const breakYear=rows.findIndex(r=>r[key]&&r[key]>selected.avgCost);
                        const finalPrice=rows[rows.length-1]?.[key];
                        const cagr=finalPrice&&selected.currentPrice>0?((Math.pow(finalPrice/selected.currentPrice,1/(+simParams.years||1))-1)*100).toFixed(1):null;
                        return(
                          <div key={key} style={{background:"#111827",border:`1px solid ${color}33`,borderRadius:8,padding:"12px 16px"}}>
                            <div style={{color,fontWeight:700,fontSize:13,marginBottom:8}}>{label}シナリオ</div>
                            <div style={{color:"#475569",fontSize:11,marginBottom:4}}>最終株価予測</div>
                            <div style={{color,fontWeight:700,fontSize:18,marginBottom:8}}>{"¥"+(finalPrice?.toLocaleString()??"—")}</div>
                            <div style={{color:"#475569",fontSize:11}}>年率リターン: <span style={{color}}>{cagr?cagr+"%":"—"}</span></div>
                            <div style={{color:"#475569",fontSize:11,marginTop:4}}>取得単価超え: <span style={{color}}>{breakYear===0?"現在すでに超過":breakYear>0?breakYear+"年後":"期間内に到達せず"}</span></div>
                          </div>
                        );
                      })}
                    </div>

                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
                      <div style={S.card}>
                        <div style={{color:"#94a3b8",fontWeight:700,marginBottom:4}}>💰 配当累計</div>
                        <div style={{color:"#475569",fontSize:12,marginBottom:12}}>利回り{simParams.dividendRate}% {simParams.reinvest?"複利":"単純"}</div>
                        <ResponsiveContainer width="100%" height={180}>
                          <BarChart data={simData()}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
                            <XAxis dataKey="year" tick={{fill:"#94a3b8",fontSize:11}}/>
                            <YAxis tick={{fill:"#64748b",fontSize:10}} tickFormatter={v=>v?.toLocaleString()}/>
                            <Tooltip formatter={v=>"¥"+v?.toLocaleString()} contentStyle={S.tooltip}/>
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
                      <div style={{color:"#94a3b8",fontWeight:700,marginBottom:12}}>📋 サマリーテーブル</div>
                      <div style={{overflowX:"auto"}}>
                        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                          <thead>
                            <tr style={{borderBottom:"1px solid #1e293b"}}>
                              {["年","強気株価","基本株価","弱気株価","EV法","EPS","売上","営業利益","配当累計"].map(h=>(
                                <th key={h} style={{textAlign:"right",padding:"6px 10px",color:"#475569",fontSize:11,whiteSpace:"nowrap"}}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {simData().map((row,i)=>(
                              <tr key={i} style={{borderBottom:"1px solid #1e293b",background:i===0?"#111827":"transparent"}}>
                                <td style={{padding:"8px 10px",color:"#94a3b8",fontWeight:i===0?700:400}}>{row.year}</td>
                                <td style={{textAlign:"right",padding:"8px 10px",color:"#4ade80",fontWeight:700}}>{"¥"+(row.bull株価?.toLocaleString()??"—")}</td>
                                <td style={{textAlign:"right",padding:"8px 10px",color:"#60a5fa",fontWeight:700}}>{"¥"+(row.base株価?.toLocaleString()??"—")}</td>
                                <td style={{textAlign:"right",padding:"8px 10px",color:"#f87171"}}>{"¥"+(row.bear株価?.toLocaleString()??"—")}</td>
                                <td style={{textAlign:"right",padding:"8px 10px",color:"#a78bfa"}}>{row.EV推定株価?"¥"+row.EV推定株価?.toLocaleString():"—"}</td>
                                <td style={{textAlign:"right",padding:"8px 10px",color:"#e2e8f0"}}>{"¥"+row.EPS}</td>
                                <td style={{textAlign:"right",padding:"8px 10px",color:"#94a3b8"}}>{fmtM(row.売上)}</td>
                                <td style={{textAlign:"right",padding:"8px 10px",color:"#94a3b8"}}>{fmtM(row.営業利益)}</td>
                                <td style={{textAlign:"right",padding:"8px 10px",color:"#fbbf24"}}>{"¥"+row.配当累計?.toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── 安全余裕率 ── */}
                {simTab==="margin"&&(
                  <div>
                    {!safetyMargin&&<div style={S.card}><span style={{color:"#64748b"}}>純利益・発行済株式数・目標PERを入力すると計算されます。</span></div>}
                    {safetyMargin&&(()=>{
                      const { fairPrice, currentPrice, margin } = safetyMargin;
                      const isUnder = margin > 0;
                      const barW = Math.min(Math.abs(margin), 100);
                      return(
                        <div>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16,marginBottom:16}}>
                            <div style={{background:"#111827",borderRadius:8,padding:"16px",textAlign:"center"}}>
                              <div style={{color:"#475569",fontSize:11,marginBottom:6}}>適正株価（PERベース）</div>
                              <div style={{color:"#f1f5f9",fontWeight:900,fontSize:28}}>¥{fairPrice.toLocaleString()}</div>
                              <div style={{color:"#475569",fontSize:10,marginTop:4}}>目標PER {simParams.targetPer}倍 × EPS</div>
                            </div>
                            <div style={{background:"#111827",borderRadius:8,padding:"16px",textAlign:"center"}}>
                              <div style={{color:"#475569",fontSize:11,marginBottom:6}}>現在株価</div>
                              <div style={{color:"#f1f5f9",fontWeight:900,fontSize:28}}>¥{currentPrice.toLocaleString()}</div>
                              <div style={{color:"#475569",fontSize:10,marginTop:4}}>入力値</div>
                            </div>
                            <div style={{background:isUnder?"#0f2a1a":"#2a0f0f",border:`1px solid ${isUnder?"#4ade80":"#f87171"}44`,borderRadius:8,padding:"16px",textAlign:"center"}}>
                              <div style={{color:"#475569",fontSize:11,marginBottom:6}}>安全余裕率</div>
                              <div style={{color:isUnder?"#4ade80":"#f87171",fontWeight:900,fontSize:28}}>{isUnder?"+":""}{margin.toFixed(1)}%</div>
                              <div style={{color:"#475569",fontSize:10,marginTop:4}}>{isUnder?"割安（買い余地あり）":"割高（適正価格超え）"}</div>
                            </div>
                          </div>

                          {/* ゲージバー */}
                          <div style={S.card}>
                            <div style={{color:"#94a3b8",fontWeight:700,marginBottom:16}}>株価ポジショニング</div>
                            <div style={{position:"relative",height:60,background:"#111827",borderRadius:8,overflow:"hidden",marginBottom:8}}>
                              {/* グラデーション背景 */}
                              <div style={{position:"absolute",inset:0,background:"linear-gradient(to right, #f87171, #fbbf24, #4ade80)",opacity:0.15}}/>
                              {/* 適正株価ライン */}
                              <div style={{position:"absolute",top:0,bottom:0,left:"50%",width:2,background:"#4ade80",opacity:0.6}}/>
                              <div style={{position:"absolute",top:4,left:"50%",transform:"translateX(-50%)",color:"#4ade80",fontSize:9,whiteSpace:"nowrap"}}>適正株価 ¥{fairPrice.toLocaleString()}</div>
                              {/* 現在株価マーカー */}
                              {(()=>{
                                const pos = 50 - Math.min(Math.max(margin,-50),50);
                                return(
                                  <div style={{position:"absolute",top:0,bottom:0,left:`${pos}%`,width:3,background:"#f59e0b",borderRadius:2}}>
                                    <div style={{position:"absolute",bottom:4,left:"50%",transform:"translateX(-50%)",color:"#f59e0b",fontSize:9,whiteSpace:"nowrap"}}>現在 ¥{currentPrice.toLocaleString()}</div>
                                  </div>
                                );
                              })()}
                            </div>
                            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#334155"}}>
                              <span>← 割高</span><span>適正</span><span>割安 →</span>
                            </div>
                          </div>

                          {/* 感度分析：PERを変えたときの適正株価 */}
                          {c.eps&&c.eps>0&&(
                            <div style={S.card}>
                              <div style={{color:"#94a3b8",fontWeight:700,marginBottom:12}}>PER感度分析（EPSが一定の場合）</div>
                              <ResponsiveContainer width="100%" height={200}>
                                <BarChart data={[10,12,15,18,20,25,30].map(per=>({
                                  PER:per+"倍",
                                  適正株価:Math.round(c.eps*per),
                                  isCurrent:per===+simParams.targetPer
                                }))}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
                                  <XAxis dataKey="PER" tick={{fill:"#94a3b8",fontSize:11}}/>
                                  <YAxis tick={{fill:"#64748b",fontSize:10}} tickFormatter={v=>v.toLocaleString()}/>
                                  <Tooltip formatter={v=>"¥"+v.toLocaleString()} contentStyle={S.tooltip}/>
                                  <ReferenceLine y={currentPrice} stroke="#f59e0b" strokeDasharray="4 4" label={{value:"現在株価",fill:"#f59e0b",fontSize:10}}/>
                                  <Bar dataKey="適正株価" radius={[4,4,0,0]} fill="#60a5fa"/>
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* ── モンテカルロ ── */}
                {simTab==="monte"&&(
                  <div>
                    {(!c.eps||c.eps<=0)&&<div style={S.card}><span style={{color:"#64748b"}}>純利益・発行済株式数を入力するとシミュレーションできます。</span></div>}
                    {c.eps&&c.eps>0&&monteData.stats&&(()=>{
                      const { p10,p25,p50,p75,p90,mean,probProfit,price } = monteData.stats;
                      return(
                        <div>
                          <div style={{...S.card,marginBottom:16}}>
                            <div style={{color:"#94a3b8",fontWeight:700,marginBottom:4}}>🎲 モンテカルロシミュレーション（1,000回試行）</div>
                            <div style={{color:"#475569",fontSize:12,marginBottom:16}}>
                              成長率にランダムなブレ（±50%）とPERの変動を加えた{simParams.years}年後の株価分布です。
                            </div>
                            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10,marginBottom:20}}>
                              {[
                                ["10パーセンタイル",p10,"#f87171"],
                                ["25パーセンタイル",p25,"#fbbf24"],
                                ["中央値（50%）",p50,"#60a5fa"],
                                ["75パーセンタイル",p75,"#4ade80"],
                                ["90パーセンタイル",p90,"#a78bfa"],
                                ["平均値",mean,"#e2e8f0"],
                              ].map(([label,val,color])=>(
                                <div key={label} style={{background:"#111827",borderRadius:8,padding:"10px 12px"}}>
                                  <div style={{color:"#475569",fontSize:10,marginBottom:4}}>{label}</div>
                                  <div style={{color,fontWeight:700,fontSize:15}}>¥{val?.toLocaleString()}</div>
                                </div>
                              ))}
                            </div>

                            {/* プロフィット確率 */}
                            <div style={{background:"#111827",borderRadius:8,padding:"12px 16px",marginBottom:16}}>
                              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                                <span style={{color:"#94a3b8",fontSize:13}}>現在株価より上昇する確率</span>
                                <span style={{color:probProfit>50?"#4ade80":"#f87171",fontWeight:700,fontSize:20}}>{probProfit.toFixed(1)}%</span>
                              </div>
                              <div style={{height:8,background:"#1e293b",borderRadius:4,overflow:"hidden"}}>
                                <div style={{height:"100%",width:`${probProfit}%`,background:probProfit>50?"#4ade80":"#f87171",borderRadius:4,transition:"width 0.5s"}}/>
                              </div>
                              <div style={{display:"flex",justifyContent:"space-between",marginTop:4,fontSize:10,color:"#334155"}}>
                                <span>現在株価 ¥{price.toLocaleString()}</span>
                                <span>{(100-probProfit).toFixed(1)}% が下落</span>
                              </div>
                            </div>

                            {/* ヒストグラム */}
                            <div style={{color:"#94a3b8",fontSize:13,marginBottom:12}}>{simParams.years}年後の株価分布（ヒストグラム）</div>
                            <ResponsiveContainer width="100%" height={220}>
                              <BarChart data={monteData.chartData} margin={{left:0,right:0}}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
                                <XAxis dataKey="range" tick={{fill:"#64748b",fontSize:9}} interval={3}/>
                                <YAxis tick={{fill:"#64748b",fontSize:10}} tickFormatter={v=>v+"件"}/>
                                <Tooltip formatter={v=>v+"件"} labelFormatter={v=>"¥"+v} contentStyle={S.tooltip}/>
                                <ReferenceLine x={price.toLocaleString()} stroke="#f59e0b" label={{value:"現在",fill:"#f59e0b",fontSize:9}}/>
                                <Bar dataKey="count" radius={[2,2,0,0]}
                                  fill="#60a5fa"
                                  label={false}
                                />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>

                          {/* パーセンタイル帯グラフ */}
                          <div style={S.card}>
                            <div style={{color:"#94a3b8",fontWeight:700,marginBottom:4}}>信頼区間バンド（年次推移）</div>
                            <div style={{color:"#475569",fontSize:12,marginBottom:12}}>緑帯: 25〜75パーセンタイル　外帯: 10〜90パーセンタイル</div>
                            <ResponsiveContainer width="100%" height={250}>
                              <AreaChart data={simData()}>
                                <defs>
                                  <linearGradient id="band90" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#475569" stopOpacity={0.3}/><stop offset="95%" stopColor="#475569" stopOpacity={0.05}/></linearGradient>
                                  <linearGradient id="band75" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#4ade80" stopOpacity={0.3}/><stop offset="95%" stopColor="#4ade80" stopOpacity={0.05}/></linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
                                <XAxis dataKey="year" tick={{fill:"#94a3b8",fontSize:12}}/>
                                <YAxis tick={{fill:"#64748b",fontSize:11}} tickFormatter={v=>v?.toLocaleString()}/>
                                <Tooltip formatter={v=>v?"¥"+v?.toLocaleString():"—"} contentStyle={S.tooltip}/>
                                <ReferenceLine y={price} stroke="#f59e0b" strokeDasharray="4 4" label={{value:"現在株価",fill:"#f59e0b",fontSize:10}}/>
                                <Legend wrapperStyle={{color:"#94a3b8",fontSize:12}}/>
                                <Area type="monotone" dataKey="bull株価" stroke="#475569" strokeWidth={1} fill="url(#band90)" name="90%帯（強気）" strokeDasharray="4 4"/>
                                <Area type="monotone" dataKey="base株価" stroke="#4ade80" strokeWidth={2} fill="url(#band75)" name="中央値"/>
                                <Area type="monotone" dataKey="bear株価" stroke="#475569" strokeWidth={1} fill="none" name="10%帯（弱気）" strokeDasharray="4 4"/>
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      );
                    })()}
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
  tableHeader:{ display:"grid", gridTemplateColumns:"2fr 0.7fr 0.7fr 1fr 1fr 1.2fr 1.1fr 1fr 0.7fr 1.2fr", padding:"10px 16px", background:"#111827", gap:8 },
  th:{ fontSize:10, color:"#475569", textTransform:"uppercase", letterSpacing:1 },
  tableRow:{ display:"grid", gridTemplateColumns:"2fr 0.7fr 0.7fr 1fr 1fr 1.2fr 1.1fr 1fr 0.7fr 1.2fr", padding:"12px 16px", gap:8, borderTop:"1px solid #1e293b", alignItems:"center" },
  tableRowActive:{ background:"#0f2a1a" },
  stockSelector:{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:16 },
  chipBtn:{ background:"#111827", border:"1px solid #1e293b", color:"#94a3b8", padding:"6px 12px", borderRadius:20, cursor:"pointer", fontSize:12, fontFamily:"inherit" },
  chipActive:{ background:"#0f2a1a", border:"1px solid #4ade80", color:"#4ade80" },
  addBtn:{ background:"#0f2a1a", border:"1px solid #4ade80", color:"#4ade80", padding:"8px 16px", borderRadius:6, cursor:"pointer", fontSize:13, fontFamily:"inherit", fontWeight:700 },
  input:{ background:"#111827", border:"1px solid #1e293b", color:"#e2e8f0", padding:"8px 12px", borderRadius:6, fontSize:13, fontFamily:"inherit", outline:"none", width:"100%", boxSizing:"border-box" },
  select:{ background:"#111827", border:"1px solid #1e293b", color:"#e2e8f0", padding:"8px 12px", borderRadius:6, fontSize:13, fontFamily:"inherit", width:"100%" },
  miniBtn:{ background:"#111827", border:"1px solid #334155", color:"#64748b", padding:"4px 10px", borderRadius:4, cursor:"pointer", fontSize:11, fontFamily:"inherit" },
  tooltip:{ background:"#0d1424", border:"1px solid #1e293b", borderRadius:6, color:"#e2e8f0", fontSize:12 },
};
