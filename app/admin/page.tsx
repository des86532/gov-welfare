import { reviewedOpportunities } from "@/data/opportunities";
import { DataMethodContent } from "@/components/data-method-content";
import { sources } from "@/data/sources";
import { activityReportReasonLabels, type ActivityReportReason } from "@/lib/activity-report-shared";
import { supabaseConfig, supabaseRest } from "@/lib/supabase-rest";
import { resolveActivityReportAction } from "@/app/admin/actions";

export const metadata = { title: "資料管理" };
export const dynamic = "force-dynamic";

type DatabaseSource = {
  id: string;
  last_checked_at: string | null;
  last_successful_fetch_at: string | null;
  last_check_error: { message?: string } | null;
};

type ActivityReport = {
  id: string;
  opportunity_slug: string;
  reason: ActivityReportReason;
  detail: string | null;
  created_at: string;
};

const opportunityBySlug = new Map(reviewedOpportunities.map((item) => [item.slug, item]));

function dateTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }) : "—";
}

async function loadAdminData() {
  const config = supabaseConfig(true);
  if (!config) return null;
  const [databaseSources, published, activityReports] = await Promise.all([
    supabaseRest<DatabaseSource[]>(config, "sources?select=id,last_checked_at,last_successful_fetch_at,last_check_error"),
    supabaseRest<Array<{ id: string }>>(config, "program_versions?select=id&status=eq.published"),
    supabaseRest<ActivityReport[]>(config, "activity_reports?select=id,opportunity_slug,reason,detail,created_at&status=eq.open&order=created_at.desc&limit=100"),
  ]);
  return {
    sources: new Map(databaseSources.map((source) => [source.id, source])),
    publishedCount: published.length,
    activityReports,
  };
}

function ActivityReportCard({ report }: { report: ActivityReport }) {
  const opportunity = opportunityBySlug.get(report.opportunity_slug);
  return <article className="decision-card report-review-card">
    <header><div><span className="review-state state-needs-review">使用者回報</span><small>{dateTime(report.created_at)}</small></div><strong>{activityReportReasonLabels[report.reason]}</strong></header>
    <h3><a href={`/activities/${report.opportunity_slug}`} target="_blank" rel="noreferrer">{opportunity?.title ?? report.opportunity_slug} ↗</a></h3>
    <p>{report.detail ?? "使用者未提供補充說明，請查看活動資料與官方頁。"}</p>
    <form className="review-form" action={resolveActivityReportAction}>
      <input type="hidden" name="reportId" value={report.id} />
      <label>處理紀錄<textarea name="rationale" required minLength={5} maxLength={1_000} placeholder="例如：已更新截止日期；或官方頁內容與平台一致。" /></label>
      <div className="review-actions"><button className="button button-small" name="reportStatus" value="resolved">已修正</button><button className="button button-small danger-button" name="reportStatus" value="dismissed">資料無誤</button></div>
    </form>
  </article>;
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const feedback = await searchParams;
  let database = null;
  try {
    database = await loadAdminData();
  } catch (error) {
    console.error("Admin Supabase data failed", error);
  }
  const activityReports = database?.activityReports ?? [];
  const failedSourceCount = sources.filter((source) => database?.sources.get(source.id)?.last_check_error || source.status === "blocked").length;

  return (
    <div className="page-shell admin-page">
      <header className="page-title catalog-title"><div><p className="eyebrow">Admin</p><h1>資料管理</h1><p>福利資料由 Scheduled workflow 自動同步；這裡只查看 Source 狀態與處理使用者回報。</p></div><span className={`environment-badge ${database ? "connected" : ""}`}>{database ? "Supabase live" : "Seed data mode"}</span></header>
      {feedback.notice ? <div className="admin-feedback success" role="status"><strong>完成</strong><span>{feedback.notice}</span></div> : null}
      {feedback.error ? <div className="admin-feedback error" role="alert"><strong>未執行</strong><span>{feedback.error}</span></div> : null}
      {!database ? <div className="admin-notice"><strong>目前無法讀取 Supabase</strong><span>公開網站仍使用 Repository Seed fallback。</span></div> : null}

      <section className="metric-grid" id="overview">
        <div><span>使用者回報</span><strong>{activityReports.length}</strong><small>需要處理</small></div>
        <div><span>已發布方案</span><strong>{database?.publishedCount ?? "—"}</strong><small>使用者目前看得到</small></div>
        <div><span>資料來源</span><strong>{sources.length}</strong><small>已登錄 Sources</small></div>
        <div><span>來源異常</span><strong>{failedSourceCount}</strong><small>失敗時保留上一版</small></div>
      </section>

      <section className="admin-section" id="reports">
        <div className="admin-section-title"><div><p className="eyebrow">User reports</p><h2>使用者回報</h2></div><span>不需要審核自動同步資料</span></div>
        {activityReports.length === 0 ? <div className="empty-review admin-all-clear"><strong>目前沒有使用者回報</strong><p>官方 Source 內容由系統自動更新，不會產生人工 Review Queue。</p></div> : <div className="decision-stack">{activityReports.map((report) => <ActivityReportCard key={report.id} report={report} />)}</div>}
      </section>

      <section className="admin-section admin-advanced">
        <div className="admin-section-title"><div><p className="eyebrow">Sources</p><h2>資料來源與更新狀態</h2></div><span>附官方連結</span></div>
        <div className="table-wrap"><table><thead><tr><th>Source</th><th>地區與格式</th><th>Status</th><th>最近檢查</th></tr></thead><tbody>{sources.map((source) => {
          const live = database?.sources.get(source.id);
          const state = live?.last_check_error ? "blocked" : source.status;
          return <tr key={source.id}><td><a href={source.publicUrl ?? source.url} target="_blank" rel="noreferrer"><strong>{source.name} ↗</strong></a><small>{source.authority}{live?.last_check_error?.message ? ` · ${live.last_check_error.message}` : ""}</small></td><td><strong>{source.jurisdiction}</strong><small>{source.format.toUpperCase()} · {source.automation}</small></td><td><span className={`source-state source-${state}`}>{state}</span></td><td>{source.checkEveryHours ? `每 ${source.checkEveryHours} 小時檢查` : "未排程"}<small>{dateTime(live?.last_checked_at ?? source.lastVerifiedAt)}</small></td></tr>;
        })}</tbody></table></div>
        <details id="methodology" className="admin-methodology-disclosure"><summary><span><strong>資料處理原則</strong><small>了解自動同步與安全邊界</small></span></summary><div className="admin-tool-content admin-methodology"><DataMethodContent /></div></details>
      </section>
    </div>
  );
}
