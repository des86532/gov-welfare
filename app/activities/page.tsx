import Link from "next/link";
import { OpportunityCard } from "@/components/opportunity-card";
import { OPPORTUNITY_AUDIENCES, OPPORTUNITY_CATEGORIES, type OpportunityCategory } from "@/data/opportunities";
import { taiwanCityOptions } from "@/data/facts";
import { getOpportunities, opportunityMatchesAudience, opportunityMatchesRegion, type OpportunityStatus } from "@/lib/opportunity-store";

export const metadata = { title: "活動與體驗營" };
const statuses: Array<{ value: OpportunityStatus; label: string }> = [
  { value: "open", label: "報名中" },
  { value: "not_open", label: "尚未開放" },
  { value: "closed", label: "報名截止、活動未結束" },
  { value: "ended", label: "活動已結束" },
  { value: "unknown", label: "報名狀態待確認" },
];
const statusOrder: Record<OpportunityStatus, number> = { open: 0, not_open: 1, closed: 2, unknown: 3, ended: 4 };

export default async function ActivitiesPage({ searchParams }: { searchParams: Promise<{ audience?: string; category?: string; q?: string; region?: string; status?: string }> }) {
  const params = await searchParams;
  const opportunities = await getOpportunities();
  const category = OPPORTUNITY_CATEGORIES.includes(params.category as OpportunityCategory) ? params.category as OpportunityCategory : undefined;
  const status = statuses.find((item) => item.value === params.status)?.value;
  const region = taiwanCityOptions.find((city) => city.value === params.region);
  const audience = OPPORTUNITY_AUDIENCES.find((item) => item === params.audience);
  const query = params.q?.trim().toLocaleLowerCase("zh-Hant") ?? "";
  const visible = opportunities.filter((item) => {
    if (category && item.category !== category) return false;
    if (status && item.status !== status) return false;
    if (!opportunityMatchesRegion(item, region?.label)) return false;
    if (!opportunityMatchesAudience(item, audience)) return false;
    if (!query) return true;
    return [item.title, item.summary, item.organizer, item.locationSummary, ...item.audiences]
      .join(" ").toLocaleLowerCase("zh-Hant").includes(query);
  }).sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || (a.eventStart ?? "9999").localeCompare(b.eventStart ?? "9999"));
  const hasFilters = Boolean(category || status || region || audience || query);

  return (
    <div className="page-shell catalog-page activities-page">
      <header className="page-title catalog-title">
        <div>
          <p className="eyebrow">Platform activity data</p>
          <h1>活動與體驗營</h1>
          <p>收錄本平台整理的政府、Foundation 與政府計畫相關活動，並附官方參考連結。活動資訊可能臨時調整，請以主辦單位公告為準；發現錯誤可直接回報。</p>
        </div>
        <span className="catalog-count"><strong>{visible.length}</strong> 個結果</span>
      </header>

      <div className="activity-scope-note">
        <strong>與福利方案不同</strong>
        <span>這裡的地區是「活動舉辦地」，中央機關主辦不代表選擇任一縣市都會顯示。非政府主辦活動也會清楚標示，不混稱為政府補助。</span>
      </div>

      <form className="catalog-filter activity-filter" method="get">
        <label><span>關鍵字</span><input type="search" name="q" defaultValue={params.q} placeholder="例如：航空、步道、女學生" /></label>
        <label><span>活動類型</span><select name="category" defaultValue={category ?? ""}><option value="">全部類型</option>{OPPORTUNITY_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>活動地點</span><select name="region" defaultValue={region?.value ?? ""}><option value="">全部地區</option>{taiwanCityOptions.map((city) => <option key={city.value} value={city.value}>{city.label}</option>)}</select></label>
        <label><span>適用對象</span><select name="audience" defaultValue={audience ?? ""}><option value="">全部對象</option>{OPPORTUNITY_AUDIENCES.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>報名狀態</span><select name="status" defaultValue={status ?? ""}><option value="">全部狀態</option>{statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <button className="button button-small" type="submit">篩選</button>
        {hasFilters ? <Link className="text-link" href="/activities">清除</Link> : null}
      </form>

      {visible.length > 0 ? <div className="opportunity-grid">{visible.map((item) => <OpportunityCard key={item.slug} opportunity={item} />)}</div> : <div className="empty-state"><strong>找不到相符活動</strong><p>活動可能已截止，試著清除報名狀態或地區後再找一次。</p></div>}
    </div>
  );
}
