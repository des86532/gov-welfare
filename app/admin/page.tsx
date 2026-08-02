import { programs } from "@/data/programs";
import { DataMethodContent } from "@/components/data-method-content";
import { sources } from "@/data/sources";
import { loadAdminReviewData, type NeedsReviewProgram, type ProgramVersionRow, type SourceDiff, type SourceItemRow } from "@/lib/admin-review";
import { classifySourceItemAction, createNeedsReviewDraftAction, publishVersionAction, rejectVersionAction, rollbackVersionAction } from "@/app/admin/actions";

export const metadata = { title: "資料管理" };
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

function SourceDiffDetails({ diff }: { diff: SourceDiff }) {
  const source = sourceById.get(diff.sourceId);
  const changes = [...diff.added, ...diff.changed, ...diff.removed];
  return <details className="diff-card">
    <summary><span><strong>{source?.name ?? diff.sourceId}</strong><small>{dateTime(diff.current.observed_at)} · {diff.current.content_hash?.slice(0, 12)}</small></span><span className={changes.length ? "diff-count changed" : "diff-count"}>{diff.previous ? `${changes.length} changes` : "baseline"}</span></summary>
    <div className="diff-meta"><code>current {diff.current.id}</code>{diff.previous ? <code>previous {diff.previous.id}</code> : <span>尚無前一版 Snapshot</span>}<span>{diff.unchanged} unchanged items</span></div>
    {changes.map((change) => <details className="item-diff" key={`${change.externalId}-${change.fields.join("-")}`}><summary><span>{change.title}</span><code>{change.fields.join(", ")}</code></summary><div>{change.before ? <section><strong>Before</strong><pre>{jsonPreview(change.before)}</pre></section> : null}{change.after ? <section><strong>After</strong><pre>{jsonPreview(change.after)}</pre></section> : null}</div></details>)}
  </details>;
}

function NeedsReviewCard({ review }: { review: NeedsReviewProgram }) {
  const refreshable = review.issues.filter((issue) => issue.latestSnapshot && issue.latestSnapshot.id !== issue.evidence.snapshot_id);
  return <details className="decision-card needs-review-card">
    <summary className="needs-review-summary"><span><span className="review-state state-needs-review">needs_review</span><span><strong>{review.version.title}</strong><small>{review.version.programs.stable_key} · Published v{review.version.version}</small></span></span><b>{review.issues.length} Evidence issues</b></summary>
    <div className="needs-review-content"><p>Published Evidence 已不是最新 successful Snapshot。先核對官方 Source 與差異，再建立 Draft；Public 會維持待複核狀態直到新版 Publish。</p>
    <div className="needs-review-sources">{[...new Set(review.issues.map((issue) => issue.evidence.source_id))].map((sourceId) => {
      const source = sourceById.get(sourceId);
      const issue = review.issues.find((item) => item.evidence.source_id === sourceId)!;
      return <a key={sourceId} href={source?.publicUrl ?? source?.url} target="_blank" rel="noreferrer"><strong>{source?.name ?? sourceId} ↗</strong><small>{issue.sourceError ?? `最新 Snapshot：${issue.latestSnapshot?.id.slice(0, 8) ?? "missing"}`}</small></a>;
    })}</div>
    {review.sourceDiffs.length ? <div className="needs-review-diffs"><strong>Source diff</strong>{review.sourceDiffs.map((diff) => <SourceDiffDetails key={diff.sourceId} diff={diff} />)}</div> : null}
    {review.existingDraft ? <div className="admin-notice"><strong>已建立 Draft v{review.existingDraft.version}</strong><span>請到下方「福利方案待審核」確認 Evidence 後 Publish 或 Reject。</span></div> : (
      <form className="review-form needs-review-form" action={createNeedsReviewDraftAction}>
        <input type="hidden" name="versionId" value={review.version.id} />
        <div className="evidence-refresh-grid">{refreshable.map((issue) => {
          const source = sourceById.get(issue.evidence.source_id);
          return <fieldset key={issue.evidence.id} disabled={review.blocked}>
            <legend><code>{issue.evidence.field_path}</code> · {source?.name ?? issue.evidence.source_id}</legend>
            <small>舊 Snapshot {issue.evidence.snapshot_id.slice(0, 8)} → 新 Snapshot {issue.latestSnapshot?.id.slice(0, 8)}</small>
            <label>Locator<input name={`locator_${issue.evidence.id}`} required minLength={2} maxLength={500} defaultValue={issue.evidence.locator} /></label>
            <label>Extracted value<textarea name={`value_${issue.evidence.id}`} required minLength={2} maxLength={4_000} defaultValue={issue.evidence.extracted_value} /></label>
          </fieldset>;
        })}</div>
        <div className="needs-review-decision">
          <label>Reviewer<input name="reviewer" required minLength={2} maxLength={80} defaultValue="Admin reviewer" /></label>
          <label>Rationale<textarea name="rationale" required minLength={10} maxLength={1_000} placeholder="說明已核對的官方內容、差異是否影響資格，以及建立 Draft 的理由。" /></label>
          <button className="button button-small" disabled={review.blocked}>{review.blocked ? "Source 異常，暫停建立" : "建立 Evidence Draft"}</button>
        </div>
        <label className="canonical-confirmation"><input type="checkbox" name="canonicalUnchanged" value="true" required />我已確認這次 Source 變動不影響資格 Rule、Benefit、金額與期限；若有影響，應先更新 Canonical content，不可只更新 Evidence。</label>
      </form>
    )}
    </div>
  </details>;
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const feedback = await searchParams;
  let database = null;
  try {
    database = await loadAdminReviewData();
  } catch (error) {
    console.error("Admin Supabase review data failed", error);
  }
  const pendingOpportunityItems = database?.pendingItems.filter(isOpportunityItem) ?? [];
  const pendingProgramItems = database?.pendingItems.filter((item) => !isOpportunityItem(item)) ?? [];
  const pendingVersionCount = database?.pendingVersions.length ?? 0;
  const needsReviewCount = database?.needsReviewPrograms.filter((item) => !item.existingDraft).length ?? 0;
  const pendingCount = pendingOpportunityItems.length + pendingProgramItems.length + pendingVersionCount + needsReviewCount;
  const blockedSourceCount = sources.filter((source) => database?.sources.get(source.id)?.last_check_error || source.status === "blocked").length;
  return (
    <div className="page-shell admin-page">
      <header className="page-title catalog-title"><div><p className="eyebrow">Admin</p><h1>資料管理</h1><p>先處理等待確認的資料；Sources、資料方法與系統紀錄收在頁面下方的進階管理。</p></div><span className={`environment-badge ${database ? "connected" : ""}`}>{database ? "Supabase live" : "Seed data mode"}</span></header>
      {feedback.notice ? <div className="admin-feedback success" role="status"><strong>完成</strong><span>{feedback.notice}</span></div> : null}
      {feedback.error ? <div className="admin-feedback error" role="alert"><strong>未執行</strong><span>{feedback.error}</span></div> : null}
      {!database ? <div className="admin-notice"><strong>目前無法讀取 Supabase</strong><span>公開網站仍使用 reviewed Seed fallback，Questionnaire 可繼續操作。</span></div> : null}

      <section className="metric-grid" id="overview">
        <div><span>待處理</span><strong>{pendingCount}</strong><small>需要人工確認</small></div>
        <div><span>已發布方案</span><strong>{database?.published.length ?? programs.length}</strong><small>使用者目前看得到</small></div>
        <div><span>資料來源</span><strong>{sources.length}</strong><small>已登錄 Sources</small></div>
        <div><span>來源異常</span><strong>{blockedSourceCount}</strong><small>需要檢查或已有替代 Source</small></div>
      </section>

      <section className="admin-section" id="review">
        <div className="admin-section-title"><div><p className="eyebrow">Today</p><h2>待處理工作</h2></div><span>只有人工確認後才會出現在公開網站</span></div>
        {pendingCount === 0 ? <div className="empty-review admin-all-clear"><strong>目前沒有待處理資料</strong><p>新的 Source 內容進來後，會依類型出現在這裡。</p></div> : null}

        {database?.needsReviewPrograms.length ? <div className="admin-task-block"><div className="admin-task-heading"><h3>官方資料異動待複核</h3><p>直接核對受影響 Program、Source diff 與 Evidence，建立 Draft 後再進行 Publish。</p></div><div className="decision-stack">{database.needsReviewPrograms.map((review) => <NeedsReviewCard key={review.version.id} review={review} />)}</div></div> : null}

        {pendingVersionCount ? <div className="admin-task-block"><div className="admin-task-heading"><h3>福利方案待審核</h3><p>確認資格 Rules 與 Evidence 後，決定 Publish 或退回。</p></div><div className="decision-stack">{database?.pendingVersions.map((version) => (
          <article className="decision-card" id={`pending-version-${version.id}`} key={version.id}>
            <header><div><span className="review-state state-descriptive_only">{version.status}</span><small>{version.programs.stable_key} · v{version.version}</small></div><strong>{version.coverage}</strong></header>
            <h3>{version.title}</h3><p>{version.summary}</p>
            <dl className="version-facts"><div><dt>Benefit</dt><dd>{version.benefit_type}</dd></div><div><dt>Decision</dt><dd>{version.decision_type}</dd></div><div><dt>Verified</dt><dd>{dateTime(version.last_verified_at)}</dd></div></dl>
            <VersionEvidence version={version} />
            <VersionForm version={version} mode="review" />
          </article>
        ))}</div></div> : null}

        {pendingOpportunityItems.length ? <div className="admin-task-block"><div className="admin-task-heading"><h3>活動待確認</h3><p>Crawler 找到的活動草稿；確認日期、對象、費用與官方關聯後，決定發布或排除。</p></div><div className="source-review-grid">{pendingOpportunityItems.map((item) => (
          <article className="source-review-card opportunity-review-card" key={item.id}>
            <header><code>{item.source_id}</code><span>{item.external_id}</span></header>
            <h3>{item.title}</h3>
            <details open><summary>查看 Canonical draft</summary><pre>{jsonPreview(item.canonical_draft)}</pre></details>
            <SourceItemReviewForm item={item} opportunity />
          </article>
        ))}</div></div> : null}

        {pendingProgramItems.length ? <div className="admin-task-block"><div className="admin-task-heading"><h3>其他資料待分類</h3><p>判斷這筆 Source item 應進入方案 Catalog、只保留說明，或排除。</p></div><div className="source-review-grid">{pendingProgramItems.map((item) => (
          <article className="source-review-card" key={item.id}>
            <header><code>{item.source_id}</code><span>{item.external_id}</span></header>
            <h3>{item.title}</h3>
            <details><summary>查看 Canonical draft</summary><pre>{jsonPreview(item.canonical_draft)}</pre></details>
            <SourceItemReviewForm item={item} />
          </article>
        ))}</div></div> : null}
      </section>

      <section className="admin-section admin-advanced">
        <div className="admin-section-title"><div><p className="eyebrow">Advanced</p><h2>進階管理</h2></div><span>平常不需要操作</span></div>
        <div className="admin-tool-stack">
          <details id="sources">
            <summary><span><strong>資料來源與更新狀態</strong><small>查看全部 {sources.length} 個 Sources 與最近內容變更</small></span><b>{blockedSourceCount} 異常</b></summary>
            <div className="admin-tool-content">
              <h3>最近兩個有效 Snapshot 的差異</h3>
              <div className="diff-stack">{database?.sourceDiffs.map((diff) => <SourceDiffDetails key={diff.sourceId} diff={diff} />)}</div>
              <h3>網站使用的資料來源</h3>
              <div className="table-wrap"><table><thead><tr><th>Source</th><th>地區與用途</th><th>Status</th><th>檢查</th></tr></thead><tbody>{sources.map((source) => {
        const live = database?.sources.get(source.id);
        const state = live?.last_check_error ? "blocked" : source.status;
        return <tr key={source.id}><td><a href={source.publicUrl ?? source.url} target="_blank" rel="noreferrer"><strong>{source.name} ↗</strong></a><small>{source.authority}{live?.last_check_error?.message ? ` · ${live.last_check_error.message}` : source.note ? ` · ${source.note}` : ""}</small></td><td><strong>{source.jurisdiction}</strong><small>{source.format.toUpperCase()} · {source.roles.join(" / ")}</small></td><td><span className={`source-state source-${state}`}>{state}</span></td><td>{source.checkEveryHours ? `每 ${source.checkEveryHours} 小時` : "人工"}<small>{dateTime(live?.last_checked_at ?? source.lastVerifiedAt)}</small></td></tr>;
              })}</tbody></table></div>
            </div>
          </details>

          <details id="methodology">
            <summary><span><strong>資料處理原則</strong><small>了解 Source 如何經過 Review 後發布</small></span></summary>
            <div className="admin-tool-content admin-methodology"><DataMethodContent /></div>
          </details>

          <details id="audit">
            <summary><span><strong>版本復原與操作紀錄</strong><small>誤改時復原，並追查誰在何時做了什麼決定</small></span></summary>
            <div className="admin-tool-content">
              <h3>可復原的上一版</h3>
              <p className="admin-tool-description">只有需要撤回錯誤發布時才使用 Rollback；Server 會再次檢查 Evidence。</p>
              <div className="rollback-list">{database?.rollbackCandidates.map((version) => <details key={version.id}><summary><span><strong>{version.title}</strong><small>v{version.version} · Published {dateTime(version.published_at)}</small></span><code>{version.coverage}</code></summary><VersionEvidence version={version} /><VersionForm version={version} mode="rollback" /></details>)}</div>
              <h3>最近 30 筆操作紀錄（Audit trail）</h3>
              <p className="admin-tool-description">永久記錄 Publish、Reject 與 Rollback 的時間、操作者及理由，方便追查錯誤；不是待辦清單。</p>
              <div className="table-wrap"><table><thead><tr><th>時間</th><th>Action</th><th>Reviewer</th><th>Rationale</th></tr></thead><tbody>{database?.reviews.map((review) => <tr key={review.id}><td>{dateTime(review.created_at)}</td><td><span className="review-state state-descriptive_only">{review.action}</span></td><td>{review.reviewer_name ?? "Supabase user"}</td><td className="wrap-cell">{review.rationale}</td></tr>)}</tbody></table></div>
            </div>
          </details>
        </div>
      </section>
    </div>
  );
}
