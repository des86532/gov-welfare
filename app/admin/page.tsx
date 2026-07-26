import { programs } from "@/data/programs";
import { sources } from "@/data/sources";
import { taoyuanSourceClassifications } from "@/data/taoyuan-source-items";

export const metadata = { title: "Review dashboard" };
export const dynamic = "force-dynamic";

export default function AdminPage() {
  const hasDatabase = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  const matchable = programs.filter((program) => program.coverage === "matchable").length;
  const descriptive = programs.filter((program) => program.coverage === "descriptive_only").length;
  const excluded = taoyuanSourceClassifications.filter((item) => item.classification === "excluded").length;
  return (
    <div className="page-shell admin-page">
      <header className="page-title catalog-title"><div><p className="eyebrow">Admin · Review only</p><h1>Source 與 Review dashboard</h1><p>此頁呈現 Seed snapshot。Ingestion 只產生 Draft；Publish／Rollback 的正式持久化介面由 Supabase migration 提供。</p></div><span className={`environment-badge ${hasDatabase ? "connected" : ""}`}>{hasDatabase ? "Supabase configured" : "Seed data mode"}</span></header>
      {!hasDatabase ? <div className="admin-notice"><strong>目前未連接 Supabase</strong><span>公開 MVP 可完整操作；要啟用 Review persistence，請設定 .env 並套用 migration。</span></div> : null}
      <section className="metric-grid"><div><span>Sources</span><strong>{sources.length}</strong><small>Registry entries</small></div><div><span>Matchable</span><strong>{matchable}</strong><small>Reviewed rule sets</small></div><div><span>Descriptive</span><strong>{descriptive}</strong><small>Searchable only</small></div><div><span>桃園已分類</span><strong>26/26</strong><small>{excluded} excluded</small></div></section>
      <section className="admin-section"><div className="admin-section-title"><div><p className="eyebrow">Source registry</p><h2>檢查頻率不是全域設定</h2></div><code>npm run sources:check</code></div><div className="table-wrap"><table><thead><tr><th>Source</th><th>Status</th><th>Adapter</th><th>Automation</th><th>頻率</th><th>最後驗證</th></tr></thead><tbody>{sources.map((source) => <tr key={source.id}><td><strong>{source.name}</strong><small>{source.authority}{source.note ? ` · ${source.note}` : ""}</small></td><td><span className={`source-state source-${source.status}`}>{source.status}</span></td><td><code>{source.adapterKey}</code></td><td>{source.automation}</td><td>{source.checkEveryHours ? `${source.checkEveryHours}h` : "Manual"}</td><td>{source.lastVerifiedAt}</td></tr>)}</tbody></table></div></section>
      <section className="admin-section"><div className="admin-section-title"><div><p className="eyebrow">Taoyuan pilot</p><h2>26 筆 Source item 分類</h2></div><span>Open Data Category 未自動採用</span></div><div className="review-list">{taoyuanSourceClassifications.map((item) => <article key={item.title}><span className={`review-state state-${item.classification}`}>{item.classification}</span><div><strong>{item.title}</strong><p>{item.rationale}</p></div></article>)}</div></section>
    </div>
  );
}
