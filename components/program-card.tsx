import Link from "next/link";
import { BENEFIT_TYPE_LABELS, CATEGORY_LABELS, type Program } from "@/lib/domain";

type ProgramCardVariant = "default" | "compact" | "list";

export function ProgramCard({ program, eyebrow, headingLevel = 3, variant = "default" }: { program: Program; eyebrow?: string; headingLevel?: 2 | 3; variant?: ProgramCardVariant }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";

  return (
    <article className={`program-card program-card-${variant}`}>
      <div className="program-card-topline">
        <span className="eyebrow">{eyebrow ?? CATEGORY_LABELS[program.category]}</span>
        <span className={`coverage-dot coverage-${program.coverage}`}>{program.coverage === "matchable" ? "可資格初篩" : "官方資料"}</span>
      </div>
      <Heading><Link href={`/programs/${program.slug}`}>{program.title}</Link></Heading>
      <p>{program.summary}</p>
      <div className="benefit-strip">
        <span>{BENEFIT_TYPE_LABELS[program.benefitType]}</span>
        <strong>{program.benefitSummary}</strong>
      </div>
      <footer>
        <span>{program.jurisdiction} · {program.authority}</span>
        <Link className="text-link" href={`/programs/${program.slug}`}>查看依據 <span aria-hidden="true">→</span></Link>
      </footer>
    </article>
  );
}
