import Link from "next/link";
import { ProgramCard } from "@/components/program-card";
import { CATEGORY_KEYS, CATEGORY_LABELS } from "@/lib/domain";
import { getPrograms } from "@/lib/program-store";

const featuredSlugs = ["cervical-cancer-screening", "industrial-talent-investment", "youth-overseas-dream-fund", "childcare-allowance-under-2"];
export default async function HomePage() {
  const programs = await getPrograms();
  const reviewedAt = programs.map((program) => program.verifiedAt).sort().at(-1) ?? "—";
  const featured = featuredSlugs.map((slug) => programs.find((program) => program.slug === slug)).filter((program) => program !== undefined);
  const matchableCount = programs.filter((program) => program.coverage === "matchable").length;
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="kicker"><span>中央福利</span><span>桃園 Pilot</span><span>來源可追溯</span></p>
          <h1>福利很多，<br /><em>不該靠運氣找到。</em></h1>
          <p className="hero-lead">回答年齡、國籍與生活狀態，初步找出你可能適用的政府福利；每一個判斷都附官方依據。</p>
          <div className="hero-actions"><Link className="button" href="/find">開始資格初篩 <span aria-hidden="true">→</span></Link><Link className="button button-ghost" href="/programs">先瀏覽全部方案</Link></div>
          <p className="privacy-inline"><span aria-hidden="true">◉</span> 不需登入，回答不會離開你的 Browser</p>
        </div>
        <div className="hero-ledger" aria-label="目前資料範圍">
          <div className="ledger-ribbon">MVP DATA SCOPE</div>
          <dl>
            <div><dt>已收錄</dt><dd>{programs.length}<small>Programs</small></dd></div>
            <div><dt>可初篩</dt><dd>{matchableCount}<small>Reviewed Rules</small></dd></div>
            <div><dt>地方範圍</dt><dd>桃園<small>Pilot city</small></dd></div>
            <div><dt>資料日期</dt><dd>{reviewedAt.slice(5).replace("-", ".")}<small>{reviewedAt.slice(0, 4)} Review</small></dd></div>
          </dl>
          <p>Open Data 只作為 Draft；未經人工 Review 的 Rules 不會說你「符合」。</p>
        </div>
      </section>

      <section className="category-section">
        <header className="section-header"><div><p className="eyebrow">從生活面向開始</p><h2>你現在在找什麼？</h2></div><p>每個方案只有一個 Primary category，青年、女性、原住民等身分用 Tags 交叉標記。</p></header>
        <div className="category-grid">
          {CATEGORY_KEYS.map((key, index) => {
            const count = programs.filter((program) => program.category === key).length;
            return <Link key={key} href={`/programs?category=${key}`} className="category-tile"><span className="category-index">{String(index + 1).padStart(2, "0")}</span><strong>{CATEGORY_LABELS[key]}</strong><small>{count} 個收錄方案</small><span className="tile-arrow" aria-hidden="true">↗</span></Link>;
          })}
        </div>
      </section>

      <section className="featured-section">
        <header className="section-header"><div><p className="eyebrow">先看幾個常見需求</p><h2>已建立資格依據的方案</h2></div><Link className="text-link" href="/programs">查看完整清單 →</Link></header>
        <div className="program-grid">{featured.map((program) => <ProgramCard key={program.id} program={program} />)}</div>
      </section>

      <section className="method-strip">
        <div><span>1</span><strong>只問需要的條件</strong><p>Questionnaire 隨候選方案調整，可隨時略過。</p></div>
        <div><span>2</span><strong>三值邏輯保留不確定</strong><p>不知道不等於不符合，結果會清楚標示缺少資料。</p></div>
        <div><span>3</span><strong>回到官方完成申請</strong><p>顯示最後驗證日、主管機關、文件與官方入口。</p></div>
      </section>
    </>
  );
}
