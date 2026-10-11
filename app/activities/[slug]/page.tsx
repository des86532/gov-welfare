import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { ActivityReportForm } from "@/components/activity-report-form";
import { opportunityStatusLabels } from "@/components/opportunity-card";
import { sourceById } from "@/data/sources";
import { getOpportunities, getOpportunityBySlug } from "@/lib/opportunity-store";
import type { CuratedOpportunity } from "@/data/opportunities";

export const revalidate = 300;

export async function generateStaticParams() {
  return (await getOpportunities()).map((item) => ({ slug: item.slug }));
}

const selectionLabels: Record<CuratedOpportunity["selectionType"], string> = {
  first_come_review: "依報名順序並審查資格",
  competitive_selection: "需甄選／正備取",
  capacity_review: "名額制並由主辦單位審核",
  registration_approval: "報名後須經主辦單位審核",
  open_registration: "線上報名，詳細規則以主辦單位公告為準",
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
  const canApply = item.status === "open" && item.applicationUrl;

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

      <div className="activity-review-warning" role="status"><strong>報名前請核對官方頁</strong><span>活動內容由本平台整理，日期、名額與報名方式可能臨時調整；官方主辦頁資訊優先。</span></div>

      <div className="detail-layout">
        <div className="detail-main">
          <section><p className="eyebrow">Who can join</p><h2>參與資格</h2><p className="detail-lead">{item.eligibilitySummary}</p>{item.capacitySummary ? <p className="capacity-note"><strong>名額與錄取：</strong>{item.capacitySummary}</p> : null}</section>
          <section className="two-column-section"><div><p className="eyebrow">Schedule</p><h2>時間與地點</h2><ul className="plain-list"><li>{item.eventDateLabel}</li><li>{item.locationSummary}</li></ul></div><div><p className="eyebrow">Registration</p><h2>報名資訊</h2><ul className="plain-list"><li>{item.applicationDateLabel}</li><li>{selectionLabels[item.selectionType]}</li></ul></div></section>
          <section><p className="eyebrow">Important notes</p><h2>判斷限制</h2><ul className="plain-list">{item.caveats.map((note) => <li key={note}>{note}</li>)}</ul></section>
          <section><p className="eyebrow">Field-level provenance</p><h2>逐欄 Evidence</h2><div className="activity-evidence-list">{item.evidence.map((evidence) => <a key={`${evidence.field}-${evidence.locator}`} href={evidence.sourceUrl} target="_blank" rel="noreferrer"><code>{evidence.field}</code><div><strong>{evidence.extractedValue}</strong><span>{evidence.locator}</span></div><span aria-hidden="true">↗</span></a>)}</div></section>
        </div>
        <aside className="detail-aside">
          <dl><div><dt>主辦單位</dt><dd>{item.organizer}</dd></div><div><dt>活動性質</dt><dd>{supportLabels[item.governmentSupportStatus]}</dd></div><div><dt>決定方式</dt><dd>{selectionLabels[item.selectionType]}</dd></div><div><dt>Source</dt><dd>{source?.name ?? item.sourceId}</dd></div><div><dt>資料整理日期</dt><dd>{item.verifiedAt}</dd></div></dl>
          <a className="button full-button" href={canApply ? item.applicationUrl : item.officialUrl} target="_blank" rel="noreferrer">{canApply ? "前往報名" : "查看官方最新資訊"} <span aria-hidden="true">↗</span></a>
          <p>本平台整理基本條件與官方 Evidence；主辦單位保有活動異動、資格審查、錄取與費用認定權。</p>
          <ActivityReportForm opportunitySlug={item.slug} />
        </aside>
      </div>
    </div>
  );
}
