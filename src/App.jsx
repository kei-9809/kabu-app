import { useState, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend
} from "recharts";

// ── helpers ──────────────────────────────────────────────────────────────────
const fmt = (v, d = 2) => v == null || isNaN(v) ? "—" : parseFloat(v).toFixed(d);
const fmtM = v => v == null || isNaN(v) ? "—" : (v >= 10000 ? (v/10000).toFixed(1)+"兆" : v >= 1 ? v.toFixed(0)+"億" : (v*100).toFixed(0)+"百万");

function calcMetrics(d) {
  const price = +d.price || 0;
  const shares = +d.shares || 0; // 百万株
  const eps = +d.eps || 0;
  const bps = +d.bps || 0;
  const sales = +d.sales || 0; // 億円
  const ebitda = +d.ebitda || 0;
  const netAssets = +d.netAssets || 0;
  const netDebt = +d.netDebt || 0;
  const roe = +d.roe || 0;

  const marketCap = price * shares / 100; // 億円
  const per = eps > 0 ? price / eps : null;
  const pbr = bps > 0 ? price / bps : null;
  const psr = sales > 0 && shares > 0 ? marketCap / sales : null;
  const ev = marketCap + netDebt;
  const evEbitda = ebitda > 0 ? ev / ebitda : null;

  return { marketCap, per, pbr, psr, evEbitda, roe };
}

function generatePriceHistory(base, days = 60) {
  const data = []; let price = base;
  for (let i = days; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    price *= 1 + (Math.random() - 0.48) * 0.03;
    data.push({ date: `${d.getMonth()+1}/${d.getDate()}`, price: parseFloat(price.toFixed(2)) });
  }
  return data;
}

const EMPTY_FINANCIALS = { price:"", shares:"", eps:"", bps:"", sales:"", ebitda:"", netAssets:"", netDebt:"", roe:"", shinyoBairitu:"" };
const EMPTY_IR = { date:"", title:"", url:"", type:"決算" };

const INITIAL_PORTFOLIO = [
  { id:1, ticker:"7203", name:"トヨタ自動車", market:"JP", qty:100, avgCost:2850, currentPrice:3124, sector:"自動車",
    financials:{ price:"3124", shares:"14430", eps:"306", bps:"2841", sales:"439000", ebitda:"45000", netAssets:"410000", netDebt:"150000", roe:"10.8", shinyoBairitu:"2.1" },
    irList:[ { date:"2025-05-08", title:"2025年3月期 決算短信", url:"https://www.toyota.co.jp/ir", type:"決算" }, { date:"2025-03-28", title:"配当予想の修正に関するお知らせ", url:"https://www.toyota.co.jp/ir", type:"配当" } ] },
  { id:2, ticker:"6758", name:"ソニーグループ", market:"JP", qty:50, avgCost:12400, currentPrice:13250, sector:"電機",
    financials:{ price:"13250", shares:"1190", eps:"720", bps:"5760", sales:"130000", ebitda:"18000", netAssets:"68000", netDebt:"20000", roe:"12.5", shinyoBairitu:"1.4" },
    irList:[] },
  { id:3, ticker:"AAPL", name:"Apple Inc.", market:"US", qty:20, avgCost:168, currentPrice:189, sector:"Technology",
    financials:{ price:"189", shares:"15200", eps:"6.43", bps:"4.0", sales:"3856", ebitda:"1300", netAssets:"600", netDebt:"-390", roe:"160", shinyoBairitu:"" },
    irList:[] },
  { id:4, ticker:"NVDA", name:"NVIDIA Corp.", market:"US", qty:10, avgCost:450, currentPrice:875, sector:"Technology",
    financials:{ price:"875", shares:"24400", eps:"13.4", bps:"22.9", sales:"600", ebitda:"410", netAssets:"560", netDebt:"-90", roe:"58", shinyoBairitu:"" },
    irList:[] },
  { id:5, ticker:"9984", name:"ソフトバンクG", market:"JP", qty:200, avgCost:7200, currentPrice:6850, sector:"通信",
    financials:{ price:"6850", shares:"2110", eps:"", bps:"3800", sales:"60000", ebitda:"9000", netAssets:"80000", netDebt:"180000", roe:"", shinyoBairitu:"3.2" },
    irList:[] },
];

// ── sub components ────────────────────────────────────────────────────────────
const Tag = ({ children, color="#4ade80" }) => (
  <span style={{ background:color+"22", color, border:`1px solid ${color}44`, borderRadius:4, padding:"2px 8px", fontSize:11, fontWeight:600 }}>{children}</span>
);
const Δ = ({ val, fmt: f = v => v.toFixed(2) }) => (
  <span style={{ color: val>=0?"#4ade80":"#f87171", fontWeight:700 }}>{val>=0?"▲":"▼"} {f(Math.abs(val))}</span>
);
const MetricBox = ({ label, value, color="#94a3b8", hint="" }) => (
  <div style={{ background:"#111827", borderRadius:8, padding:"10px 14px" }}>
    <div style={{ color:"#475569", fontSize:11, marginBottom:3 }}>{label}</div>
    <div style={{ color, fontWeight:700, fontSize:15 }}>{value ?? "—"}</div>
    {hint && <div style={{ color:"#334155", fontSize:10, marginTop:2 }}>{hint}</div>}
  </div>
);
const Input = ({ label, value, onChange, unit="" }) => (
  <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
    <label style={{ color:"#64748b", fontSize:11 }}>{label}</label>
    <div style={{ display:"flex", alignItems:"center", gap:4 }}>
      <input value={value} onChange={e=>onChange(e.target.value)} style={S.input} />
      {unit && <span style={{ color:"#475569", fontSize:11 }}>{unit}</span>}
    </div>
  </div>
);

// ── main ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("portfolio");
  const [portfolio, setPortfolio] = useState(INITIAL_PORTFOLIO);
  const [selected, setSelected] = useState(INITIAL_PORTFOLIO[0]);
  const [selectedChart] = useState(() => generatePriceHistory(INITIAL_PORTFOLIO[0].currentPrice));
  const [detailTab, setDetailTab] = useState("metrics");

  // compare
  const [compareIds, setCompareIds] = useState([]);

  // simulation
  const [simParams, setSimParams] = useState({ years:"5", growthRate:"10", targetPer:"15", dividendRate:"2", reinvest:true });

  // IR form
  const [irForm, setIrForm] = useState({ ...EMPTY_IR });
  const [showIrForm, setShowIrForm] = useState(false);

  // portfolio add
  const [addForm, setAddForm] = useState({ ticker:"", name:"", market:"JP", qty:"", avgCost:"", currentPrice:"" });
  const [showAdd, setShowAdd] = useState(false);

  const totalCost = portfolio.reduce((s,h)=>s+h.qty*h.avgCost,0);
  const totalValue = portfolio.reduce((s,h)=>s+h.qty*h.currentPrice,0);
  const totalPnL = totalValue - totalCost;
  const totalPnLPct = (totalPnL/totalCost)*100;

  const updateFinancials = useCallback((id, key, val) => {
    setPortfolio(p => p.map(h => h.id===id ? {...h, financials:{...h.financials,[key]:val}} : h));
    if (selected?.id === id) setSelected(s => ({...s, financials:{...s.financials,[key]:val}}));
  }, [selected]);

  const addIR = useCallback(() => {
    if (!irForm.title || !irForm.date) return;
    setPortfolio(p => p.map(h => h.id===selected.id ? {...h, irList:[irForm,...(h.irList||[])]} : h));
    setSelected(s => ({...s, irList:[irForm,...(s.irList||[])]}));
    setIrForm({...EMPTY_IR}); setShowIrForm(false);
  }, [irForm, selected]);

  const deleteIR = useCallback((idx) => {
    setPortfolio(p => p.map(h => h.id===selected.id ? {...h, irList:h.irList.filter((_,i)=>i!==idx)} : h));
    setSelected(s => ({...s, irList:s.irList.filter((_,i)=>i!==idx)}));
  }, [selected]);

  const handleSelectStock = (h) => { setSelected(h); };

  const handleAddStock = () => {
    const { ticker, name, market, qty, avgCost, currentPrice } = addForm;
    if (!ticker||!name||!qty||!avgCost||!currentPrice) return;
    const newStock = { id:Date.now(), ticker, name, market, qty:+qty, avgCost:+avgCost, currentPrice:+currentPrice, sector:"—", financials:{...EMPTY_FINANCIALS, price:currentPrice}, irList:[] };
    setPortfolio(p=>[...p,newStock]);
    setAddForm({ ticker:"", name:"", market:"JP", qty:"", avgCost:"", currentPrice:"" });
    setShowAdd(false);
  };

  const toggleCompare = (id) => {
    setCompareIds(prev => prev.includes(id) ? prev.filter(x=>x!==id) : prev.length<4 ? [...prev,id] : prev);
  };

  // simulation calc
  const simResults = useCallback(() => {
    if (!selected) return [];
    const f = selected.financials;
    const price = +f.price || selected.currentPrice;
    const eps = +f.eps || 0;
    const sales = +f.sales || 0;
    const growth = +simParams.growthRate / 100;
    const targetPer = +simParams.targetPer;
    const divRate = +simParams.dividendRate / 100;
    const years = +simParams.years || 5;
    const results = [];
    for (let y = 0; y <= years; y++) {
      const growFactor = Math.pow(1+growth, y);
      const projEps = eps * growFactor;
      const projSales = sales * growFactor;
      const priceFromPer = projEps * targetPer;
      const priceFromPsr = projSales > 0 && (+f.shares||0) > 0 ? (projSales / ((+f.shares||1)/100)) * (+f.psr||1) : null;
      const divCum = simParams.reinvest
        ? price * (Math.pow(1+divRate,y) - 1)
        : price * divRate * y;
      results.push({
        year: y===0?"現在":`${y}年後`,
        株価推定_PER: priceFromPer > 0 ? Math.round(priceFromPer) : null,
        配当累計: Math.round(divCum),
        売上推移: Math.round(projSales),
      });
    }
    return results;
  }, [selected, simParams]);

  // compare data
  const compareStocks = portfolio.filter(h => compareIds.includes(h.id));
  const compareMetricKeys = ["per","pbr","psr","evEbitda","roe"];
  const compareMetricLabels = { per:"PER", pbr:"PBR", psr:"PSR", evEbitda:"EV/EBITDA", roe:"ROE(%)" };

  const radarData = compareMetricKeys.map(k => {
    const entry = { metric: compareMetricLabels[k] };
    compareStocks.forEach(h => {
      const m = calcMetrics(h.financials);
      entry[h.ticker] = parseFloat(m[k]) || 0;
    });
    return entry;
  });

  const COLORS = ["#4ade80","#60a5fa","#f59e0b","#a78bfa"];
  const typeColor = t => t==="決算"?"#4ade80":t==="配当"?"#fbbf24":t==="人事"?"#a78bfa":"#64748b";

  const m = selected ? calcMetrics(selected.financials) : {};
  const f = selected?.financials || {};

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
        {tab==="portfolio" && (
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h2 style={S.sectionTitle}>保有銘柄一覧</h2>
              <button style={S.addBtn} onClick={()=>setShowAdd(v=>!v)}>＋ 銘柄追加</button>
            </div>
            {showAdd && (
              <div style={S.addForm}>
                {[["ticker","ティッカー"],["name","銘柄名"],["qty","数量"],["avgCost","取得単価"],["currentPrice","現在値"]].map(([k,label])=>(
                  <input key={k} placeholder={label} value={addForm[k]} style={S.input} onChange={e=>setAddForm(f=>({...f,[k]:e.target.value}))}/>
                ))}
                <select value={addForm.market} style={S.select} onChange={e=>setAddForm(f=>({...f,market:e.target.value}))}>
                  <option value="JP">日本株</option><option value="US">米国株</option>
                </select>
                <button style={S.addBtn} onClick={handleAddStock}>追加</button>
              </div>
            )}
            <div style={S.table}>
              <div style={S.tableHeader}>
                {["銘柄","市場","保有数","取得単価","現在値","評価額","損益","損益率",""].map(h=>(
                  <span key={h} style={S.th}>{h}</span>
                ))}
              </div>
              {portfolio.map(h=>{
                const pnl=(h.currentPrice-h.avgCost)*h.qty;
                const pnlPct=((h.currentPrice-h.avgCost)/h.avgCost)*100;
                return (
                  <div key={h.id} style={{...S.tableRow,...(selected?.id===h.id?S.tableRowActive:{})}}>
                    <span style={{fontWeight:700,color:"#e2e8f0"}}>{h.name}<br/><Tag color={h.market==="JP"?"#60a5fa":"#f59e0b"}>{h.ticker}</Tag></span>
                    <span><Tag color={h.market==="JP"?"#60a5fa":"#f59e0b"}>{h.market}</Tag></span>
                    <span style={{color:"#94a3b8"}}>{h.qty.toLocaleString()}</span>
                    <span style={{color:"#94a3b8"}}>{h.avgCost.toLocaleString()}</span>
                    <span style={{fontWeight:700,color:"#e2e8f0"}}>{h.currentPrice.toLocaleString()}</span>
                    <span style={{color:"#e2e8f0"}}>{(h.qty*h.currentPrice).toLocaleString()}</span>
                    <span><Δ val={pnl} fmt={v=>Math.round(v).toLocaleString()}/></span>
                    <span><Δ val={pnlPct} fmt={v=>v.toFixed(2)+"%"}/></span>
                    <span style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                      <button style={S.miniBtn} onClick={()=>{handleSelectStock(h);setTab("detail");}}>詳細</button>
                      <button style={{...S.miniBtn,...(compareIds.includes(h.id)?{color:"#4ade80",borderColor:"#4ade80"}:{})}}
                        onClick={()=>toggleCompare(h.id)}>{compareIds.includes(h.id)?"比較中":"比較"}</button>
                    </span>
                  </div>
                );
              })}
            </div>
            {compareIds.length>0 && (
              <div style={{marginTop:12,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                <span style={{color:"#64748b",fontSize:13}}>比較選択中:</span>
                {compareIds.map(id=>{
                  const h=portfolio.find(x=>x.id===id);
                  return <Tag key={id} color="#4ade80">{h?.ticker}</Tag>;
                })}
                <button style={S.miniBtn} onClick={()=>{setTab("compare");}}>比較画面へ →</button>
              </div>
            )}
          </div>
        )}

        {/* ── DETAIL ── */}
        {tab==="detail" && (
          <div>
            <h2 style={S.sectionTitle}>銘柄詳細</h2>
            <div style={S.stockSelector}>
              {portfolio.map(h=>(
                <button key={h.id} style={{...S.chipBtn,...(selected?.id===h.id?S.chipActive:{})}} onClick={()=>handleSelectStock(h)}>
                  {h.ticker}
                </button>
              ))}
            </div>
            {selected && (
              <>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
                  <div>
                    <span style={{fontSize:20,fontWeight:800,color:"#f1f5f9",marginRight:12}}>{selected.name}</span>
                    <Tag color={selected.market==="JP"?"#60a5fa":"#f59e0b"}>{selected.market} : {selected.ticker}</Tag>
                  </div>
                </div>

                <div style={{display:"flex",gap:4,marginBottom:20,borderBottom:"1px solid #1e293b",paddingBottom:8,flexWrap:"wrap"}}>
                  {["metrics","input","ir"].map(t=>(
                    <button key={t} style={{...S.navBtn,...(detailTab===t?S.navActive:{})}} onClick={()=>setDetailTab(t)}>
                      {{"metrics":"財務指標","input":"数値入力","ir":"IRニュース"}[t]}
                    </button>
                  ))}
                </div>

                {/* METRICS */}
                {detailTab==="metrics" && (
                  <div>
                    <div style={{marginBottom:8,color:"#475569",fontSize:12}}>「数値入力」タブで入力した値から自動計算しています。</div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:12,marginBottom:20}}>
                      <MetricBox label="PER" value={m.per?fmt(m.per)+"x":"—"} color={m.per&&m.per<15?"#4ade80":m.per&&m.per<30?"#fbbf24":"#f87171"} hint="株価収益率"/>
                      <MetricBox label="PBR" value={m.pbr?fmt(m.pbr)+"x":"—"} color={m.pbr&&m.pbr<1.5?"#4ade80":"#94a3b8"} hint="株価純資産倍率"/>
                      <MetricBox label="PSR" value={m.psr?fmt(m.psr)+"x":"—"} color={m.psr&&m.psr<2?"#4ade80":"#94a3b8"} hint="株価売上高倍率"/>
                      <MetricBox label="EV/EBITDA" value={m.evEbitda?fmt(m.evEbitda)+"x":"—"} color={m.evEbitda&&m.evEbitda<10?"#4ade80":"#94a3b8"} hint="企業価値倍率"/>
                      <MetricBox label="ROE" value={f.roe?f.roe+"%":"—"} color={parseFloat(f.roe)>15?"#4ade80":"#94a3b8"} hint="自己資本利益率"/>
                      <MetricBox label="時価総額" value={m.marketCap?fmtM(m.marketCap):"—"} color="#e2e8f0"/>
                      <MetricBox label="EBITDA" value={f.ebitda?fmtM(+f.ebitda):"—"} color="#60a5fa" hint="償却前営業利益"/>
                      {selected.market==="JP" && <MetricBox label="信用倍率" value={f.shinyoBairitu||"—"} color="#a78bfa" hint="信用買÷信用売"/>}
                    </div>
                    <div style={{...S.card,fontSize:12,color:"#475569"}}>
                      <div style={{marginBottom:8,color:"#94a3b8",fontWeight:700}}>指標の目安</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                        <span><span style={{color:"#4ade80"}}>●</span> PER 15倍未満 = 割安目安</span>
                        <span><span style={{color:"#4ade80"}}>●</span> PBR 1.5倍未満 = 割安目安</span>
                        <span><span style={{color:"#4ade80"}}>●</span> ROE 15%超 = 高収益</span>
                        <span><span style={{color:"#4ade80"}}>●</span> EV/EBITDA 10倍未満 = 割安目安</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* INPUT */}
                {detailTab==="input" && (
                  <div>
                    <div style={{marginBottom:12,color:"#64748b",fontSize:13}}>数値を入力すると財務指標タブで自動計算されます。</div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:16}}>
                      <Input label="株価" value={f.price||""} onChange={v=>updateFinancials(selected.id,"price",v)} unit={selected.market==="JP"?"円":"$"}/>
                      <Input label="発行済株式数" value={f.shares||""} onChange={v=>updateFinancials(selected.id,"shares",v)} unit="百万株"/>
                      <Input label="EPS（1株利益）" value={f.eps||""} onChange={v=>updateFinancials(selected.id,"eps",v)} unit={selected.market==="JP"?"円":"$"}/>
                      <Input label="BPS（1株純資産）" value={f.bps||""} onChange={v=>updateFinancials(selected.id,"bps",v)} unit={selected.market==="JP"?"円":"$"}/>
                      <Input label="売上高" value={f.sales||""} onChange={v=>updateFinancials(selected.id,"sales",v)} unit={selected.market==="JP"?"億円":"億$"}/>
                      <Input label="EBITDA" value={f.ebitda||""} onChange={v=>updateFinancials(selected.id,"ebitda",v)} unit={selected.market==="JP"?"億円":"億$"}/>
                      <Input label="純資産" value={f.netAssets||""} onChange={v=>updateFinancials(selected.id,"netAssets",v)} unit={selected.market==="JP"?"億円":"億$"}/>
                      <Input label="純有利子負債" value={f.netDebt||""} onChange={v=>updateFinancials(selected.id,"netDebt",v)} unit={selected.market==="JP"?"億円":"億$"}/>
                      <Input label="ROE" value={f.roe||""} onChange={v=>updateFinancials(selected.id,"roe",v)} unit="%"/>
                      {selected.market==="JP" && <Input label="信用倍率" value={f.shinyoBairitu||""} onChange={v=>updateFinancials(selected.id,"shinyoBairitu",v)} unit="倍"/>}
                    </div>
                    <div style={{marginTop:20,padding:12,background:"#111827",borderRadius:8,fontSize:12,color:"#475569"}}>
                      <div style={{color:"#64748b",marginBottom:6}}>📌 入力データの参考先</div>
                      <div>日本株: <a href="https://finance.yahoo.co.jp" target="_blank" rel="noreferrer" style={{color:"#60a5fa"}}>Yahoo Finance Japan</a> / <a href="https://www.kabutan.jp" target="_blank" rel="noreferrer" style={{color:"#60a5fa"}}>株探</a></div>
                      <div>米国株: <a href="https://finance.yahoo.com" target="_blank" rel="noreferrer" style={{color:"#60a5fa"}}>Yahoo Finance</a> / <a href="https://www.macrotrends.net" target="_blank" rel="noreferrer" style={{color:"#60a5fa"}}>Macrotrends</a></div>
                    </div>
                  </div>
                )}

                {/* IR */}
                {detailTab==="ir" && (
                  <div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                      <span style={{color:"#64748b",fontSize:13}}>IRニュース・適時開示情報</span>
                      <button style={S.addBtn} onClick={()=>setShowIrForm(v=>!v)}>＋ 追加</button>
                    </div>
                    {showIrForm && (
                      <div style={{...S.addForm,flexDirection:"column",gap:12,marginBottom:16}}>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                          <Input label="日付" value={irForm.date} onChange={v=>setIrForm(f=>({...f,date:v}))} />
                          <div style={{display:"flex",flexDirection:"column",gap:3}}>
                            <label style={{color:"#64748b",fontSize:11}}>種別</label>
                            <select value={irForm.type} style={S.select} onChange={e=>setIrForm(f=>({...f,type:e.target.value}))}>
                              {["決算","配当","人事","その他"].map(t=><option key={t}>{t}</option>)}
                            </select>
                          </div>
                        </div>
                        <Input label="タイトル" value={irForm.title} onChange={v=>setIrForm(f=>({...f,title:v}))} />
                        <Input label="URL（任意）" value={irForm.url} onChange={v=>setIrForm(f=>({...f,url:v}))} />
                        <button style={S.addBtn} onClick={addIR}>保存</button>
                      </div>
                    )}
                    {(selected.irList||[]).length===0 && <div style={S.card}><span style={{color:"#64748b"}}>IRニュースがありません。「追加」から入力してください。</span></div>}
                    {(selected.irList||[]).map((item,i)=>(
                      <div key={i} style={{...S.card,marginBottom:12}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                          <div style={{display:"flex",gap:8,alignItems:"center"}}>
                            <Tag color={typeColor(item.type)}>{item.type}</Tag>
                            <span style={{color:"#475569",fontSize:12}}>{item.date}</span>
                          </div>
                          <button style={{...S.miniBtn,color:"#f87171",borderColor:"#f87171"}} onClick={()=>deleteIR(i)}>削除</button>
                        </div>
                        <div style={{fontWeight:700,color:"#f1f5f9",marginBottom:4,fontSize:14}}>
                          {item.url ? <a href={item.url} target="_blank" rel="noreferrer" style={{color:"#f1f5f9",textDecoration:"none"}}>{item.title} ↗</a> : item.title}
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
        {tab==="compare" && (
          <div>
            <h2 style={S.sectionTitle}>他社比較</h2>
            <div style={{marginBottom:12,color:"#64748b",fontSize:13}}>ポートフォリオ画面で「比較」ボタンを押して銘柄を選択してください（最大4社）。</div>
            <div style={S.stockSelector}>
              {portfolio.map(h=>(
                <button key={h.id} style={{...S.chipBtn,...(compareIds.includes(h.id)?S.chipActive:{})}} onClick={()=>toggleCompare(h.id)}>
                  {h.ticker}
                </button>
              ))}
            </div>
            {compareStocks.length<2 && <div style={S.card}><span style={{color:"#64748b"}}>2社以上選択してください。</span></div>}
            {compareStocks.length>=2 && (
              <>
                {/* Table */}
                <div style={{...S.card,overflowX:"auto",marginBottom:24}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                    <thead>
                      <tr style={{borderBottom:"1px solid #1e293b"}}>
                        <th style={{textAlign:"left",padding:"8px 12px",color:"#475569",fontSize:11}}>指標</th>
                        {compareStocks.map((h,i)=>(
                          <th key={h.id} style={{textAlign:"right",padding:"8px 12px",color:COLORS[i],fontSize:13}}>{h.ticker}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ["PER (x)", h=>calcMetrics(h.financials).per, v=>v?fmt(v)+"x":"—", v=>v&&v<15?"#4ade80":v&&v<30?"#fbbf24":"#f87171"],
                        ["PBR (x)", h=>calcMetrics(h.financials).pbr, v=>v?fmt(v)+"x":"—", v=>v&&v<1.5?"#4ade80":"#94a3b8"],
                        ["PSR (x)", h=>calcMetrics(h.financials).psr, v=>v?fmt(v)+"x":"—", ()=>"#94a3b8"],
                        ["EV/EBITDA (x)", h=>calcMetrics(h.financials).evEbitda, v=>v?fmt(v)+"x":"—", v=>v&&v<10?"#4ade80":"#94a3b8"],
                        ["ROE (%)", h=>h.financials.roe, v=>v?v+"%":"—", v=>parseFloat(v)>15?"#4ade80":"#94a3b8"],
                        ["時価総額", h=>calcMetrics(h.financials).marketCap, v=>v?fmtM(v):"—", ()=>"#e2e8f0"],
                        ["EBITDA", h=>h.financials.ebitda, v=>v?fmtM(+v):"—", ()=>"#60a5fa"],
                        ["信用倍率", h=>h.financials.shinyoBairitu, v=>v||"—", ()=>"#a78bfa"],
                      ].map(([label,getter,formatter,colorFn])=>(
                        <tr key={label} style={{borderBottom:"1px solid #1e293b"}}>
                          <td style={{padding:"10px 12px",color:"#64748b",fontSize:12}}>{label}</td>
                          {compareStocks.map(h=>{
                            const val=getter(h);
                            return <td key={h.id} style={{textAlign:"right",padding:"10px 12px",color:colorFn(val),fontWeight:700}}>{formatter(val)}</td>;
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Radar */}
                <div style={S.card}>
                  <div style={{color:"#94a3b8",fontSize:13,marginBottom:12}}>レーダーチャート比較（数値が小さいほど中心寄り）</div>
                  <ResponsiveContainer width="100%" height={300}>
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="#1e293b"/>
                      <PolarAngleAxis dataKey="metric" tick={{fill:"#64748b",fontSize:11}}/>
                      {compareStocks.map((h,i)=>(
                        <Radar key={h.id} name={h.ticker} dataKey={h.ticker} stroke={COLORS[i]} fill={COLORS[i]} fillOpacity={0.15}/>
                      ))}
                      <Legend wrapperStyle={{color:"#94a3b8",fontSize:12}}/>
                      <Tooltip contentStyle={S.tooltip}/>
                    </RadarChart>
                  </ResponsiveContainer>
                </div>

                {/* Bar compare */}
                <div style={S.card}>
                  <div style={{color:"#94a3b8",fontSize:13,marginBottom:12}}>PER比較</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={compareStocks.map(h=>({ name:h.ticker, PER: parseFloat(fmt(calcMetrics(h.financials).per))||0 }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
                      <XAxis dataKey="name" tick={{fill:"#94a3b8",fontSize:12}}/>
                      <YAxis tick={{fill:"#64748b",fontSize:11}} tickFormatter={v=>v+"x"}/>
                      <Tooltip formatter={v=>v+"倍"} contentStyle={S.tooltip}/>
                      <ReferenceLine y={15} stroke="#4ade80" strokeDasharray="4 4" label={{value:"割安目安",fill:"#4ade80",fontSize:10}}/>
                      <Bar dataKey="PER" fill="#818cf8" radius={[4,4,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── SIMULATION ── */}
        {tab==="simulation" && (
          <div>
            <h2 style={S.sectionTitle}>シミュレーション</h2>
            <div style={S.stockSelector}>
              {portfolio.map(h=>(
                <button key={h.id} style={{...S.chipBtn,...(selected?.id===h.id?S.chipActive:{})}} onClick={()=>handleSelectStock(h)}>
                  {h.ticker}
                </button>
              ))}
            </div>
            {selected && (
              <>
                <div style={{...S.card,marginBottom:20}}>
                  <div style={{color:"#94a3b8",fontWeight:700,marginBottom:12}}>シミュレーション設定 — {selected.name}</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:16}}>
                    <Input label="予測年数" value={simParams.years} onChange={v=>setSimParams(p=>({...p,years:v}))} unit="年"/>
                    <Input label="売上・利益成長率（年）" value={simParams.growthRate} onChange={v=>setSimParams(p=>({...p,growthRate:v}))} unit="%"/>
                    <Input label="目標PER" value={simParams.targetPer} onChange={v=>setSimParams(p=>({...p,targetPer:v}))} unit="倍"/>
                    <Input label="配当利回り" value={simParams.dividendRate} onChange={v=>setSimParams(p=>({...p,dividendRate:v}))} unit="%"/>
                    <div style={{display:"flex",flexDirection:"column",gap:3}}>
                      <label style={{color:"#64748b",fontSize:11}}>配当再投資</label>
                      <button style={{...S.miniBtn,color:simParams.reinvest?"#4ade80":"#64748b",borderColor:simParams.reinvest?"#4ade80":"#334155"}}
                        onClick={()=>setSimParams(p=>({...p,reinvest:!p.reinvest}))}>
                        {simParams.reinvest?"あり（複利）":"なし（単純）"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* 株価推定 */}
                <div style={S.card}>
                  <div style={{color:"#94a3b8",fontWeight:700,marginBottom:4}}>📈 株価推定（PERアプローチ）</div>
                  <div style={{color:"#475569",fontSize:12,marginBottom:12}}>EPSが年{simParams.growthRate}%成長し、PERが{simParams.targetPer}倍に収束した場合</div>
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={simResults()}>
                      <defs>
                        <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#4ade80" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#4ade80" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
                      <XAxis dataKey="year" tick={{fill:"#94a3b8",fontSize:12}}/>
                      <YAxis tick={{fill:"#64748b",fontSize:11}} tickFormatter={v=>v.toLocaleString()}/>
                      <Tooltip formatter={v=>v?.toLocaleString()+"円"} contentStyle={S.tooltip}/>
                      <ReferenceLine y={+f.price||selected.currentPrice} stroke="#f59e0b" strokeDasharray="4 4" label={{value:"現在株価",fill:"#f59e0b",fontSize:10}}/>
                      <Area type="monotone" dataKey="株価推定_PER" stroke="#4ade80" strokeWidth={2} fill="url(#sg)" dot={{fill:"#4ade80"}}/>
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* 配当累計 */}
                <div style={S.card}>
                  <div style={{color:"#94a3b8",fontWeight:700,marginBottom:4}}>💰 配当累計シミュレーション</div>
                  <div style={{color:"#475569",fontSize:12,marginBottom:12}}>配当利回り{simParams.dividendRate}%、{simParams.reinvest?"複利（再投資あり）":"単純（再投資なし）"}</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={simResults()}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
                      <XAxis dataKey="year" tick={{fill:"#94a3b8",fontSize:12}}/>
                      <YAxis tick={{fill:"#64748b",fontSize:11}} tickFormatter={v=>v.toLocaleString()}/>
                      <Tooltip formatter={v=>v?.toLocaleString()+"円"} contentStyle={S.tooltip}/>
                      <Bar dataKey="配当累計" fill="#fbbf24" radius={[4,4,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* 売上推移 */}
                <div style={S.card}>
                  <div style={{color:"#94a3b8",fontWeight:700,marginBottom:4}}>📊 売上推移予測</div>
                  <div style={{color:"#475569",fontSize:12,marginBottom:12}}>年{simParams.growthRate}%成長を仮定</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={simResults()}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
                      <XAxis dataKey="year" tick={{fill:"#94a3b8",fontSize:12}}/>
                      <YAxis tick={{fill:"#64748b",fontSize:11}} tickFormatter={v=>fmtM(v)}/>
                      <Tooltip formatter={v=>fmtM(v)} contentStyle={S.tooltip}/>
                      <Line type="monotone" dataKey="売上推移" stroke="#60a5fa" strokeWidth={2} dot={{fill:"#60a5fa"}}/>
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Summary table */}
                <div style={S.card}>
                  <div style={{color:"#94a3b8",fontWeight:700,marginBottom:12}}>📋 シミュレーション結果サマリー</div>
                  <div style={{overflowX:"auto"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                      <thead>
                        <tr style={{borderBottom:"1px solid #1e293b"}}>
                          {["年","推定株価(PER法)","配当累計","売上推移"].map(h=>(
                            <th key={h} style={{textAlign:"right",padding:"8px 12px",color:"#475569",fontSize:11,":first-child":{textAlign:"left"}}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {simResults().map((row,i)=>(
                          <tr key={i} style={{borderBottom:"1px solid #1e293b"}}>
                            <td style={{padding:"10px 12px",color:"#94a3b8"}}>{row.year}</td>
                            <td style={{textAlign:"right",padding:"10px 12px",color:"#4ade80",fontWeight:700}}>{row.株価推定_PER?.toLocaleString()??"—"}</td>
                            <td style={{textAlign:"right",padding:"10px 12px",color:"#fbbf24"}}>{row.配当累計?.toLocaleString()}</td>
                            <td style={{textAlign:"right",padding:"10px 12px",color:"#60a5fa"}}>{fmtM(row.売上推移)}</td>
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
  navBtn:{ background:"transparent", border:"1px solid #1e293b", color:"#64748b", padding:"6px 14px", borderRadius:6, cursor:"pointer", fontSize:13, fontFamily:"inherit" },
  navActive:{ background:"#0f2a1a", border:"1px solid #4ade80", color:"#4ade80" },
  summaryBar:{ display:"flex", background:"#0d1424", borderBottom:"1px solid #1e293b", flexWrap:"wrap" },
  summaryItem:{ flex:1, padding:"12px 20px", borderRight:"1px solid #1e293b", minWidth:120 },
  summaryLabel:{ display:"block", fontSize:11, color:"#475569", marginBottom:4, textTransform:"uppercase", letterSpacing:1 },
  summaryValue:{ fontSize:20, fontWeight:800 },
  main:{ padding:"24px", maxWidth:1200, margin:"0 auto" },
  sectionTitle:{ fontSize:18, fontWeight:800, color:"#f1f5f9", margin:"0 0 16px 0", letterSpacing:1 },
  card:{ background:"#0d1424", border:"1px solid #1e293b", borderRadius:10, padding:20, marginBottom:16 },
  table:{ background:"#0d1424", border:"1px solid #1e293b", borderRadius:10, overflow:"hidden", marginBottom:16 },
  tableHeader:{ display:"grid", gridTemplateColumns:"2fr 0.7fr 0.8fr 1fr 1fr 1fr 1.2fr 1fr 1fr", padding:"10px 16px", background:"#111827", gap:8 },
  th:{ fontSize:11, color:"#475569", textTransform:"uppercase", letterSpacing:1 },
  tableRow:{ display:"grid", gridTemplateColumns:"2fr 0.7fr 0.8fr 1fr 1fr 1fr 1.2fr 1fr 1fr", padding:"12px 16px", gap:8, borderTop:"1px solid #1e293b", alignItems:"center" },
  tableRowActive:{ background:"#0f2a1a" },
  stockSelector:{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:16 },
  chipBtn:{ background:"#111827", border:"1px solid #1e293b", color:"#94a3b8", padding:"6px 12px", borderRadius:20, cursor:"pointer", fontSize:12, fontFamily:"inherit" },
  chipActive:{ background:"#0f2a1a", border:"1px solid #4ade80", color:"#4ade80" },
  addBtn:{ background:"#0f2a1a", border:"1px solid #4ade80", color:"#4ade80", padding:"8px 16px", borderRadius:6, cursor:"pointer", fontSize:13, fontFamily:"inherit", fontWeight:700 },
  addForm:{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:16, padding:16, background:"#0d1424", border:"1px solid #1e293b", borderRadius:8 },
  input:{ background:"#111827", border:"1px solid #1e293b", color:"#e2e8f0", padding:"8px 12px", borderRadius:6, fontSize:13, fontFamily:"inherit", outline:"none", width:"100%" },
  select:{ background:"#111827", border:"1px solid #1e293b", color:"#e2e8f0", padding:"8px 12px", borderRadius:6, fontSize:13, fontFamily:"inherit", width:"100%" },
  miniBtn:{ background:"#111827", border:"1px solid #334155", color:"#64748b", padding:"4px 10px", borderRadius:4, cursor:"pointer", fontSize:11, fontFamily:"inherit" },
  tooltip:{ background:"#0d1424", border:"1px solid #1e293b", borderRadius:6, color:"#e2e8f0", fontSize:12 },
};
