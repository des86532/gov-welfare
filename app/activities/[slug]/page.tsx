import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { opportunityStatusLabels } from "@/components/opportunity-card";
import { sourceById } from "@/data/sources";
import { getOpportunities, getOpportunityBySlug } from "@/lib/opportunity-store";

export const revalidate = 300;

export async function generateStaticParams() {
  return (await getOpportunities()).map((item) => ({ slug: item.slug }));
}

const selectionLabels = {
  first_come_review: "依報名順序並審查資格",
  competitive_selection: "需甄選／正備取",
  capacity_review: "名額制並由主辦單位審核",
};

const supportLabels = {
  official: "政府主辦或官方活動",
  claimed_pending_evidence: "主辦頁載有政府支應，但政府端 Evidence 待補",
  not_applicable: "非政府補助",
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const item = await getOpportunityBySlug(slug);
  return item ? { title: item.title, description: item.summary } : {};
}

export default async function ActivityDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const item = await getOpportunityBySlug(slug);
  if (!item) notFound();
  const source = sourceById.get(item.sourceId);
  const canApply = item.status === "open" && item.reviewState !== "needs_review" && item.applicationUrl;

  return (
    <div className="page-shell detail-page activity-detail-page">
      <BackLink fallback="/activities" label="← 回上一頁" />
      <header className="detail-hero activity-detail-hero">
        <div>
          <p className="kicker"><span>{item.category}</span><span>{opportunityStatusLabels[item.status]}</span><span>{item.regions.join("・") || "地點待確認"}</span></p>
          <h1>{item.title}</h1>
          <p>{item.summary}</p>
          <div className="tag-row">{item.audiences.map((tag) => <span key={tag}>{tag}</span>)}</div>
        </div>
        <aside className="benefit-ticket activity-ticket"><small>費用與支持</small><strong>{item.feeSummary}</strong><span>{supportLabels[item.governmentSupportStatus]}</span></aside>
      </header>

      {item.reviewState === "needs_review" ? <div className="activity-review-warning" role="status"><strong>官方 Source 已異動</strong><span>目前保留上一個 Reviewed version 供查閱，請在報名前再次核對官方頁；此筆暫不顯示直接報名按鈕。</span></div> : null}

      <div className="detail-layout">
        <div className="detail-main">
          <section><p className="eyebrow">Who can join</p><h2>參與資格</h2><p className="detail-lead">{item.eligibilitySummary}</p>{item.capacitySummary ? <p className="capacity-note"><strong>名額與錄取：</strong>{item.capacitySummary}</p> : null}</section>
          <section className="two-column-section"><div><p className="eyebrow">Schedule</p><h2>時間與地點</h2><ul className="plain-list"><li>{item.eventDateLabel}</li><li>{item.locationSummary}</li></ul></div><div><p className="eyebrow">Registration</p><h2>報名資訊</h2><ul className="plain-list"><li>{item.applicationDateLabel}</li><li>{selectionLabels[item.selectionType]}</li></ul></div></section>
          <section><p className="eyebrow">Important notes</p><h2>判斷限制</h2><ul className="plain-list">{item.caveats.map((note) => <li key={note}>{note}</li>)}</ul></section>
          <section><p className="eyebrow">Field-level provenance</p><h2>逐欄 Evidence</h2><div className="activity-evidence-list">{item.evidence.map((evidence) => <a key={`${evidence.field}-${evidence.locator}`} href={evidence.sourceUrl} target="_blank" rel="noreferrer"><code>{evidence.field}</code><div><strong>{evidence.extractedValue}</strong><span>{evidence.locator}</span></div><span aria-hidden="true">↗</span></a>)}</div></section>
        </div>
        <aside className="detail-aside">
          <dl><div><dt>主辦單位</dt><dd>{item.organizer}</dd></div><div><dt>活動性質</dt><dd>{supportLabels[item.governmentSupportStatus]}</dd></div><div><dt>決定方式</dt><dd>{selectionLabels[item.selectionType]}</dd></div><div><dt>Source</dt><dd>{source?.name ?? item.sourceId}</dd></div><div><dt>最後人工驗證</dt><dd>{item.verifiedAt}</dd></div></dl>
          <a className="button full-button" href={canApply ? item.applicationUrl : item.officialUrl} target="_blank" rel="noreferrer">{canApply ? "前往報名" : "查看官方最新資訊"} <span aria-hidden="true">↗</span></a>
          <p>本平台整理基本條件與官方 Evidence；主辦單位保有活動異動、資格審查、錄取與費用認定權。</p>
        </aside>
      </div>
    </div>
  );
}
