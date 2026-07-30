import Link from "next/link";
import type { PublicOpportunity } from "@/lib/opportunity-store";

export const opportunityStatusLabels = {
  open: "報名中",
  not_open: "尚未開放",
  closed: "報名截止",
  ended: "活動已結束",
  unknown: "報名狀態待確認",
} as const;

const supportLabels = {
  official: "政府主辦／官方活動",
  claimed_pending_evidence: "政府支應待交叉驗證",
  not_applicable: "非政府補助",
};

export function OpportunityCard({ opportunity }: { opportunity: PublicOpportunity }) {
  return (
    <article className="opportunity-card">
      <div className="opportunity-card-topline">
        <span className={`opportunity-status status-${opportunity.status}`}>{opportunityStatusLabels[opportunity.status]}</span>
        <span>{opportunity.category}</span>
      </div>
      <h3><Link href={`/activities/${opportunity.slug}`}>{opportunity.title}</Link></h3>
      <p>{opportunity.summary}</p>
      <dl className="opportunity-quick-facts">
        <div><dt>活動日期</dt><dd>{opportunity.eventDateLabel}</dd></div>
        <div><dt>活動地點</dt><dd>{opportunity.locationSummary}</dd></div>
        <div><dt>費用／支持</dt><dd>{opportunity.feeSummary}</dd></div>
      </dl>
      <footer>
        <span>{supportLabels[opportunity.governmentSupportStatus]}</span>
        <Link className="text-link" href={`/activities/${opportunity.slug}`}>查看資格與 Evidence →</Link>
      </footer>
    </article>
  );
}
