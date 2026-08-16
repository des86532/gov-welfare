import { programs } from "@/data/programs";
import { reviewedOpportunities } from "@/data/opportunities";
import { DataMethodContent } from "@/components/data-method-content";
import { AdminRationaleField } from "@/components/admin-rationale-field";
import { sources } from "@/data/sources";
import { activityReportReasonLabels } from "@/lib/activity-report-shared";
import { loadAdminReviewData, type ActivityReportRow, type EvidenceIssue, type ItemChange, type NeedsReviewProgram, type ProgramVersionRow, type SourceDiff } from "@/lib/admin-review";
import { createNeedsReviewDraftAction, publishVersionAction, rejectVersionAction, resolveActivityReportAction, rollbackVersionAction } from "@/app/admin/actions";

export const metadata = { title: "資料管理" };
export const dynamic = "force-dynamic";

const sourceById = new Map(sources.map((source) => [source.id, source]));
const opportunityBySlug = new Map(reviewedOpportunities.map((item) => [item.slug, item]));

function dateTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }) : "—";
}

function jsonPreview(value: Record<string, unknown> | undefined) {
  const text = JSON.stringify(value ?? {}, null, 2);
  return text.length > 4_000 ? `${text.slice(0, 4_000)}\n… truncated` : text;
}

const fieldLabels: Record<string, string> = {
  title: "方案名稱",
  bodyText: "方案說明",
  summary: "摘要",
  description: "方案說明",
  eligibilityText: "申請資格",
  benefitSummary: "補助內容",
  applicationWindow: "申請期間",
  documents: "申請文件",
  methods: "申請方式",
  contact: "聯絡資訊",
  publishedAt: "公告日期",
  updatedAt: "更新日期",
  new: "新增項目",
  removed: "移除項目",
};

function fieldKey(field: string) {
  return field.startsWith("canonical_draft.") ? field.slice("canonical_draft.".length) : field;
}

function fieldLabel(field: string) {
  const key = fieldKey(field);
  return fieldLabels[key] ?? key.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

function displayValue(value: unknown) {
  if (value == null) return "未提供";
  if (typeof value === "string") return value.trim() || "空白";
  return JSON.stringify(value, null, 2);
}

function itemFieldValue(change: ItemChange, field: string, side: "before" | "after") {
  if (field === "title") return side === "before" ? change.beforeTitle : change.afterTitle;
  if (field === "new" || field === "removed") return side === "before" ? change.before : change.after;
  return (side === "before" ? change.before : change.after)?.[fieldKey(field)];
}

function focusedDifference(beforeValue: unknown, afterValue: unknown) {
  const before = displayValue(beforeValue);
  const after = displayValue(afterValue);
  let prefixLength = 0;
  while (prefixLength < before.length && prefixLength < after.length && before[prefixLength] === after[prefixLength]) prefixLength += 1;
  let suffixLength = 0;
  while (
    suffixLength < before.length - prefixLength
    && suffixLength < after.length - prefixLength
    && before[before.length - 1 - suffixLength] === after[after.length - 1 - suffixLength]
  ) suffixLength += 1;
  const prefix = before.slice(Math.max(0, prefixLength - 120), prefixLength);
  const suffix = suffixLength ? before.slice(before.length - suffixLength, before.length - suffixLength + 120) : "";
  return {
    prefix: `${prefixLength > 120 ? "…" : ""}${prefix}`,
    beforeChanged: before.slice(prefixLength, suffixLength ? before.length - suffixLength : undefined) || "∅",
    afterChanged: after.slice(prefixLength, suffixLength ? after.length - suffixLength : undefined) || "∅",
    suffix: `${suffix}${suffixLength > 120 ? "…" : ""}`,
  };
}

function ItemChangeSummary({ change, technical = false }: { change: ItemChange; technical?: boolean }) {
  const kind = change.fields.includes("new") ? "added" : change.fields.includes("removed") ? "removed" : "changed";
  const kindLabel = kind === "added" ? "新增" : kind === "removed" ? "移除" : "修改";
  const heading = <span className="change-item-heading">
    <span className={`change-kind change-${kind}`}>{kindLabel}</span>
    <strong>{change.title}</strong>
    <small>{change.fields.length} 個欄位</small>
  </span>;
  const body = <>
    <div className="change-fields">
      {change.fields.map((field) => {
        const beforeValue = itemFieldValue(change, field, "before");
        const afterValue = itemFieldValue(change, field, "after");
        const difference = focusedDifference(beforeValue, afterValue);
        return <section className="change-field" key={field}>
          <div className="change-field-name"><strong>{fieldLabel(field)}</strong><code>{field}</code></div>
          <div className="change-value-grid">
            <div className="change-before"><span>修改前</span><p>{difference.prefix}<del>{difference.beforeChanged}</del>{difference.suffix}</p></div>
            <div className="change-after"><span>修改後</span><p>{difference.prefix}<ins>{difference.afterChanged}</ins>{difference.suffix}</p></div>
          </div>
        </section>;
      })}
    </div>
    <details className="raw-change-data"><summary>查看完整 Raw data</summary><div>{change.before ? <section><strong>Before</strong><pre>{jsonPreview(change.before)}</pre></section> : null}{change.after ? <section><strong>After</strong><pre>{jsonPreview(change.after)}</pre></section> : null}</div></details>
  </>;
  return technical
    ? <details className="change-item technical-change-item"><summary>{heading}</summary>{body}</details>
    : <article className="change-item"><header>{heading}</header>{body}</article>;
}

function EvidenceSourceComparison({ issue }: { issue: EvidenceIssue }) {
  if (issue.sourceChanges.length === 0) {
    return <div className="evidence-no-text-diff"><strong>沒有可顯示的文字對比</strong><span>Source hash 已變更，但 Adapter 沒有產生可比較的欄位；請開啟上方官方頁人工核對。</span></div>;
  }
  return <div className="evidence-source-changes">
    <div className="change-summary"><strong>偵測到 {issue.sourceChanges.reduce((count, change) => count + change.fields.length, 0)} 個使用者可見欄位變更</strong><span>只列出真正不同的內容；紅色為舊值，綠色為新值。</span></div>
    {issue.sourceChanges.map((change) => <ItemChangeSummary key={`${change.externalId}-${change.fields.join("-")}`} change={change} />)}
  </div>;
}

function ActivityReportCard({ report }: { report: ActivityReportRow }) {
  const opportunity = opportunityBySlug.get(report.opportunity_slug);
  return <article className="decision-card report-review-card">
    <header><div><span className="review-state state-needs-review">使用者回報</span><small>{dateTime(report.created_at)}</small></div><strong>{activityReportReasonLabels[report.reason]}</strong></header>
    <h3><a href={`/activities/${report.opportunity_slug}`} target="_blank" rel="noreferrer">{opportunity?.title ?? report.opportunity_slug} ↗</a></h3>
    <p>{report.detail ?? "使用者未提供補充說明，請直接核對活動資料與官方頁。"}</p>
    <form className="review-form" action={resolveActivityReportAction}>
      <input type="hidden" name="reportId" value={report.id} />
      <label>處理紀錄<textarea name="rationale" required minLength={5} maxLength={1_000} placeholder="例如：已更新截止日期；或官方頁內容與平台一致。" /></label>
      <div className="review-actions"><button className="button button-small" name="reportStatus" value="resolved">已修正</button><button className="button button-small danger-button" name="reportStatus" value="dismissed">資料無誤</button></div>
    </form>
  </article>;
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
  const publishRationale = "已確認 Draft 的使用者顯示文字、Eligibility Rules 與 Evidence，內容與最新官方來源一致，同意 Publish。";
  const rejectRationale = "已完成核對，但 Draft 的使用者顯示文字、Eligibility Rules 或 Evidence 仍需修正，因此退回。";
  const rollbackRationale = "已確認目前 Published version 有誤，且此歷史版本的使用者顯示文字與 Evidence 仍符合官方來源，同意 Rollback。";
  return (
    <form className="review-form">
      <input type="hidden" name="versionId" value={version.id} />
      <label>Reviewer<input name="reviewer" required minLength={2} maxLength={80} defaultValue="Admin reviewer" /></label>
      <AdminRationaleField
        defaultValue={mode === "rollback" ? rollbackRationale : publishRationale}
        presets={mode === "rollback"
          ? [{ label: "套用 Rollback 理由", value: rollbackRationale }]
          : [{ label: "確認 Publish", value: publishRationale }, { label: "退回修改", value: rejectRationale }]}
        placeholder={mode === "rollback" ? "說明為什麼需要恢復這個版本，以及 Evidence 為何仍有效。" : "記錄 Publish 或退回的判斷理由。"}
      />
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
    <summary><span><strong>{source?.name ?? diff.sourceId}</strong><small>{dateTime(diff.current.observed_at)} · {diff.current.content_hash?.slice(0, 12)}</small></span><span className={changes.length ? "diff-count changed" : "diff-count"}>{diff.previous ? `${changes.length} 筆異動` : "baseline"}</span></summary>
    <div className="diff-meta"><code>current {diff.current.id}</code>{diff.previous ? <code>previous {diff.previous.id}</code> : <span>尚無前一版 Snapshot</span>}<span>{diff.unchanged} unchanged items</span></div>
    {changes.length ? <div className="diff-breakdown"><span className="change-added">新增 {diff.added.length}</span><span className="change-changed">修改 {diff.changed.length}</span><span className="change-removed">移除 {diff.removed.length}</span></div> : <div className="diff-all-clear">沒有使用者可見文字變更</div>}
    {changes.map((change) => <ItemChangeSummary technical key={`${change.externalId}-${change.fields.join("-")}`} change={change} />)}
  </details>;
}

function NeedsReviewCard({ review }: { review: NeedsReviewProgram }) {
  const refreshable = review.issues.filter((issue) => issue.latestSnapshot && issue.latestSnapshot.id !== issue.evidence.snapshot_id);
  const unchangedRationale = "已比對官方來源與新舊文字，確認本次變更不影響使用者顯示的資格、Benefit、金額、期限與方案說明；更新 Evidence 至最新 Snapshot。";
  return <details className="decision-card needs-review-card">
    <summary className="needs-review-summary"><span><span className="review-state state-needs-review">needs_review</span><span><strong>{review.version.title}</strong><small>{review.version.programs.stable_key} · Published v{review.version.version}</small></span></span><b>{review.issues.length} Evidence issues</b></summary>
    <div className="needs-review-content"><p>Authority page 或 PDF 已變更。請開啟官方頁，核對這筆 Evidence 是否仍正確；Structured government API 的一般 Snapshot 更新不會出現在這裡。</p>
    <div className="needs-review-sources">{[...new Set(review.issues.map((issue) => issue.evidence.source_id))].map((sourceId) => {
      const source = sourceById.get(sourceId);
      const issue = review.issues.find((item) => item.evidence.source_id === sourceId)!;
      return <a key={sourceId} href={source?.publicUrl ?? source?.url} target="_blank" rel="noreferrer"><strong>{source?.name ?? sourceId} ↗</strong><small>{issue.sourceError ?? `最新 Snapshot：${issue.latestSnapshot?.id.slice(0, 8) ?? "missing"}`}</small></a>;
    })}</div>
    {review.existingDraft ? <div className="admin-notice"><strong>已建立 Draft v{review.existingDraft.version}</strong><span>請到下方「福利方案待審核」確認 Evidence 後 Publish 或 Reject。</span></div> : (
      <form className="review-form needs-review-form" action={createNeedsReviewDraftAction}>
        <input type="hidden" name="versionId" value={review.version.id} />
        <div className="evidence-refresh-grid">{refreshable.map((issue) => {
          const source = sourceById.get(issue.evidence.source_id);
          return <fieldset key={issue.evidence.id} disabled={review.blocked}>
            <legend><code>{issue.evidence.field_path}</code> · {source?.name ?? issue.evidence.source_id}</legend>
            <small>舊 Snapshot {issue.evidence.snapshot_id.slice(0, 8)} → 新 Snapshot {issue.latestSnapshot?.id.slice(0, 8)}</small>
            <EvidenceSourceComparison issue={issue} />
            <div className="published-evidence"><strong>目前 Published Evidence</strong><span>{issue.evidence.locator}</span><p>{issue.evidence.extracted_value}</p></div>
            <label>確認後的新 Locator<input name={`locator_${issue.evidence.id}`} required minLength={2} maxLength={500} defaultValue={issue.evidence.locator} /></label>
            <label>確認後的新 Evidence 值<textarea name={`value_${issue.evidence.id}`} required minLength={2} maxLength={4_000} defaultValue={issue.evidence.extracted_value} /></label>
          </fieldset>;
        })}</div>
        <div className="needs-review-decision">
          <label>Reviewer<input name="reviewer" required minLength={2} maxLength={80} defaultValue="Admin reviewer" /></label>
          <AdminRationaleField
            defaultValue={unchangedRationale}
            presets={[{ label: "確認不影響顯示", value: unchangedRationale }]}
            placeholder="說明已核對的官方內容、差異是否影響資格，以及建立 Draft 的理由。"
          />
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
  const activityReports = database?.activityReports ?? [];
  const pendingVersionCount = database?.pendingVersions.length ?? 0;
  const needsReviewCount = database?.needsReviewPrograms.filter((item) => !item.existingDraft).length ?? 0;
  const pendingCount = activityReports.length + pendingVersionCount + needsReviewCount;
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
        <div className="admin-section-title"><div><p className="eyebrow">Today</p><h2>待處理工作</h2></div><span>只列出會影響使用者資料正確性的項目</span></div>
        {pendingCount === 0 ? <div className="empty-review admin-all-clear"><strong>目前沒有待處理資料</strong><p>只有既有 Published Program 的實質內容異動，或使用者主動回報，才會出現在這裡。</p></div> : null}

        {database?.needsReviewPrograms.length ? <div className="admin-task-block"><div className="admin-task-heading"><h3>資格來源待複核</h3><p>只有 Authority page／PDF 的變更會列在這裡；請開官方頁核對資格、金額與期限，再建立 Draft。</p></div><div className="decision-stack">{database.needsReviewPrograms.map((review) => <NeedsReviewCard key={review.version.id} review={review} />)}</div></div> : null}

        {pendingVersionCount ? <div className="admin-task-block"><div className="admin-task-heading"><h3>福利方案待審核</h3><p>只列出資格、Benefit、金額、期限或公開說明有實質差異的 Draft；Snapshot、驗證時間、點閱數與 URL-only 變更會自動忽略。</p></div><div className="decision-stack">{database?.pendingVersions.map((version) => (
          <article className="decision-card" id={`pending-version-${version.id}`} key={version.id}>
            <header><div><span className="review-state state-descriptive_only">{version.status}</span><small>{version.programs.stable_key} · v{version.version}</small></div><strong>{version.coverage}</strong></header>
            <h3>{version.title}</h3><p>{version.summary}</p>
            <dl className="version-facts"><div><dt>Benefit</dt><dd>{version.benefit_type}</dd></div><div><dt>Decision</dt><dd>{version.decision_type}</dd></div><div><dt>Verified</dt><dd>{dateTime(version.last_verified_at)}</dd></div></dl>
            <VersionEvidence version={version} />
            <VersionForm version={version} mode="review" />
          </article>
        ))}</div></div> : null}

        {activityReports.length ? <div className="admin-task-block"><div className="admin-task-heading"><h3>活動資料回報</h3><p>使用者指出公開活動可能有誤；請依活動 Detail 內的官方連結確認後，修正平台資料或標記資料無誤。</p></div><div className="decision-stack">{activityReports.map((report) => <ActivityReportCard key={report.id} report={report} />)}</div></div> : null}

      </section>

      <section className="admin-section admin-advanced">
        <div className="admin-section-title"><div><p className="eyebrow">Advanced</p><h2>進階管理</h2></div><span>平常不需要操作</span></div>
        <div className="admin-tool-stack">
          <details id="sources">
            <summary><span><strong>資料來源與更新狀態</strong><small>查看全部 {sources.length} 個 Sources 與最近內容變更</small></span><b>{blockedSourceCount} 異常</b></summary>
            <div className="admin-tool-content">
              <h3>Source history（技術診斷）</h3>
              <p className="admin-tool-description">這裡比較同一個 Source 前後兩次 Snapshot，所以 Source 名稱會相同。它只用來排查 Adapter 或抓取格式問題，不是日常 Review 工作，也不會因 Structured government API 的一般更新而暫停公開方案。</p>
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
