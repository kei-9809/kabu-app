import { useState, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts";

async function askClaude(prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  return data.content.map(b => b.text || "").filter(Boolean).join("\n");
}

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
  { id:1, ticker:"7203", name:"トヨタ自動車", market:"JP", qty:100, avgCost:2850, currentPrice:3124, sector:"自動車" },
  { id:2, ticker:"6758", name:"ソニーグループ", market:"JP", qty:50, avgCost:12400, currentPrice:13250, sector:"電機" },
  { id:3, ticker:"AAPL", name:"Apple Inc.", market:"US", qty:20, avgCost:168, currentPrice:189, sector:"Technology" },
  { id:4, ticker:"NVDA", name:"NVIDIA Corp.", market:"US", qty:10, avgCost:450, currentPrice:875, sector:"Technology" },
  { id:5, ticker:"9984", name:"ソフトバンクG", market:"JP", qty:200, avgCost:7200, currentPrice:6850, sector:"通信" },
];

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

const MetricCard = ({ label, value, color = "#94a3b8", hint = "" }) => (
  <div style={{ background:"#111827", borderRadius:8, padding:"12px 14px", minWidth:100 }}>
    <div style={{ color:"#475569", fontSize:11, marginBottom:4 }}>{label}</div>
    <div style={{ color, fontWeight:700, fontSize:16 }}>{value ?? "—"}</div>
    {hint && <div style={{ color:"#334155", fontSize:10, marginTop:2 }}>{hint}</div>}
  </div>
);

function LoadingDots({ text }) {
  return <span style={{ color:"#64748b", fontStyle:"italic", fontSize:13 }}>{text}...</span>;
}

export default function App() {
  const [tab, setTab] = useState("portfolio");
  const [portfolio, setPortfolio] = useState(INITIAL_PORTFOLIO);
  const [selected, setSelected] = useState(INITIAL_PORTFOLIO[0]);
  const [selectedChart, setSelectedChart] = useState(() => generatePriceHistory(INITIAL_PORTFOLIO[0].currentPrice));

  // detail tab inside stock view
  const [detailTab, setDetailTab] = useState("metrics");

  // AI states
  const [metricsData, setMetricsData] = useState({});
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [irNews, setIrNews] = useState({});
  const [irLoading, setIrLoading] = useState(false);

  // portfolio add form
  const [addForm, setAddForm] = useState({ ticker:"", name:"", market:"JP", qty:"", avgCost:"", currentPrice:"" });
  const [showAdd, setShowAdd] = useState(false);

  // AI chat
  const [aiQuery, setAiQuery] = useState("");
  const [aiResult, setAiResult] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const totalCost = portfolio.reduce((s,h) => s + h.qty * h.avgCost, 0);
  const totalValue = portfolio.reduce((s,h) => s + h.qty * h.currentPrice, 0);
  const totalPnL = totalValue - totalCost;
  const totalPnLPct = (totalPnL / totalCost) * 100;

  const handleSelectStock = (h) => {
    setSelected(h);
    setSelectedChart(generatePriceHistory(h.currentPrice));
    setDetailTab("metrics");
  };

  const fetchMetrics = useCallback(async (h) => {
    if (metricsData[h.ticker]) return;
    setMetricsLoading(true);
    try {
      const text = await askClaude(
        `${h.name}（ティッカー: ${h.ticker}、市場: ${h.market === "JP" ? "東京証券取引所" : "米国株"}）の最新の財務指標を調べてください。
以下の項目をJSON形式のみで返してください（余分な説明不要）:
{
  "per": "PER（倍）",
  "pbr": "PBR（倍）",
  "psr": "PSR（倍）",
  "shinyo_bairitu": "信用倍率（日本株のみ、米国株はnull）",
  "roe": "ROE（%）",
  "ebitda": "EBITDA（億円 or 億ドル）",
  "ev_ebitda": "EV/EBITDA（倍）",
  "market_cap": "時価総額",
  "dividend_yield": "配当利回り（%）"
}
数値は文字列で入れてください。不明な場合は"—"としてください。JSONのみ返してください。`
      );
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setMetricsData(prev => ({ ...prev, [h.ticker]: parsed }));
    } catch {
      setMetricsData(prev => ({ ...prev, [h.ticker]: { error: true } }));
    }
    setMetricsLoading(false);
  }, [metricsData]);

  const fetchIR = useCallback(async (h) => {
    if (irNews[h.ticker]) return;
    setIrLoading(true);
    try {
      const text = await askClaude(
        `${h.name}（${h.ticker}）の最新IRニュース・適時開示情報を調べてください。直近5件程度を以下のJSON形式のみで返してください:
[
  { "date": "日付", "title": "タイトル", "summary": "1〜2文の要約", "type": "種別（決算/配当/人事/その他）" }
]
JSONのみ返してください。`
      );
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setIrNews(prev => ({ ...prev, [h.ticker]: parsed }));
    } catch {
      setIrNews(prev => ({ ...prev, [h.ticker]: [] }));
    }
    setIrLoading(false);
  }, [irNews]);

  const handleDetailTab = (tab, stock) => {
    setDetailTab(tab);
    if (tab === "metrics") fetchMetrics(stock);
    if (tab === "ir") fetchIR(stock);
  };

  const handleAddStock = () => {
    const { ticker, name, market, qty, avgCost, currentPrice } = addForm;
    if (!ticker || !name || !qty || !avgCost || !currentPrice) return;
    setPortfolio(p => [...p, {
      id: Date.now(), ticker, name, market,
      qty: +qty, avgCost: +avgCost, currentPrice: +currentPrice,
      sector: "—"
    }]);
    setAddForm({ ticker:"", name:"", market:"JP", qty:"", avgCost:"", currentPrice:"" });
    setShowAdd(false);
  };

  const handleAI = useCallback(async () => {
    if (!aiQuery.trim()) return;
    setAiLoading(true); setAiResult("");
    try {
      const text = await askClaude(`株式投資の質問です。簡潔に日本語で答えてください（300字以内）。\n質問: ${aiQuery}`);
      setAiResult(text);
    } catch { setAiResult("エラーが発生しました。"); }
    setAiLoading(false);
  }, [aiQuery]);

  const sectorData = Object.entries(
    portfolio.reduce((acc, h) => {
      acc[h.sector] = (acc[h.sector] || 0) + h.qty * h.currentPrice;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value: Math.round(value) }));

  const m = selected ? metricsData[selected.ticker] : null;

  const typeColor = (type) => {
    if (type === "決算") return "#4ade80";
    if (type === "配当") return "#fbbf24";
    if (type === "人事") return "#a78bfa";
    return "#64748b";
  };

  const S = styles;

  return (
    <div style={S.root}>
      <header style={S.header}>
        <div style={S.logo}>
          <span style={S.logoIcon}>📈</span>
          <span style={S.logoText}>KABU<span style={{color:"#4ade80"}}>LENS</span></span>
        </div>
        <nav style={S.nav}>
          {["portfolio","chart","detail","ai"].map(t => (
            <button key={t} style={{...S.navBtn, ...(tab===t?S.navActive:{})}} onClick={() => setTab(t)}>
              {{"portfolio":"ポートフォリオ","chart":"チャート","detail":"銘柄詳細","ai":"AI相談"}[t]}
            </button>
          ))}
        </nav>
      </header>

      <div style={S.summaryBar}>
        <div style={S.summaryItem}><span style={S.summaryLabel}>評価額合計</span><span style={S.summaryValue}>¥{Math.round(totalValue).toLocaleString()}</span></div>
        <div style={S.summaryItem}><span style={S.summaryLabel}>損益</span><span style={S.summaryValue}><Δ val={totalPnL} fmt={v=>"¥"+Math.round(v).toLocaleString()} /></span></div>
        <div style={S.summaryItem}><span style={S.summaryLabel}>損益率</span><span style={S.summaryValue}><Δ val={totalPnLPct} fmt={v=>v.toFixed(2)+"%"} /></span></div>
        <div style={S.summaryItem}><span style={S.summaryLabel}>保有銘柄数</span><span style={S.summaryValue}>{portfolio.length}</span></div>
      </div>

      <main style={S.main}>

        {/* ── PORTFOLIO ── */}
        {tab === "portfolio" && (
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h2 style={S.sectionTitle}>保有銘柄一覧</h2>
              <button style={S.addBtn} onClick={() => setShowAdd(v=>!v)}>＋ 銘柄追加</button>
            </div>
            {showAdd && (
              <div style={S.addForm}>
                {[["ticker","ティッカー"],["name","銘柄名"],["qty","数量"],["avgCost","取得単価"],["currentPrice","現在値"]].map(([k,label]) => (
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
                  <div key={h.id} style={{...S.tableRow,...(selected?.id===h.id?S.tableRowActive:{})}} onClick={() => handleSelectStock(h)}>
                    <span style={{fontWeight:700,color:"#e2e8f0"}}>{h.name}<br/><Tag color={h.market==="JP"?"#60a5fa":"#f59e0b"}>{h.ticker}</Tag></span>
                    <span><Tag color={h.market==="JP"?"#60a5fa":"#f59e0b"}>{h.market}</Tag></span>
                    <span style={{color:"#94a3b8"}}>{h.qty.toLocaleString()}</span>
                    <span style={{color:"#94a3b8"}}>{h.avgCost.toLocaleString()}</span>
                    <span style={{fontWeight:700,color:"#e2e8f0"}}>{h.currentPrice.toLocaleString()}</span>
                    <span style={{color:"#e2e8f0"}}>{(h.qty*h.currentPrice).toLocaleString()}</span>
                    <span><Δ val={pnl} fmt={v=>Math.round(v).toLocaleString()} /></span>
                    <span><Δ val={pnlPct} fmt={v=>v.toFixed(2)+"%"} /></span>
                    <span>
                      <button style={S.miniBtn} onClick={e=>{e.stopPropagation();setTab("detail");handleSelectStock(h);handleDetailTab("metrics",h);}}>詳細</button>
                    </span>
                  </div>
                );
              })}
            </div>
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

        {/* ── CHART ── */}
        {tab === "chart" && (
          <div>
            <h2 style={S.sectionTitle}>価格チャート</h2>
            <div style={S.stockSelector}>
              {portfolio.map(h => (
                <button key={h.id} style={{...S.chipBtn,...(selected?.id===h.id?S.chipActive:{})}} onClick={() => handleSelectStock(h)}>
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
                    <Δ val={selected.currentPrice - selected.avgCost} fmt={v=>v.toLocaleString()+" ("+((v/selected.avgCost)*100).toFixed(2)+"%)"}/>
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
                    <YAxis domain={["auto","auto"]} tick={{fill:"#64748b",fontSize:11}} width={60} tickFormatter={v=>v.toLocaleString()} />
                    <Tooltip formatter={v=>v.toLocaleString()} contentStyle={S.tooltip} />
                    <ReferenceLine y={selected.avgCost} stroke="#f59e0b" strokeDasharray="4 4" label={{value:"取得単価",fill:"#f59e0b",fontSize:11}} />
                    <Area type="monotone" dataKey="price" stroke="#4ade80" strokeWidth={2} fill="url(#cg)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
                <div style={{marginTop:16,height:80}}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={selectedChart}>
                      <XAxis dataKey="date" hide /><YAxis hide />
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

        {/* ── DETAIL ── */}
        {tab === "detail" && (
          <div>
            <h2 style={S.sectionTitle}>銘柄詳細</h2>
            <div style={S.stockSelector}>
              {portfolio.map(h => (
                <button key={h.id} style={{...S.chipBtn,...(selected?.id===h.id?S.chipActive:{})}}
                  onClick={() => { handleSelectStock(h); handleDetailTab(detailTab, h); }}>
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
                  <div style={{fontSize:24,fontWeight:900,color:"#f1f5f9"}}>
                    {selected.currentPrice.toLocaleString()}
                    <span style={{fontSize:14,marginLeft:8}}><Δ val={((selected.currentPrice-selected.avgCost)/selected.avgCost)*100} fmt={v=>v.toFixed(2)+"%"}/></span>
                  </div>
                </div>

                {/* Sub tabs */}
                <div style={{display:"flex",gap:4,marginBottom:20,borderBottom:"1px solid #1e293b",paddingBottom:8}}>
                  {["metrics","ir"].map(t => (
                    <button key={t} style={{...S.navBtn,...(detailTab===t?S.navActive:{})}}
                      onClick={() => handleDetailTab(t, selected)}>
                      {{"metrics":"財務指標","ir":"IRニュース"}[t]}
                    </button>
                  ))}
                </div>

                {/* METRICS */}
                {detailTab === "metrics" && (
                  <div>
                    {metricsLoading && !m && (
                      <div style={S.card}><LoadingDots text="AIが最新財務データを取得中" /></div>
                    )}
                    {m && !m.error && (
                      <>
                        <div style={{marginBottom:8,color:"#475569",fontSize:12}}>※ AIがウェブ検索で取得したデータです。最新情報と差異がある場合があります。</div>
                        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:12,marginBottom:24}}>
                          <MetricCard label="PER" value={m.per} color={parseFloat(m.per)<15?"#4ade80":parseFloat(m.per)<30?"#fbbf24":"#f87171"} hint="株価収益率" />
                          <MetricCard label="PBR" value={m.pbr} color={parseFloat(m.pbr)<1.5?"#4ade80":"#94a3b8"} hint="株価純資産倍率" />
                          <MetricCard label="PSR" value={m.psr} color={parseFloat(m.psr)<2?"#4ade80":"#94a3b8"} hint="株価売上高倍率" />
                          {selected.market === "JP" && (
                            <MetricCard label="信用倍率" value={m.shinyo_bairitu} color="#a78bfa" hint="信用買÷信用売" />
                          )}
                          <MetricCard label="ROE" value={m.roe} color={parseFloat(m.roe)>15?"#4ade80":"#94a3b8"} hint="自己資本利益率" />
                          <MetricCard label="EBITDA" value={m.ebitda} color="#60a5fa" hint="償却前営業利益" />
                          <MetricCard label="EV/EBITDA" value={m.ev_ebitda} color={parseFloat(m.ev_ebitda)<10?"#4ade80":"#94a3b8"} hint="企業価値倍率" />
                          <MetricCard label="時価総額" value={m.market_cap} color="#e2e8f0" hint="" />
                          <MetricCard label="配当利回り" value={m.dividend_yield} color={parseFloat(m.dividend_yield)>3?"#4ade80":"#94a3b8"} hint="" />
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
                      </>
                    )}
                    {m?.error && <div style={S.card}><span style={{color:"#f87171"}}>データの取得に失敗しました。</span></div>}
                    {!m && !metricsLoading && (
                      <button style={S.addBtn} onClick={() => fetchMetrics(selected)}>財務データを取得する</button>
                    )}
                  </div>
                )}

                {/* IR NEWS */}
                {detailTab === "ir" && (
                  <div>
                    {irLoading && !irNews[selected.ticker] && (
                      <div style={S.card}><LoadingDots text="AIが最新IRニュースを取得中" /></div>
                    )}
                    {irNews[selected.ticker] && irNews[selected.ticker].length > 0 && (
                      <div>
                        {irNews[selected.ticker].map((item, i) => (
                          <div key={i} style={{...S.card, marginBottom:12}}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                              <Tag color={typeColor(item.type)}>{item.type}</Tag>
                              <span style={{color:"#475569",fontSize:12}}>{item.date}</span>
                            </div>
                            <div style={{fontWeight:700,color:"#f1f5f9",marginBottom:6,fontSize:14}}>{item.title}</div>
                            <div style={{color:"#94a3b8",fontSize:13,lineHeight:1.7}}>{item.summary}</div>
                          </div>
                        ))}
                        <div style={{color:"#334155",fontSize:11,marginTop:8}}>※ AIがウェブ検索で取得した情報です。公式IRページもご確認ください。</div>
                      </div>
                    )}
                    {irNews[selected.ticker] && irNews[selected.ticker].length === 0 && (
                      <div style={S.card}><span style={{color:"#64748b"}}>IRニュースが見つかりませんでした。</span></div>
                    )}
                    {!irNews[selected.ticker] && !irLoading && (
                      <button style={S.addBtn} onClick={() => fetchIR(selected)}>IRニュースを取得する</button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── AI ── */}
        {tab === "ai" && (
          <div>
            <h2 style={S.sectionTitle}>AI 投資相談</h2>
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
              {["EV/EBITDAとは？","信用倍率の見方を教えて","PERとPBRの違いは？","損切りのタイミングは？"].map(q => (
                <button key={q} style={S.chipBtn} onClick={() => setAiQuery(q)}>{q}</button>
              ))}
            </div>
            {(aiLoading || aiResult) && (
              <div style={S.card}>
                {aiLoading ? <LoadingDots text="回答を生成中" /> : (
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

const styles = {
  root: { minHeight:"100vh", background:"#0a0f1a", fontFamily:"'DM Mono','Courier New',monospace", color:"#e2e8f0" },
  header: { display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 24px", background:"#0d1424", borderBottom:"1px solid #1e293b" },
  logo: { display:"flex", alignItems:"center", gap:8 },
  logoIcon: { fontSize:22 },
  logoText: { fontSize:22, fontWeight:900, color:"#f1f5f9", letterSpacing:2 },
  nav: { display:"flex", gap:4, flexWrap:"wrap" },
  navBtn: { background:"transparent", border:"1px solid #1e293b", color:"#64748b", padding:"6px 14px", borderRadius:6, cursor:"pointer", fontSize:13, fontFamily:"inherit", transition:"all .15s" },
  navActive: { background:"#0f2a1a", border:"1px solid #4ade80", color:"#4ade80" },
  summaryBar: { display:"flex", background:"#0d1424", borderBottom:"1px solid #1e293b" },
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
  stockSelector: { display:"flex", flexWrap:"wrap", gap:8, marginBottom:16 },
  chipBtn: { background:"#111827", border:"1px solid #1e293b", color:"#94a3b8", padding:"6px 12px", borderRadius:20, cursor:"pointer", fontSize:12, fontFamily:"inherit" },
  chipActive: { background:"#0f2a1a", border:"1px solid #4ade80", color:"#4ade80" },
  addBtn: { background:"#0f2a1a", border:"1px solid #4ade80", color:"#4ade80", padding:"8px 16px", borderRadius:6, cursor:"pointer", fontSize:13, fontFamily:"inherit", fontWeight:700 },
  addForm: { display:"flex", flexWrap:"wrap", gap:8, marginBottom:16, padding:16, background:"#0d1424", border:"1px solid #1e293b", borderRadius:8 },
  input: { background:"#111827", border:"1px solid #1e293b", color:"#e2e8f0", padding:"8px 12px", borderRadius:6, fontSize:13, fontFamily:"inherit", outline:"none" },
  select: { background:"#111827", border:"1px solid #1e293b", color:"#e2e8f0", padding:"8px 12px", borderRadius:6, fontSize:13, fontFamily:"inherit" },
  miniBtn: { background:"#111827", border:"1px solid #334155", color:"#64748b", padding:"4px 10px", borderRadius:4, cursor:"pointer", fontSize:11, fontFamily:"inherit" },
  tooltip: { background:"#0d1424", border:"1px solid #1e293b", borderRadius:6, color:"#e2e8f0", fontSize:12 },
};
