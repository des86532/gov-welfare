import Link from "next/link";
import { ProgramCard } from "@/components/program-card";
import { taiwanCityOptions } from "@/data/facts";
import { BENEFIT_TYPE_KEYS, BENEFIT_TYPE_LABELS, CATEGORY_KEYS, CATEGORY_LABELS, type BenefitType, type CategoryKey, type CoverageLevel } from "@/lib/domain";
import { appliesToRegion, getProgramAvailability, paginatePrograms, PROGRAM_AVAILABILITY_KEYS, PROGRAM_SORT_KEYS, sortProgramsForCatalog, type ProgramAvailability, type ProgramSort } from "@/lib/program-filters";
import { getPrograms } from "@/lib/program-store";
import { todayInTaiwan } from "@/lib/rules";

export const metadata = { title: "方案清單" };
export const dynamic = "force-dynamic";

type CatalogSearchParams = { availability?: string; benefit?: string; category?: string; coverage?: string; page?: string; q?: string; region?: string; sort?: string; view?: string };

const coverageOptions: Array<{ value: CoverageLevel; label: string }> = [
  { value: "matchable", label: "已驗證，可資格初篩" },
  { value: "descriptive_only", label: "方案可查，資格待確認" },
  { value: "needs_review", label: "官方資料異動，待複核" },
];

const availabilityLabels: Record<ProgramAvailability, string> = {
  open: "目前申請中",
  upcoming: "尚未開始",
  closed: "已截止／已結束",
  unspecified: "常態／期限未註明",
};

const sortLabels: Record<ProgramSort, string> = {
  category: "依類別",
  title: "依標題",
  verified_desc: "最近人工驗證",
  deadline: "即將截止優先",
};

function catalogHref(params: CatalogSearchParams, changes: Partial<CatalogSearchParams>) {
  const next = { ...params, ...changes };
  const query = new URLSearchParams();
  if (next.q?.trim()) query.set("q", next.q.trim());
  if (next.category) query.set("category", next.category);
  if (next.region) query.set("region", next.region);
  if (next.benefit) query.set("benefit", next.benefit);
  if (next.availability) query.set("availability", next.availability);
  if (next.coverage) query.set("coverage", next.coverage);
  if (next.sort && next.sort !== "category") query.set("sort", next.sort);
  if (next.view === "list") query.set("view", "list");
  if (Number(next.page) > 1) query.set("page", String(next.page));
  return `/programs${query.size > 0 ? `?${query}` : ""}`;
}

export default async function ProgramsPage({ searchParams }: { searchParams: Promise<CatalogSearchParams> }) {
  const params = await searchParams;
  const programs = await getPrograms();
  const category = CATEGORY_KEYS.includes(params.category as CategoryKey) ? params.category as CategoryKey : undefined;
  const region = taiwanCityOptions.find((city) => city.value === params.region);
  const benefit = BENEFIT_TYPE_KEYS.includes(params.benefit as BenefitType) ? params.benefit as BenefitType : undefined;
  const coverage = coverageOptions.find((item) => item.value === params.coverage)?.value;
  const availability = PROGRAM_AVAILABILITY_KEYS.includes(params.availability as ProgramAvailability) ? params.availability as ProgramAvailability : undefined;
  const sort = PROGRAM_SORT_KEYS.includes(params.sort as ProgramSort) ? params.sort as ProgramSort : "category";
  const view = params.view === "list" ? "list" : "grid";
  const asOf = todayInTaiwan();
  const query = params.q?.trim().toLocaleLowerCase("zh-Hant") ?? "";
  const visible = sortProgramsForCatalog(programs.filter((program) => {
    if (category && program.category !== category) return false;
    if (!appliesToRegion(program, region?.label)) return false;
    if (benefit && program.benefitType !== benefit) return false;
    if (coverage && program.coverage !== coverage) return false;
    if (availability && getProgramAvailability(program, asOf) !== availability) return false;
    if (!query) return true;
    return [program.title, program.summary, program.authority, ...program.tags].join(" ").toLocaleLowerCase("zh-Hant").includes(query);
  }), sort, asOf);
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const pagination = paginatePrograms(visible, requestedPage);
  const normalizedParams = { ...params, availability, benefit, category, coverage, region: region?.value, sort, view };
  const advancedCount = [availability, benefit, category, coverage, region, sort === "category" ? undefined : sort].filter(Boolean).length;
  const hasFilters = Boolean(query || advancedCount);

  return (
    <div className="page-shell catalog-page">
      <header className="page-title catalog-title">
        <div><p className="eyebrow">Program catalog</p><h1>政府福利方案清單</h1><p>目前 Coverage 是中央 Seed programs，以及桃園、新北、臺北與臺中完成 Review 的 Pilot Programs；不宣稱涵蓋全臺所有福利。</p></div>
        <span className="catalog-count"><strong>{visible.length}</strong> 個結果</span>
      </header>
      <form className="catalog-filter" method="get">
        <div className="catalog-filter-primary">
          <label><span>關鍵字</span><input type="search" name="q" defaultValue={params.q} placeholder="例如：女性、租屋、三年十萬…" autoComplete="off" /></label>
          <button className="button button-small" type="submit">套用篩選</button>
          {hasFilters ? <Link className="text-link" href={catalogHref(normalizedParams, { availability: undefined, benefit: undefined, category: undefined, coverage: undefined, page: undefined, q: undefined, region: undefined, sort: undefined })}>清除全部</Link> : null}
        </div>
        <details className="catalog-filter-details" open={advancedCount > 0}>
          <summary><span>更多篩選與排序</span>{advancedCount > 0 ? <strong>{advancedCount} 項已套用</strong> : <small>Category、地區、Benefit、狀態</small>}</summary>
          <div className="catalog-filter-grid">
            <label><span>Primary category</span><select name="category" defaultValue={category ?? ""}><option value="">全部類別</option>{CATEGORY_KEYS.map((key) => <option key={key} value={key}>{CATEGORY_LABELS[key]}</option>)}</select></label>
            <label><span>適用地區</span><select name="region" defaultValue={region?.value ?? ""}><option value="">全部地區</option>{taiwanCityOptions.map((city) => <option key={city.value} value={city.value}>{city.label}（含中央方案）</option>)}</select></label>
            <label><span>Benefit type</span><select name="benefit" defaultValue={benefit ?? ""}><option value="">全部 Benefit</option>{BENEFIT_TYPE_KEYS.map((key) => <option key={key} value={key}>{BENEFIT_TYPE_LABELS[key]}</option>)}</select></label>
            <label><span>申請狀態</span><select name="availability" defaultValue={availability ?? ""}><option value="">全部狀態</option>{PROGRAM_AVAILABILITY_KEYS.map((key) => <option key={key} value={key}>{availabilityLabels[key]}</option>)}</select></label>
            <label><span>資料狀態</span><select name="coverage" defaultValue={coverage ?? ""}><option value="">全部資料狀態</option>{coverageOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <label><span>排序</span><select name="sort" defaultValue={sort}>{PROGRAM_SORT_KEYS.map((key) => <option key={key} value={key}>{sortLabels[key]}</option>)}</select></label>
          </div>
        </details>
        {view === "list" ? <input type="hidden" name="view" value="list" /> : null}
      </form>

      {visible.length > 0 ? (
        <>
          <div className="catalog-toolbar">
            <p>顯示第 <strong>{pagination.from}–{pagination.to}</strong> 筆，共 {visible.length} 筆</p>
            <nav className="view-toggle" aria-label="顯示模式">
              <Link href={catalogHref(normalizedParams, { view: undefined, page: String(pagination.page) })} aria-current={view === "grid" ? "page" : undefined}>卡片</Link>
              <Link href={catalogHref(normalizedParams, { view: "list", page: String(pagination.page) })} aria-current={view === "list" ? "page" : undefined}>列表</Link>
            </nav>
          </div>
          <div className={view === "list" ? "program-list" : "program-grid catalog-grid"}>
            {pagination.items.map((program) => <ProgramCard key={program.id} program={program} headingLevel={2} variant={view === "list" ? "list" : "compact"} />)}
          </div>
          {pagination.pageCount > 1 ? (
            <nav className="catalog-pagination" aria-label="方案分頁">
              {pagination.page > 1
                ? <Link className="button button-small button-ghost" href={catalogHref(normalizedParams, { page: String(pagination.page - 1) })}>上一頁</Link>
                : <span aria-hidden="true" />}
              <span>第 <strong>{pagination.page}</strong>／{pagination.pageCount} 頁</span>
              {pagination.page < pagination.pageCount
                ? <Link className="button button-small button-ghost" href={catalogHref(normalizedParams, { page: String(pagination.page + 1) })}>下一頁</Link>
                : <span aria-hidden="true" />}
            </nav>
          ) : null}
        </>
      ) : <div className="empty-state"><strong>找不到相符方案</strong><p>試著縮短關鍵字，或清除 Category、地區後再找一次。</p></div>}
    </div>
  );
}
