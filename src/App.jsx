import { useState, useEffect, useCallback } from "react";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts";

// ─── Claude AI helper ────────────────────────────────────────────────────────
async function askClaude(prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  return data.content.map(b => b.text || "").filter(Boolean).join("\n");
}

// ─── Mock data generators ─────────────────────────────────────────────────────
function generatePriceHistory(base, days = 60) {
  const data = [];
  let price = base;
  for (let i = days; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    price *= 1 + (Math.random() - 0.48) * 0.03;
    data.push({
      date: `${d.getMonth()+1}/${d.getDate()}`,
      price: parseFloat(price.toFixed(2)),
      volume: Math.floor(Math.random() * 5000000 + 500000),
    });
  }
  return data;
}

const INITIAL_PORTFOLIO = [
  { id:1, ticker:"7203", name:"トヨタ自動車", market:"JP", qty:100, avgCost:2850, currentPrice:3124, sector:"自動車", per:10.2, pbr:1.1, roe:11.5 },
  { id:2, ticker:"6758", name:"ソニーグループ", market:"JP", qty:50, avgCost:12400, currentPrice:13250, sector:"電機", per:18.4, pbr:2.3, roe:14.2 },
  { id:3, ticker:"AAPL", name:"Apple Inc.", market:"US", qty:20, avgCost:168, currentPrice:189, sector:"Technology", per:29.1, pbr:47.2, roe:160.5 },
  { id:4, ticker:"NVDA", name:"NVIDIA Corp.", market:"US", qty:10, avgCost:450, currentPrice:875, sector:"Technology", per:65.3, pbr:38.1, roe:84.2 },
  { id:5, ticker:"9984", name:"ソフトバンクG", market:"JP", qty:200, avgCost:7200, currentPrice:6850, sector:"通信", per:null, pbr:1.8, roe:null },
];

// ─── Sub-components ───────────────────────────────────────────────────────────
const Tag = ({ children, color = "#4ade80" }) => (
  <span style={{ background: color + "22", color, border: `1px solid ${color}44`, borderRadius:4, padding:"2px 8px", fontSize:11, fontWeight:600, fontFamily:"monospace" }}>
    {children}
  </span>
);

const Δ = ({ val, fmt = v => v.toFixed(2) }) => (
  <span style={{ color: val >= 0 ? "#4ade80" : "#f87171", fontWeight:700 }}>
    {val >= 0 ? "▲" : "▼"} {fmt(Math.abs(val))}
  </span>
);

function MiniChart({ data, color }) {
  return (
    <ResponsiveContainer width="100%" height={50}>
      <AreaChart data={data} margin={{top:2,right:0,bottom:0,left:0}}>
        <defs>
          <linearGradient id={`g-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
            <stop offset="95%" stopColor={color} stopOpacity={0}/>
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="price" stroke={color} strokeWidth={1.5}
          fill={`url(#g-${color.replace("#","")})`} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("portfolio");
  const [portfolio, setPortfolio] = useState(INITIAL_PORTFOLIO);
  const [selected, setSelected] = useState(INITIAL_PORTFOLIO[0]);
  const [chartData] = useState(() => generatePriceHistory(selected?.currentPrice ?? 3000));
  const [selectedChart, setSelectedChart] = useState(() => generatePriceHistory(INITIAL_PORTFOLIO[0].currentPrice));
  const [aiQuery, setAiQuery] = useState("");
  const [aiResult, setAiResult] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [addForm, setAddForm] = useState({ ticker:"", name:"", market:"JP", qty:"", avgCost:"", currentPrice:"" });
  const [showAdd, setShowAdd] = useState(false);
  const [newsStock, setNewsStock] = useState(null);
  const [newsResult, setNewsResult] = useState("");
  const [newsLoading, setNewsLoading] = useState(false);

  const totalCost = portfolio.reduce((s,h) => s + h.qty * h.avgCost, 0);
  const totalValue = portfolio.reduce((s,h) => s + h.qty * h.currentPrice, 0);
  const totalPnL = totalValue - totalCost;
  const totalPnLPct = (totalPnL / totalCost) * 100;

  const handleSelectStock = (h) => {
    setSelected(h);
    setSelectedChart(generatePriceHistory(h.currentPrice));
  };

  const handleAI = useCallback(async () => {
    if (!aiQuery.trim()) return;
    setAiLoading(true); setAiResult("");
    try {
      const text = await askClaude(
        `株式投資の質問です。簡潔に日本語で答えてください（300字以内）。\n質問: ${aiQuery}`
      );
      setAiResult(text);
    } catch { setAiResult("エラーが発生しました。"); }
    setAiLoading(false);
  }, [aiQuery]);

  const handleNews = useCallback(async (h) => {
    setNewsStock(h);
    setNewsLoading(true); setNewsResult("");
    try {
      const text = await askClaude(
        `${h.name}（${h.ticker}）の最新ニュースや株価に影響しそうな情報を日本語で簡潔にまとめてください（300字以内）。`
      );
      setNewsResult(text);
    } catch { setNewsResult("情報を取得できませんでした。"); }
    setNewsLoading(false);
  }, []);

  const handleAddStock = () => {
    const { ticker, name, market, qty, avgCost, currentPrice } = addForm;
    if (!ticker || !name || !qty || !avgCost || !currentPrice) return;
    setPortfolio(p => [...p, {
      id: Date.now(), ticker, name, market,
      qty: +qty, avgCost: +avgCost, currentPrice: +currentPrice,
      sector: "—", per: null, pbr: null, roe: null
    }]);
    setAddForm({ ticker:"", name:"", market:"JP", qty:"", avgCost:"", currentPrice:"" });
    setShowAdd(false);
  };

  const sectorData = Object.entries(
    portfolio.reduce((acc, h) => {
      acc[h.sector] = (acc[h.sector] || 0) + h.qty * h.currentPrice;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value: Math.round(value) }));

  const S = styles;

  return (
    <div style={S.root}>
      {/* Header */}
      <header style={S.header}>
        <div style={S.logo}>
          <span style={S.logoIcon}>📈</span>
          <span style={S.logoText}>KABU<span style={{color:"#4ade80"}}>LENS</span></span>
        </div>
        <nav style={S.nav}>
          {["portfolio","chart","analysis","news","ai"].map(t => (
            <button key={t} style={{...S.navBtn, ...(tab===t?S.navActive:{})}} onClick={() => setTab(t)}>
              {{"portfolio":"ポートフォリオ","chart":"チャート","analysis":"財務分析","news":"ニュース","ai":"AI相談"}[t]}
            </button>
          ))}
        </nav>
      </header>

      {/* Summary bar */}
      <div style={S.summaryBar}>
        <div style={S.summaryItem}>
          <span style={S.summaryLabel}>評価額合計</span>
          <span style={S.summaryValue}>¥{Math.round(totalValue).toLocaleString()}</span>
        </div>
        <div style={S.summaryItem}>
          <span style={S.summaryLabel}>損益</span>
          <span style={S.summaryValue}><Δ val={totalPnL} fmt={v=>"¥"+Math.round(v).toLocaleString()} /></span>
        </div>
        <div style={S.summaryItem}>
          <span style={S.summaryLabel}>損益率</span>
          <span style={S.summaryValue}><Δ val={totalPnLPct} fmt={v=>v.toFixed(2)+"%"} /></span>
        </div>
        <div style={S.summaryItem}>
          <span style={S.summaryLabel}>保有銘柄数</span>
          <span style={S.summaryValue}>{portfolio.length}</span>
        </div>
      </div>

      <main style={S.main}>
        {/* ── PORTFOLIO TAB ── */}
        {tab === "portfolio" && (
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h2 style={S.sectionTitle}>保有銘柄一覧</h2>
              <button style={S.addBtn} onClick={() => setShowAdd(v=>!v)}>＋ 銘柄追加</button>
            </div>

            {showAdd && (
              <div style={S.addForm}>
                {[["ticker","ティッカー/コード"],["name","銘柄名"],["qty","保有数量"],["avgCost","平均取得単価"],["currentPrice","現在値"]].map(([k,label]) => (
                  <input key={k} placeholder={label} value={addForm[k]} style={S.input}
                    onChange={e => setAddForm(f => ({...f,[k]:e.target.value}))} />
                ))}
                <select value={addForm.market} style={S.select} onChange={e => setAddForm(f=>({...f,market:e.target.value}))}>
                  <option value="JP">日本株</option>
                  <option value="US">米国株</option>
                </select>
                <button style={S.addBtn} onClick={handleAddStock}>追加</button>
              </div>
            )}

            <div style={S.table}>
              <div style={S.tableHeader}>
                {["銘柄","市場","保有数","取得単価","現在値","評価額","損益","損益率",""].map(h => (
                  <span key={h} style={S.th}>{h}</span>
                ))}
              </div>
              {portfolio.map(h => {
                const pnl = (h.currentPrice - h.avgCost) * h.qty;
                const pnlPct = ((h.currentPrice - h.avgCost) / h.avgCost) * 100;
                return (
                  <div key={h.id} style={{...S.tableRow, ...(selected?.id===h.id?S.tableRowActive:{})}}
                    onClick={() => handleSelectStock(h)}>
                    <span style={{fontWeight:700,color:"#e2e8f0"}}>
                      {h.name}<br/><Tag color={h.market==="JP"?"#60a5fa":"#f59e0b"}>{h.ticker}</Tag>
                    </span>
                    <span><Tag color={h.market==="JP"?"#60a5fa":"#f59e0b"}>{h.market}</Tag></span>
                    <span style={{color:"#94a3b8"}}>{h.qty.toLocaleString()}</span>
                    <span style={{color:"#94a3b8"}}>{h.avgCost.toLocaleString()}</span>
                    <span style={{fontWeight:700,color:"#e2e8f0"}}>{h.currentPrice.toLocaleString()}</span>
                    <span style={{color:"#e2e8f0"}}>{(h.qty*h.currentPrice).toLocaleString()}</span>
                    <span><Δ val={pnl} fmt={v=>Math.round(v).toLocaleString()} /></span>
                    <span><Δ val={pnlPct} fmt={v=>v.toFixed(2)+"%"} /></span>
                    <span>
                      <button style={S.miniBtn} onClick={e=>{e.stopPropagation();setTab("chart");handleSelectStock(h);}}>
                        チャート
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Sector breakdown */}
            <div style={{marginTop:32}}>
              <h3 style={S.sectionTitle}>セクター別配分</h3>
              <div style={{height:220}}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sectorData} layout="vertical" margin={{left:20,right:40}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis type="number" tick={{fill:"#64748b",fontSize:11}} tickFormatter={v=>(v/10000).toFixed(0)+"万"} />
                    <YAxis dataKey="name" type="category" tick={{fill:"#94a3b8",fontSize:12}} width={90} />
                    <Tooltip formatter={v=>"¥"+v.toLocaleString()} contentStyle={S.tooltip} />
                    <Bar dataKey="value" fill="#4ade80" radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* ── CHART TAB ── */}
        {tab === "chart" && (
          <div>
            <h2 style={S.sectionTitle}>価格チャート</h2>
            <div style={S.stockSelector}>
              {portfolio.map(h => (
                <button key={h.id} style={{...S.chipBtn,...(selected?.id===h.id?S.chipActive:{})}}
                  onClick={() => handleSelectStock(h)}>
                  {h.ticker}
                </button>
              ))}
            </div>
            {selected && (
              <div style={S.card}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
                  <div>
                    <div style={{fontSize:20,fontWeight:800,color:"#f1f5f9"}}>{selected.name}</div>
                    <Tag color={selected.market==="JP"?"#60a5fa":"#f59e0b"}>{selected.market} : {selected.ticker}</Tag>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:32,fontWeight:900,color:"#f1f5f9"}}>{selected.currentPrice.toLocaleString()}</div>
                    <Δ val={selected.currentPrice - selected.avgCost}
                      fmt={v=>v.toLocaleString()+" ("+((v/selected.avgCost)*100).toFixed(2)+"%)"} />
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={selectedChart}>
                    <defs>
                      <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4ade80" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#4ade80" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="date" tick={{fill:"#64748b",fontSize:11}} interval={9} />
                    <YAxis domain={["auto","auto"]} tick={{fill:"#64748b",fontSize:11}} width={60}
                      tickFormatter={v=>v.toLocaleString()} />
                    <Tooltip formatter={v=>v.toLocaleString()} contentStyle={S.tooltip} />
                    <ReferenceLine y={selected.avgCost} stroke="#f59e0b" strokeDasharray="4 4"
                      label={{value:"取得単価",fill:"#f59e0b",fontSize:11}} />
                    <Area type="monotone" dataKey="price" stroke="#4ade80" strokeWidth={2}
                      fill="url(#cg)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
                <div style={{marginTop:16, height:80}}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={selectedChart}>
                      <XAxis dataKey="date" hide />
                      <YAxis hide />
                      <Tooltip formatter={v=>v.toLocaleString()+"株"} contentStyle={S.tooltip} />
                      <Bar dataKey="volume" fill="#334155" radius={[2,2,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div style={{textAlign:"center",color:"#475569",fontSize:11,marginTop:4}}>出来高</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── ANALYSIS TAB ── */}
        {tab === "analysis" && (
          <div>
            <h2 style={S.sectionTitle}>財務指標分析</h2>
            <div style={S.grid2}>
              {portfolio.map(h => {
                const pnlPct = ((h.currentPrice - h.avgCost) / h.avgCost) * 100;
                return (
                  <div key={h.id} style={S.card}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}>
                      <div>
                        <div style={{fontWeight:800,color:"#f1f5f9",fontSize:15}}>{h.name}</div>
                        <Tag color={h.market==="JP"?"#60a5fa":"#f59e0b"}>{h.ticker}</Tag>
                      </div>
                      <Δ val={pnlPct} fmt={v=>v.toFixed(1)+"%"} />
                    </div>
                    <div style={S.metricsGrid}>
                      {[
                        ["PER", h.per ? h.per+"x" : "—", h.per && h.per < 15 ? "#4ade80" : h.per && h.per < 30 ? "#fbbf24" : "#f87171"],
                        ["PBR", h.pbr ? h.pbr+"x" : "—", h.pbr && h.pbr < 1.5 ? "#4ade80" : "#94a3b8"],
                        ["ROE", h.roe ? h.roe+"%" : "—", h.roe && h.roe > 15 ? "#4ade80" : "#94a3b8"],
                        ["セクター", h.sector, "#a78bfa"],
                      ].map(([k,v,c]) => (
                        <div key={k} style={S.metric}>
                          <div style={{color:"#64748b",fontSize:11}}>{k}</div>
                          <div style={{color:c,fontWeight:700,fontSize:15}}>{v}</div>
                        </div>
                      ))}
                    </div>
                    <MiniChart data={generatePriceHistory(h.currentPrice, 30)}
                      color={pnlPct >= 0 ? "#4ade80" : "#f87171"} />
                  </div>
                );
              })}
            </div>
            {/* PER scatter */}
            <div style={{...S.card, marginTop:24}}>
              <h3 style={{...S.sectionTitle,marginBottom:16}}>PER比較（横棒）</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={portfolio.filter(h=>h.per)} layout="vertical" margin={{left:10,right:40}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
                  <XAxis type="number" tick={{fill:"#64748b",fontSize:11}} domain={[0,80]} tickFormatter={v=>v+"x"}/>
                  <YAxis dataKey="ticker" type="category" tick={{fill:"#94a3b8",fontSize:12}} width={50}/>
                  <Tooltip formatter={v=>v+"倍"} contentStyle={S.tooltip}/>
                  <ReferenceLine x={15} stroke="#4ade80" strokeDasharray="4 4" label={{value:"割安目安15x",fill:"#4ade80",fontSize:10}}/>
                  <Bar dataKey="per" fill="#818cf8" radius={[0,4,4,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── NEWS TAB ── */}
        {tab === "news" && (
          <div>
            <h2 style={S.sectionTitle}>ニュース・情報収集</h2>
            <p style={{color:"#64748b",marginBottom:16,fontSize:13}}>銘柄を選ぶと、AIがウェブ検索して最新情報を収集します。</p>
            <div style={S.stockSelector}>
              {portfolio.map(h => (
                <button key={h.id} style={{...S.chipBtn,...(newsStock?.id===h.id?S.chipActive:{})}}
                  onClick={() => handleNews(h)}>
                  {h.ticker} {h.name}
                </button>
              ))}
            </div>
            {newsStock && (
              <div style={{...S.card, marginTop:16}}>
                <div style={{fontWeight:700,color:"#f1f5f9",marginBottom:8}}>
                  {newsStock.name} の最新情報
                </div>
                {newsLoading ? (
                  <div style={S.loading}>🔍 ウェブ検索中...</div>
                ) : (
                  <p style={{color:"#cbd5e1",lineHeight:1.8,whiteSpace:"pre-wrap",fontSize:14}}>{newsResult}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── AI TAB ── */}
        {tab === "ai" && (
          <div>
            <h2 style={S.sectionTitle}>AI 投資相談</h2>
            <p style={{color:"#64748b",marginBottom:16,fontSize:13}}>株式投資に関する疑問を何でも聞いてみてください。</p>
            <div style={{display:"flex",gap:8,marginBottom:16}}>
              <input value={aiQuery} style={{...S.input,flex:1}}
                placeholder="例: PERが低い株は割安ですか？"
                onChange={e => setAiQuery(e.target.value)}
                onKeyDown={e => e.key==="Enter" && handleAI()} />
              <button style={{...S.addBtn,whiteSpace:"nowrap"}} onClick={handleAI} disabled={aiLoading}>
                {aiLoading ? "考え中…" : "質問する"}
              </button>
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}>
              {["PERとPBRの違いは？","分散投資の基本を教えて","日米株の税制の違い","損切りのタイミングは？"].map(q => (
                <button key={q} style={S.chipBtn} onClick={() => { setAiQuery(q); }}>{q}</button>
              ))}
            </div>
            {(aiLoading || aiResult) && (
              <div style={S.card}>
                {aiLoading ? (
                  <div style={S.loading}>💭 回答を生成中...</div>
                ) : (
                  <p style={{color:"#cbd5e1",lineHeight:1.9,whiteSpace:"pre-wrap",fontSize:14}}>{aiResult}</p>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  root: { minHeight:"100vh", background:"#0a0f1a", fontFamily:"'DM Mono', 'Courier New', monospace", color:"#e2e8f0" },
  header: { display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 24px", background:"#0d1424", borderBottom:"1px solid #1e293b" },
  logo: { display:"flex", alignItems:"center", gap:8 },
  logoIcon: { fontSize:22 },
  logoText: { fontSize:22, fontWeight:900, color:"#f1f5f9", letterSpacing:2 },
  nav: { display:"flex", gap:4, flexWrap:"wrap" },
  navBtn: { background:"transparent", border:"1px solid #1e293b", color:"#64748b", padding:"6px 14px", borderRadius:6, cursor:"pointer", fontSize:13, fontFamily:"inherit", transition:"all .15s" },
  navActive: { background:"#0f2a1a", border:"1px solid #4ade80", color:"#4ade80" },
  summaryBar: { display:"flex", gap:0, background:"#0d1424", borderBottom:"1px solid #1e293b" },
  summaryItem: { flex:1, padding:"12px 20px", borderRight:"1px solid #1e293b" },
  summaryLabel: { display:"block", fontSize:11, color:"#475569", marginBottom:4, textTransform:"uppercase", letterSpacing:1 },
  summaryValue: { fontSize:20, fontWeight:800 },
  main: { padding:"24px", maxWidth:1200, margin:"0 auto" },
  sectionTitle: { fontSize:18, fontWeight:800, color:"#f1f5f9", margin:"0 0 16px 0", letterSpacing:1 },
  card: { background:"#0d1424", border:"1px solid #1e293b", borderRadius:10, padding:20, marginBottom:16 },
  table: { background:"#0d1424", border:"1px solid #1e293b", borderRadius:10, overflow:"hidden" },
  tableHeader: { display:"grid", gridTemplateColumns:"2fr 0.7fr 0.8fr 1fr 1fr 1fr 1.2fr 1fr 0.8fr", padding:"10px 16px", background:"#111827", gap:8 },
  th: { fontSize:11, color:"#475569", textTransform:"uppercase", letterSpacing:1 },
  tableRow: { display:"grid", gridTemplateColumns:"2fr 0.7fr 0.8fr 1fr 1fr 1fr 1.2fr 1fr 0.8fr", padding:"12px 16px", gap:8, borderTop:"1px solid #1e293b", cursor:"pointer", alignItems:"center", transition:"background .1s" },
  tableRowActive: { background:"#0f2a1a" },
  grid2: { display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(280px,1fr))", gap:16 },
  metricsGrid: { display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:8, marginBottom:12 },
  metric: { background:"#111827", borderRadius:6, padding:"8px 10px" },
  stockSelector: { display:"flex", flexWrap:"wrap", gap:8, marginBottom:16 },
  chipBtn: { background:"#111827", border:"1px solid #1e293b", color:"#94a3b8", padding:"6px 12px", borderRadius:20, cursor:"pointer", fontSize:12, fontFamily:"inherit" },
  chipActive: { background:"#0f2a1a", border:"1px solid #4ade80", color:"#4ade80" },
  addBtn: { background:"#0f2a1a", border:"1px solid #4ade80", color:"#4ade80", padding:"8px 16px", borderRadius:6, cursor:"pointer", fontSize:13, fontFamily:"inherit", fontWeight:700 },
  addForm: { display:"flex", flexWrap:"wrap", gap:8, marginBottom:16, padding:16, background:"#0d1424", border:"1px solid #1e293b", borderRadius:8 },
  input: { background:"#111827", border:"1px solid #1e293b", color:"#e2e8f0", padding:"8px 12px", borderRadius:6, fontSize:13, fontFamily:"inherit", outline:"none" },
  select: { background:"#111827", border:"1px solid #1e293b", color:"#e2e8f0", padding:"8px 12px", borderRadius:6, fontSize:13, fontFamily:"inherit" },
  miniBtn: { background:"#111827", border:"1px solid #334155", color:"#64748b", padding:"4px 10px", borderRadius:4, cursor:"pointer", fontSize:11, fontFamily:"inherit" },
  loading: { color:"#64748b", fontStyle:"italic", fontSize:14 },
  tooltip: { background:"#0d1424", border:"1px solid #1e293b", borderRadius:6, color:"#e2e8f0", fontSize:12 },
};
