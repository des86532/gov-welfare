import type { BenefitType, CategoryKey, DecisionType, Program } from "@/lib/domain";

type TainanDraft = {
  title?: unknown;
  ageLowerText?: unknown;
  ageUpperText?: unknown;
  householdCondition?: unknown;
  residenceDaysText?: unknown;
  identityText?: unknown;
  incomeLimitText?: unknown;
  assetLimitText?: unknown;
  realEstateLimitText?: unknown;
  otherEligibilityText?: unknown;
  documentsText?: unknown;
  authority?: unknown;
  contactText?: unknown;
  legacyDetailUrl?: unknown;
};

export type TainanSourceItem = {
  external_id: string;
  title: string;
  snapshot_id: string;
  canonical_draft: TainanDraft;
  classification: "descriptive_only" | string | null;
  review_status: string;
};

const SOURCE_ID = "tainan-social-welfare-open-data";
const DATASET_URL = "https://data.gov.tw/dataset/79613";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function compact(value: string, limit = 260): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}…` : normalized;
}

function categoryFor(title: string): CategoryKey {
  if (/房屋|租金|購屋/.test(title)) return "housing";
  if (/創業|商店攤販|貸款/.test(title)) return "startup";
  if (/就學|教育|發展帳戶/.test(title)) return "education";
  if (/兒童|少年|育兒|托育|家庭|生育|嬰兒|孕產婦/.test(title)) return "family";
  if (/醫療|傷病|健保/.test(title)) return "health";
  if (/老人|身心障礙|照顧|輔具|國民年金/.test(title)) return "care";
  return "social_aid";
}

function benefitTypeFor(title: string): BenefitType {
  if (/貸款.*利息|利息補貼|利息補助/.test(title)) return "interest_subsidy";
  if (/貸款/.test(title)) return "loan";
  if (/用電優惠|保險|健保費|自付保險/.test(title)) return "fee_reduction";
  if (/費用補助|教育補助|法律訴訟補助/.test(title)) return "grant";
  return "cash";
}

function decisionTypeFor(title: string): DecisionType {
  if (/貸款|利息/.test(title)) return "loan_credit_review";
  if (/救助|醫療|傷病|危機|弱勢|特殊境遇|照顧/.test(title)) return "professional_assessment";
  return "official_record_check";
}

function documents(value: unknown): string[] {
  return [...new Set(text(value)
    .split(/\n|；/)
    .map((item) => item.replace(/^\s*(?:\d+[.、]|[-•])\s*/, "").trim())
    .filter(Boolean))]
    .slice(0, 20);
}

function eligibilitySummary(draft: TainanDraft): string {
  const ageLower = text(draft.ageLowerText);
  const ageUpper = text(draft.ageUpperText);
  const age = ageLower || ageUpper
    ? `年齡 ${ageLower || "未註明"}–${ageUpper || "未註明"} 歲`
    : "";
  return compact([
    age,
    text(draft.householdCondition) ? `設籍：${text(draft.householdCondition)}` : "",
    text(draft.residenceDaysText) ? `居住日數需大於 183 日：${text(draft.residenceDaysText)}` : "",
    text(draft.identityText) ? `身分：${text(draft.identityText)}` : "",
    text(draft.otherEligibilityText),
    text(draft.incomeLimitText) ? `API 所列所得上限：${text(draft.incomeLimitText)}` : "",
    text(draft.assetLimitText) ? `API 所列動產上限：${text(draft.assetLimitText)}` : "",
    text(draft.realEstateLimitText) ? `API 所列不動產上限：${text(draft.realEstateLimitText)}` : "",
  ].filter(Boolean).join("；"), 700);
}

export function buildTainanPassthroughPrograms(items: TainanSourceItem[], observedOn: string): Program[] {
  const published = items.filter((item) => item.review_status === "published" && item.classification === "descriptive_only");
  const duplicateCounts = new Map<string, number>();
  for (const item of published) duplicateCounts.set(item.title, (duplicateCounts.get(item.title) ?? 0) + 1);

  return published.map((item) => {
    const draft = item.canonical_draft;
    const identity = text(draft.identityText);
    const duplicate = (duplicateCounts.get(item.title) ?? 0) > 1;
    const displayTitle = duplicate
      ? `${item.title}（${identity || `API 項目 ${item.external_id}`}）`
      : item.title;
    const eligibility = eligibilitySummary(draft);
    const contact = [text(draft.authority), text(draft.contactText)].filter(Boolean).join("・");
    const category = categoryFor(item.title);
    return {
      id: `tainan-social-welfare-${item.external_id}`,
      slug: `tainan-social-welfare-${item.external_id}`,
      title: displayTitle,
      summary: compact(text(draft.otherEligibilityText)) || `臺南市政府 Open Data 收錄的「${item.title}」福利項目。`,
      category,
      ...(category === "startup" ? { applicantTypes: ["individual", "startup"] as const } : {}),
      tags: ["臺南市", identity, text(draft.householdCondition)].filter(Boolean),
      benefitType: benefitTypeFor(item.title),
      benefitSummary: "政府 API 未提供一致的給付金額欄位；請依官方 Dataset 與受理單位確認最新額度。",
      coverage: "descriptive_only",
      decisionType: decisionTypeFor(item.title),
      jurisdiction: "臺南市",
      authority: "臺南市政府社會局",
      officialUrl: DATASET_URL,
      verifiedAt: observedOn,
      requestedFacts: [],
      caveats: [
        "本筆直接顯示臺南市政府 API 原文，未自動轉成 Eligibility Rules。",
        ...(eligibility ? [`政府 API 資格摘要：${eligibility}`] : []),
        "API 可能包含舊年度金額或舊制欄位；申請前請開啟官方 Dataset，並向受理單位確認現行資格與額度。",
      ],
      documents: documents(draft.documentsText),
      methods: contact ? [contact] : ["請洽臺南市政府社會局或所在地區公所"],
      evidence: [{
        sourceId: SOURCE_ID,
        snapshotId: item.snapshot_id,
        locator: `data[補助流水號=${item.external_id}]`,
        extractedValue: eligibility || item.title,
        reviewedAt: observedOn,
      }],
      sourceMode: "government_api_passthrough",
    };
  });
}
