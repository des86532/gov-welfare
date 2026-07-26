import { programs } from "@/data/programs";
import { sources } from "@/data/sources";
import { taoyuanSourceClassifications } from "@/data/taoyuan-source-items";
import { supabaseConfig, supabaseRest } from "@/lib/supabase-rest";

export const metadata = { title: "Review dashboard" };
export const dynamic = "force-dynamic";

type DatabaseSource = {
  id: string;
  last_checked_at: string | null;
  last_successful_fetch_at: string | null;
  last_check_error: { message?: string } | null;
};

async function databaseSummary() {
  const config = supabaseConfig(true);
  if (!config) return null;
  try {
    const [databaseSources, snapshots, items, versions] = await Promise.all([
      supabaseRest<DatabaseSource[]>(config, "sources?select=id,last_checked_at,last_successful_fetch_at,last_check_error"),
      supabaseRest<Array<{ id: string }>>(config, "source_snapshots?select=id"),
      supabaseRest<Array<{ id: string }>>(config, "source_items?select=id"),
      supabaseRest<Array<{ coverage: string }>>(config, "program_versions?select=coverage&status=eq.published"),
    ]);
    return {
      sources: new Map(databaseSources.map((source) => [source.id, source])),
      snapshots: snapshots.length,
      drafts: items.length,
      published: versions.length,
      matchable: versions.filter((version) => version.coverage === "matchable").length,
    };
  } catch (error) {
    console.error("Admin Supabase summary failed", error);
    return null;
  }
}

export default async function AdminPage() {
  const database = await databaseSummary();
  const matchable = programs.filter((program) => program.coverage === "matchable").length;
  const descriptive = programs.filter((program) => program.coverage === "descriptive_only").length;
  const excluded = taoyuanSourceClassifications.filter((item) => item.classification === "excluded").length;
  return (
    <div className="page-shell admin-page">
      <header className="page-title catalog-title"><div><p className="eyebrow">Admin · Review only</p><h1>Source 與 Review dashboard</h1><p>Ingestion 只產生 immutable Snapshot 與 Draft；未經 Review 的內容不會改寫 Published Program。</p></div><span className={`environment-badge ${database ? "connected" : ""}`}>{database ? "Supabase live" : "Seed data mode"}</span></header>
      {!database ? <div className="admin-notice"><strong>目前無法讀取 Supabase</strong><span>公開網站仍使用 reviewed Seed fallback，Questionnaire 可繼續操作。</span></div> : null}
      <section className="metric-grid"><div><span>Snapshots</span><strong>{database?.snapshots ?? 0}</strong><small>Immutable responses</small></div><div><span>Draft items</span><strong>{database?.drafts ?? 0}</strong><small>Awaiting Review</small></div><div><span>Published</span><strong>{database?.published ?? programs.length}</strong><small>{database?.matchable ?? matchable} Matchable</small></div><div><span>桃園已分類</span><strong>26/26</strong><small>{excluded} excluded · {descriptive} Seed descriptive</small></div></section>
      <section className="admin-section"><div className="admin-section-title"><div><p className="eyebrow">Source registry</p><h2>檢查頻率不是全域設定</h2></div><code>npm run sources:persist</code></div><div className="table-wrap"><table><thead><tr><th>Source</th><th>Status</th><th>Adapter</th><th>Automation</th><th>頻率</th><th>最近檢查</th></tr></thead><tbody>{sources.map((source) => {
        const live = database?.sources.get(source.id);
        const state = live?.last_check_error ? "blocked" : source.status;
        return <tr key={source.id}><td><strong>{source.name}</strong><small>{source.authority}{live?.last_check_error?.message ? ` · ${live.last_check_error.message}` : source.note ? ` · ${source.note}` : ""}</small></td><td><span className={`source-state source-${state}`}>{state}</span></td><td><code>{source.adapterKey}</code></td><td>{source.automation}</td><td>{source.checkEveryHours ? `${source.checkEveryHours}h` : "Manual"}</td><td>{live?.last_checked_at ? new Date(live.last_checked_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }) : source.lastVerifiedAt}</td></tr>;
      })}</tbody></table></div></section>
      <section className="admin-section"><div className="admin-section-title"><div><p className="eyebrow">Taoyuan pilot</p><h2>26 筆 Source item 分類</h2></div><span>Open Data Category 未自動採用</span></div><div className="review-list">{taoyuanSourceClassifications.map((item) => <article key={item.title}><span className={`review-state state-${item.classification}`}>{item.classification}</span><div><strong>{item.title}</strong><p>{item.rationale}</p></div></article>)}</div></section>
    </div>
  );
}
