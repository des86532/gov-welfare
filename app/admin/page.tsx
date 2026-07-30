import { programs } from "@/data/programs";
import { DataMethodContent } from "@/components/data-method-content";
import { newTaipeiSourceClassifications } from "@/data/new-taipei-source-items";
import { sources } from "@/data/sources";
import { taipeiSourceClassifications } from "@/data/taipei-source-items";
import { taichungSourceClassifications } from "@/data/taichung-source-items";
import { taoyuanSourceClassifications } from "@/data/taoyuan-source-items";
import { loadAdminReviewData, type ProgramVersionRow, type SourceItemRow } from "@/lib/admin-review";
import { classifySourceItemAction, publishVersionAction, rejectVersionAction, rollbackVersionAction } from "@/app/admin/actions";

export const metadata = { title: "Review dashboard" };
export const dynamic = "force-dynamic";

const sourceById = new Map(sources.map((source) => [source.id, source]));

function dateTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }) : "—";
}

function jsonPreview(value: Record<string, unknown> | undefined) {
  const text = JSON.stringify(value ?? {}, null, 2);
  return text.length > 4_000 ? `${text.slice(0, 4_000)}\n… truncated` : text;
}

function isOpportunityItem(item: SourceItemRow) {
  return item.canonical_draft.entityType === "opportunity";
}

function SourceItemReviewForm({ item, opportunity = false }: { item: SourceItemRow; opportunity?: boolean }) {
  return (
    <form className="review-form" action={classifySourceItemAction}>
      <input type="hidden" name="sourceItemId" value={item.id} />
      <label>Classification<select name="classification" defaultValue={item.classification ?? "descriptive_only"}>{opportunity ? null : <option value="matchable">matchable</option>}<option value="descriptive_only">descriptive_only</option><option value="excluded">excluded</option></select></label>
      <label>Reviewer<input name="reviewer" required minLength={2} maxLength={80} defaultValue="Admin reviewer" /></label>
      <label>Rationale<textarea name="rationale" required minLength={10} maxLength={1_000} defaultValue={item.classification_rationale ?? ""} placeholder={opportunity ? "記錄資格、日期、費用與政府關聯的 Review 結論。" : "說明這筆資料應如何進入福利 Catalog。"} /></label>
      <button className="button button-small">{opportunity ? "Publish Activity Review" : "儲存 Classification"}</button>
    </form>
  );
}

function VersionEvidence({ version }: { version: ProgramVersionRow }) {
  return (
    <details className="evidence-disclosure">
      <summary>{version.field_evidence.length} 筆 Field evidence</summary>
      <div className="evidence-ledger">
        {version.field_evidence.map((item) => (
          <div key={`${item.field_path}-${item.source_id}-${item.locator}`}>
            <code>{item.field_path}</code>
            <strong>{sourceById.get(item.source_id)?.name ?? item.source_id}</strong>
            <span>{item.locator}</span>
            <p>{item.extracted_value}</p>
            <small>{item.reviewed_at ? `Reviewed ${dateTime(item.reviewed_at)}` : "尚未 Review"}</small>
          </div>
        ))}
      </div>
    </details>
  );
}

function VersionForm({ version, mode }: { version: ProgramVersionRow; mode: "review" | "rollback" }) {
  return (
    <form className="review-form">
      <input type="hidden" name="versionId" value={version.id} />
      <label>Reviewer<input name="reviewer" required minLength={2} maxLength={80} defaultValue="Admin reviewer" /></label>
      <label>Rationale<textarea name="rationale" required minLength={10} maxLength={1_000} placeholder={mode === "rollback" ? "說明為什麼需要恢復這個版本，以及 Evidence 為何仍有效。" : "記錄 Publish 或退回的判斷理由。"} /></label>
      <div className="review-actions">
        {mode === "review" ? (
          <>
            <button className="button button-small" formAction={publishVersionAction}>Publish</button>
            <button className="button button-small danger-button" formAction={rejectVersionAction}>Reject</button>
          </>
        ) : <button className="button button-small danger-button" formAction={rollbackVersionAction}>Rollback 此版本</button>}
      </div>
    </form>
  );
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const feedback = await searchParams;
  let database = null;
  try {
    database = await loadAdminReviewData();
  } catch (error) {
    console.error("Admin Supabase review data failed", error);
  }
  const matchable = programs.filter((program) => program.coverage === "matchable").length;
  const localClassifications = [...taoyuanSourceClassifications, ...newTaipeiSourceClassifications, ...taipeiSourceClassifications, ...taichungSourceClassifications];
  const localExcluded = localClassifications.filter((item) => item.classification === "excluded").length;
  const localMatchable = localClassifications.filter((item) => item.classification === "matchable").length;
  const pendingOpportunityItems = database?.pendingItems.filter(isOpportunityItem) ?? [];
  const pendingProgramItems = database?.pendingItems.filter((item) => !isOpportunityItem(item)) ?? [];
  const reviewedOpportunityCount = new Set((database?.items ?? [])
    .filter((item) => isOpportunityItem(item) && item.review_status === "published" && item.classification === "descriptive_only")
    .map((item) => `${item.source_id}\n${item.external_id}`)).size;
  return (
    <div className="page-shell admin-page">
      <header className="page-title catalog-title"><div><p className="eyebrow">Admin · Evidence control room</p><h1>Source 與 Review dashboard</h1><p>Ingestion 只產生 immutable Snapshot 與 Draft；只有通過 Evidence gate 的 Version 才能 Publish。</p></div><span className={`environment-badge ${database ? "connected" : ""}`}>{database ? "Supabase live" : "Seed data mode"}</span></header>
      <nav className="admin-jump-nav" aria-label="Admin sections"><a href="#overview">總覽</a><a href="#methodology">資料方法</a><a href="#review">Review queue</a><a href="#sources">資料來源</a><a href="#audit">Audit trail</a></nav>
      {feedback.notice ? <div className="admin-feedback success" role="status"><strong>完成</strong><span>{feedback.notice}</span></div> : null}
      {feedback.error ? <div className="admin-feedback error" role="alert"><strong>未執行</strong><span>{feedback.error}</span></div> : null}
      {!database ? <div className="admin-notice"><strong>目前無法讀取 Supabase</strong><span>公開網站仍使用 reviewed Seed fallback，Questionnaire 可繼續操作。</span></div> : null}

      <section className="metric-grid" id="overview">
        <div><span>Snapshots</span><strong>{database?.snapshots.length ?? 0}</strong><small>Immutable responses</small></div>
        <div><span>Review queue</span><strong>{(database?.pendingItems.length ?? 0) + (database?.pendingVersions.length ?? 0)}</strong><small>{pendingOpportunityItems.length} Activities · {database?.pendingVersions.length ?? 0} Program versions</small></div>
        <div><span>Published</span><strong>{database?.published.length ?? programs.length}</strong><small>{database?.published.filter((version) => version.coverage === "matchable").length ?? matchable} Matchable</small></div>
        <div><span>地方已分類</span><strong>197/197</strong><small>{localMatchable} matchable · {localExcluded} excluded</small></div>
      </section>

      <section className="admin-section admin-methodology" id="methodology">
        <div className="admin-section-title"><div><p className="eyebrow">Data governance</p><h2>資料方法</h2></div><span>與 Public 透明度頁面共用同一份內容</span></div>
        <DataMethodContent />
      </section>

      <section className="admin-section" id="review">
        <div className="admin-section-title"><div><p className="eyebrow">Program review</p><h2>等待決策的 Version</h2></div><span>Publish 前再次驗證最新 Snapshot 與每條 Rule evidence</span></div>
        {database?.pendingVersions.length ? <div className="decision-stack">{database.pendingVersions.map((version) => (
          <article className="decision-card" key={version.id}>
            <header><div><span className="review-state state-descriptive_only">{version.status}</span><small>{version.programs.stable_key} · v{version.version}</small></div><strong>{version.coverage}</strong></header>
            <h3>{version.title}</h3><p>{version.summary}</p>
            <dl className="version-facts"><div><dt>Benefit</dt><dd>{version.benefit_type}</dd></div><div><dt>Decision</dt><dd>{version.decision_type}</dd></div><div><dt>Verified</dt><dd>{dateTime(version.last_verified_at)}</dd></div></dl>
            <VersionEvidence version={version} />
            <VersionForm version={version} mode="review" />
          </article>
        ))}</div> : <div className="empty-review"><strong>Program queue 已清空</strong><p>新的 Source 內容不會直接出現在這裡；必須先由 Curator 建立完整 Program Version 與 Field evidence。</p></div>}
      </section>

      <section className="admin-section">
        <div className="admin-section-title"><div><p className="eyebrow">Opportunity review</p><h2>活動與體驗營 Drafts</h2></div><span>{reviewedOpportunityCount} reviewed Opportunities</span></div>
        <div className="admin-notice"><strong>Publish gate</strong><span>活動只允許 <code>descriptive_only</code> 或 <code>excluded</code>。Reviewer 必須核對官方日期、對象、費用、地點與政府關聯；不得轉成自動資格 Rule。</span></div>
        {pendingOpportunityItems.length ? <div className="source-review-grid">{pendingOpportunityItems.map((item) => (
          <article className="source-review-card opportunity-review-card" key={item.id}>
            <header><code>{item.source_id}</code><span>{item.external_id}</span></header>
            <h3>{item.title}</h3>
            <details open><summary>查看 Canonical draft</summary><pre>{jsonPreview(item.canonical_draft)}</pre></details>
            <SourceItemReviewForm item={item} opportunity />
          </article>
        ))}</div> : <div className="empty-review"><strong>Activity queue 已清空</strong><p>最新 Snapshot 中沒有尚待分類的 Opportunity Draft。</p></div>}
      </section>

      <section className="admin-section">
        <div className="admin-section-title"><div><p className="eyebrow">Source item review</p><h2>其他最新 Snapshot 待分類項目</h2></div><span>Classification 不會直接建立或 Publish Program Version</span></div>
        {pendingProgramItems.length ? <div className="source-review-grid">{pendingProgramItems.map((item) => (
          <article className="source-review-card" key={item.id}>
            <header><code>{item.source_id}</code><span>{item.external_id}</span></header>
            <h3>{item.title}</h3>
            <details><summary>查看 Canonical draft</summary><pre>{jsonPreview(item.canonical_draft)}</pre></details>
            <SourceItemReviewForm item={item} />
          </article>
        ))}</div> : <div className="empty-review"><strong>Source item queue 已清空</strong><p>所有最新 Snapshot items 都已完成分類。</p></div>}
      </section>

      <section className="admin-section">
        <div className="admin-section-title"><div><p className="eyebrow">Source diff</p><h2>最近兩個有效 Snapshot</h2></div><span>只比較 Extracted Draft，不載入 Raw body</span></div>
        <div className="diff-stack">{database?.sourceDiffs.map((diff) => {
          const source = sourceById.get(diff.sourceId);
          const changeCount = diff.added.length + diff.removed.length + diff.changed.length;
          return <details className="diff-card" key={diff.sourceId}>
            <summary><span><strong>{source?.name ?? diff.sourceId}</strong><small>{dateTime(diff.current.observed_at)} · {diff.current.content_hash?.slice(0, 12)}</small></span><span className={changeCount ? "diff-count changed" : "diff-count"}>{diff.previous ? `${changeCount} changes` : "baseline"}</span></summary>
            <div className="diff-meta"><code>current {diff.current.id}</code>{diff.previous ? <code>previous {diff.previous.id}</code> : <span>尚無前一版 Snapshot</span>}<span>{diff.unchanged} unchanged items</span></div>
            {[...diff.added, ...diff.changed, ...diff.removed].map((change) => <details className="item-diff" key={`${change.externalId}-${change.fields.join("-")}`}><summary><span>{change.title}</span><code>{change.fields.join(", ")}</code></summary><div>{change.before ? <section><strong>Before</strong><pre>{jsonPreview(change.before)}</pre></section> : null}{change.after ? <section><strong>After</strong><pre>{jsonPreview(change.after)}</pre></section> : null}</div></details>)}
          </details>;
        })}</div>
      </section>

      <section className="admin-section" id="sources"><div className="admin-section-title"><div><p className="eyebrow">Source registry</p><h2>網站使用的資料來源</h2></div><span>{sources.length} registered Sources · <code>npm run sources:persist</code></span></div><div className="table-wrap"><table><thead><tr><th>Source</th><th>Scope</th><th>Status</th><th>Adapter</th><th>Automation</th><th>頻率</th><th>最近檢查</th></tr></thead><tbody>{sources.map((source) => {
        const live = database?.sources.get(source.id);
        const state = live?.last_check_error ? "blocked" : source.status;
        return <tr key={source.id}><td><a href={source.publicUrl ?? source.url} target="_blank" rel="noreferrer"><strong>{source.name} ↗</strong></a><small>{source.authority}{live?.last_check_error?.message ? ` · ${live.last_check_error.message}` : source.note ? ` · ${source.note}` : ""}</small></td><td><strong>{source.jurisdiction}</strong><small>{source.format.toUpperCase()} · {source.roles.join(" / ")}</small></td><td><span className={`source-state source-${state}`}>{state}</span></td><td><code>{source.adapterKey}</code></td><td>{source.automation}</td><td>{source.checkEveryHours ? `${source.checkEveryHours}h` : "Manual"}</td><td>{dateTime(live?.last_checked_at ?? source.lastVerifiedAt)}</td></tr>;
      })}</tbody></table></div></section>

      <section className="admin-section">
        <div className="admin-section-title"><div><p className="eyebrow">Rollback</p><h2>上一個 Published Version</h2></div><span>舊 Evidence 不是最新 Snapshot 時，Server 會拒絕</span></div>
        <div className="rollback-list">{database?.rollbackCandidates.map((version) => <details key={version.id}><summary><span><strong>{version.title}</strong><small>v{version.version} · Published {dateTime(version.published_at)}</small></span><code>{version.coverage}</code></summary><VersionEvidence version={version} /><VersionForm version={version} mode="rollback" /></details>)}</div>
      </section>

      <section className="admin-section" id="audit"><div className="admin-section-title"><div><p className="eyebrow">Audit trail</p><h2>最近 30 筆 Review</h2></div><span>Reviewer 與 Rationale 永久保留</span></div><div className="table-wrap"><table><thead><tr><th>時間</th><th>Action</th><th>Reviewer</th><th>Rationale</th></tr></thead><tbody>{database?.reviews.map((review) => <tr key={review.id}><td>{dateTime(review.created_at)}</td><td><span className="review-state state-descriptive_only">{review.action}</span></td><td>{review.reviewer_name ?? "Supabase user"}</td><td className="wrap-cell">{review.rationale}</td></tr>)}</tbody></table></div></section>
    </div>
  );
}
