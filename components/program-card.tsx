import Link from "next/link";
import { CATEGORY_LABELS, type Program } from "@/lib/domain";

const benefitLabels: Record<Program["benefitType"], string> = {
  cash: "現金給付",
  grant: "Grant",
  loan: "Loan",
  interest_subsidy: "利息補貼",
  fee_reduction: "費用減免",
  free_service: "免費服務",
  training: "課程／訓練",
  scholarship: "Scholarship",
  guarantee: "Credit guarantee",
  care_service: "照顧服務",
};

export function ProgramCard({ program, eyebrow }: { program: Program; eyebrow?: string }) {
  return (
    <article className="program-card">
      <div className="program-card-topline">
        <span className="eyebrow">{eyebrow ?? CATEGORY_LABELS[program.category]}</span>
        <span className={`coverage-dot coverage-${program.coverage}`}>{program.coverage === "matchable" ? "已驗證 Rules" : "資格待確認"}</span>
      </div>
      <h3><Link href={`/programs/${program.slug}`}>{program.title}</Link></h3>
      <p>{program.summary}</p>
      <div className="benefit-strip">
        <span>{benefitLabels[program.benefitType]}</span>
        <strong>{program.benefitSummary}</strong>
      </div>
      <footer>
        <span>{program.jurisdiction} · {program.authority}</span>
        <Link className="text-link" href={`/programs/${program.slug}`}>查看依據 <span aria-hidden="true">→</span></Link>
      </footer>
    </article>
  );
}
