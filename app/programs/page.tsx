import Link from "next/link";
import { ProgramCard } from "@/components/program-card";
import { taiwanCityOptions } from "@/data/facts";
import { CATEGORY_KEYS, CATEGORY_LABELS, type CategoryKey } from "@/lib/domain";
import { appliesToRegion } from "@/lib/program-filters";
import { getPrograms } from "@/lib/program-store";

export const metadata = { title: "方案清單" };
export const dynamic = "force-dynamic";

export default async function ProgramsPage({ searchParams }: { searchParams: Promise<{ category?: string; q?: string; region?: string }> }) {
  const params = await searchParams;
  const programs = await getPrograms();
  const category = CATEGORY_KEYS.includes(params.category as CategoryKey) ? params.category as CategoryKey : undefined;
  const region = taiwanCityOptions.find((city) => city.value === params.region);
  const query = params.q?.trim().toLocaleLowerCase("zh-Hant") ?? "";
  const visible = programs.filter((program) => {
    if (category && program.category !== category) return false;
    if (!appliesToRegion(program, region?.label)) return false;
    if (!query) return true;
    return [program.title, program.summary, program.authority, ...program.tags].join(" ").toLocaleLowerCase("zh-Hant").includes(query);
  });

  return (
    <div className="page-shell catalog-page">
      <header className="page-title catalog-title">
        <div><p className="eyebrow">Program catalog</p><h1>政府福利方案清單</h1><p>目前 Coverage 是中央 Seed programs，以及桃園、新北、臺北與臺中完成 Review 的 Pilot Programs；不宣稱涵蓋全臺所有福利。</p></div>
        <span className="catalog-count"><strong>{visible.length}</strong> 個結果</span>
      </header>
      <form className="catalog-filter" method="get">
        <label><span>關鍵字</span><input type="search" name="q" defaultValue={params.q} placeholder="例如：女性、租屋、三年十萬" /></label>
        <label><span>Primary category</span><select name="category" defaultValue={category ?? ""}><option value="">全部類別</option>{CATEGORY_KEYS.map((key) => <option key={key} value={key}>{CATEGORY_LABELS[key]}</option>)}</select></label>
        <label><span>適用地區</span><select name="region" defaultValue={region?.value ?? ""}><option value="">全部地區</option>{taiwanCityOptions.map((city) => <option key={city.value} value={city.value}>{city.label}（含中央方案）</option>)}</select></label>
        <button className="button button-small" type="submit">篩選</button>
        {(category || query || region) ? <Link className="text-link" href="/programs">清除</Link> : null}
      </form>
      {visible.length > 0 ? <div className="program-grid catalog-grid">{visible.map((program) => <ProgramCard key={program.id} program={program} />)}</div> : <div className="empty-state"><strong>找不到相符方案</strong><p>試著縮短關鍵字，或清除 Category、地區後再找一次。</p></div>}
    </div>
  );
}
