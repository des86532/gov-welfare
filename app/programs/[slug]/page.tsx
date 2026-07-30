import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { sourceById } from "@/data/sources";
import { CATEGORY_LABELS, type RuleNode } from "@/lib/domain";
import { getProgramBySlug, getPrograms } from "@/lib/program-store";

export const revalidate = 300;

export async function generateStaticParams() {
  return (await getPrograms()).map((program) => ({ slug: program.slug }));
}

const coverageLabels = {
  catalog_only: "Catalog only",
  descriptive_only: "資格待結構化",
  matchable: "Rules 已人工驗證",
  needs_review: "資料異動待複核",
  archived: "已封存",
};

const decisionLabels = {
  entitlement: "客觀資格型",
  official_record_check: "需官方紀錄查核",
  professional_assessment: "需專業評估",
  competitive_selection: "需競爭甄選",
  loan_credit_review: "需金融機構授信",
  automatic: "符合後由機關主動處理",
};

function RuleTree({ rule }: { rule: RuleNode }) {
  if ("all" in rule || "any" in rule) {
    const children = "all" in rule ? rule.all : rule.any;
    return <div className="rule-group"><span className="rule-operator">{("all" in rule) ? "以下全部" : "以下任一"}</span><div>{children.map((child, index) => <RuleTree key={index} rule={child} />)}</div></div>;
  }
  const source = sourceById.get(rule.evidence.sourceId);
  return <div className="atomic-rule"><span aria-hidden="true">✓</span><div><strong>{rule.label}</strong><small>依據：{source?.name ?? rule.evidence.sourceId} · {rule.evidence.locator}</small></div></div>;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const program = await getProgramBySlug(slug);
  return program ? { title: program.title, description: program.summary } : {};
}

export default async function ProgramDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const program = await getProgramBySlug(slug);
  if (!program) notFound();
  const sources = [...new Set(program.evidence.map((item) => item.sourceId))].map((id) => sourceById.get(id)).filter((source) => source !== undefined);

  return (
    <div className="page-shell detail-page">
      <BackLink fallback="/programs" label="← 回上一頁" />
      <header className="detail-hero">
        <div>
          <p className="kicker"><span>{program.jurisdiction}</span><span>{CATEGORY_LABELS[program.category]}</span></p>
          <h1>{program.title}</h1><p>{program.summary}</p>
          <div className="tag-row">{program.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
        </div>
        <aside className="benefit-ticket"><small>你可以得到什麼</small><strong>{program.benefitSummary}</strong><span>{coverageLabels[program.coverage]}</span></aside>
      </header>

      <div className="detail-layout">
        <div className="detail-main">
          <section><p className="eyebrow">Eligibility rules</p><h2>資格依據</h2>{program.rule ? <RuleTree rule={program.rule} /> : <div className="review-callout"><strong>尚未開放自動比對</strong><p>這個方案的自然語言資格尚未完成逐條 Review，因此只提供官方說明與入口。</p></div>}</section>
          {program.caveats.length > 0 ? <section><p className="eyebrow">Important notes</p><h2>判斷限制</h2><ul className="plain-list">{program.caveats.map((item) => <li key={item}>{item}</li>)}</ul></section> : null}
          <section className="two-column-section"><div><p className="eyebrow">Prepare</p><h2>可能需要的文件</h2>{program.documents.length ? <ul className="plain-list">{program.documents.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="muted">由主管機關依身分資料查核。</p>}</div><div><p className="eyebrow">Apply</p><h2>受理方式</h2><ul className="plain-list">{program.methods.map((item) => <li key={item}>{item}</li>)}</ul></div></section>
          <section><p className="eyebrow">Field-level provenance</p><h2>官方 Sources</h2><div className="source-list">{sources.map((source) => <a key={source.id} href={source.publicUrl ?? source.url} target="_blank" rel="noreferrer"><span>{source.authority}</span><strong>{source.name}</strong><small>最後人工驗證：{program.verifiedAt} · 開啟官方頁 ↗</small></a>)}</div></section>
        </div>
        <aside className="detail-aside">
          <dl><div><dt>主管機關</dt><dd>{program.authority}</dd></div><div><dt>Jurisdiction</dt><dd>{program.jurisdiction}</dd></div><div><dt>官方決策方式</dt><dd>{decisionLabels[program.decisionType]}</dd></div><div><dt>最後人工驗證</dt><dd>{program.verifiedAt}</dd></div>{program.applicationWindow ? <div><dt>申請期間</dt><dd>{program.applicationWindow.label}</dd></div> : null}</dl>
          <a className="button full-button" href={program.applicationUrl ?? program.officialUrl} target="_blank" rel="noreferrer">前往官方網站 <span aria-hidden="true">↗</span></a>
          <p>本平台僅做初步整理，主管機關保有最終資格、甄選、授信與核定權。</p>
        </aside>
      </div>
    </div>
  );
}
