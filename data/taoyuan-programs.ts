import type { AtomicRule, BenefitType, CategoryKey, DecisionType, Evidence, Program, RuleNode } from "@/lib/domain";

type TaoyuanDraft = {
  title?: unknown;
  tags?: unknown;
  summary?: unknown;
  eligibilityText?: unknown;
  applicationMethod?: unknown;
  applicationLocation?: unknown;
  documentsText?: unknown;
  authority?: unknown;
  authorityUrl?: unknown;
  applicationUrl?: unknown;
  resourceModifiedAt?: unknown;
};

export type ReviewedTaoyuanItem = {
  title: string;
  snapshot_id: string;
  canonical_draft: TaoyuanDraft;
};

type Curation = {
  title: string;
  slug: string;
  category: CategoryKey;
  benefitType: BenefitType;
  decisionType: DecisionType;
  benefitSummary: string;
  match?: {
    rule: RuleDraft;
    caveats: string[];
  };
};

type AtomicRuleDraft = Omit<AtomicRule, "evidence"> & { evidenceText: string };
type RuleDraft = AtomicRuleDraft | { all: RuleDraft[] } | { any: RuleDraft[] };

function condition(
  field: string,
  operator: AtomicRule["operator"],
  value: AtomicRule["value"],
  label: string,
  evidenceText: string,
): AtomicRuleDraft {
  return { field, operator, value, label, evidenceText };
}

export const taoyuanProgramCurations: Curation[] = [
  {
    title: "公立幼兒園及非營利幼兒園課後留園弱勢(幼兒)補助",
    slug: "taoyuan-kindergarten-after-school-support",
    category: "family",
    benefitType: "cash",
    decisionType: "official_record_check",
    benefitSummary: "弱勢幼兒平日留園費用全額補助；寒暑假每人每月最高補助 3,500 元。",
    match: {
      rule: { all: [
        condition("child_age", "between", [2, 5], "幼兒年齡為 2–5 歲", "學齡 2 至 5 歲幼兒"),
        condition("child_registered_in_taoyuan", "eq", true, "幼兒設籍桃園市", "設籍桃園市"),
        condition("child_attends_taoyuan_public_or_nonprofit_kindergarten", "eq", true, "就讀桃園市公立或非營利幼兒園", "就讀本市公立或非營利幼兒園"),
        condition("child_support_status", "in", ["low_income", "mid_low_income", "approved_special"], "具有低收入、中低收入或經核定經濟特殊身分", "低收入戶、中低收入戶或經核定為經濟情況特殊之幼兒"),
      ] },
      caveats: ["平台只判斷幼兒基本門檻；學期、留園事實與弱勢證明仍由園所及教育機關查核。"],
    },
  },
  { title: "公立幼兒園及非營利幼兒園需要協助幼兒優先入園", slug: "taoyuan-kindergarten-priority-admission", category: "education", benefitType: "care_service", decisionType: "competitive_selection", benefitSummary: "提供公立及非營利幼兒園優先入園資格，實際錄取仍依招生名額與程序。" },
  {
    title: "原住民族法律費用補助",
    slug: "taoyuan-indigenous-legal-fee-support",
    category: "social_aid",
    benefitType: "grant",
    decisionType: "professional_assessment",
    benefitSummary: "補助法律諮詢、文件、裁判及律師費；不同項目與審級設有金額上限。",
    match: {
      rule: { all: [
        condition("is_indigenous", "eq", true, "具有原住民族身分", "原住民族人"),
        condition("household_city", "eq", "taoyuan", "設籍桃園市", "設籍本市"),
        condition("residence_city", "eq", "taoyuan", "實際居住桃園市", "實際居住本市"),
        condition("taoyuan_residence_months", "gte", 4, "已在桃園市實際居住滿 4 個月", "實際居住本市 4 個月以上"),
      ] },
      caveats: ["平台僅比對自然人申請門檻；團體申請及案件、費用、審級仍由原住民族行政局審查。"],
    },
  },
  { title: "政策性農業專案貸款利息補助", slug: "taoyuan-agriculture-policy-loan-interest", category: "startup", benefitType: "interest_subsidy", decisionType: "loan_credit_review", benefitSummary: "補助期間最長一年，年利率最高補助 1.5%，須先取得政策性農業專案貸款。" },
  { title: "新住民職業訓練期間子女托育補助", slug: "taoyuan-new-immigrant-training-childcare", category: "employment", benefitType: "cash", decisionType: "official_record_check", benefitSummary: "全日制托育每名子女每月最高 5,000 元、年度最高 15,000 元；臨時托育依時薪核給。" },
  { title: "桃園市特殊境遇家庭扶助", slug: "taoyuan-special-circumstances-family-support", category: "social_aid", benefitType: "cash", decisionType: "professional_assessment", benefitSummary: "依家庭狀況提供生活、醫療、教育、托育及法律等扶助。" },
  { title: "桃園市身心障礙者臨時及短期照顧服務", slug: "taoyuan-disability-respite-care", category: "care", benefitType: "care_service", decisionType: "professional_assessment", benefitSummary: "依照顧情形每年最高提供 150 至 380 小時服務，部分身分可全額補助。" },
  { title: "申請漁業天然災害救助及低利貸款", slug: "taoyuan-fishery-disaster-relief", category: "social_aid", benefitType: "cash", decisionType: "professional_assessment", benefitSummary: "公告災區內符合損失標準的漁民可申請現金救助，並可能申辦低利貸款。" },
  { title: "申請農業天然災害救助及低利貸款", slug: "taoyuan-agriculture-disaster-relief", category: "social_aid", benefitType: "cash", decisionType: "professional_assessment", benefitSummary: "公告災區內符合損失標準的農民可申請現金救助，並可能申辦低利貸款。" },
  { title: "經濟弱勢原住民修繕住宅補助", slug: "taoyuan-indigenous-home-repair", category: "housing", benefitType: "grant", decisionType: "official_record_check", benefitSummary: "補助經濟弱勢原住民族家庭住宅修繕費用，實際額度依資格與修繕項目核定。" },
  { title: "經濟弱勢原住民建購住宅補助", slug: "taoyuan-indigenous-home-purchase", category: "housing", benefitType: "grant", decisionType: "official_record_check", benefitSummary: "補助經濟弱勢原住民族家庭建造或購買住宅，須經所得、財產及住宅條件審查。" },
  { title: "經濟弱勢原住民族家庭租屋補助計畫", slug: "taoyuan-indigenous-rent-support", category: "housing", benefitType: "cash", decisionType: "official_record_check", benefitSummary: "提供經濟弱勢原住民族家庭租屋費用補助，依租約、所得及住宅條件核定。" },
  { title: "訴訟期間生活補助金", slug: "taoyuan-labor-lawsuit-living-support", category: "social_aid", benefitType: "cash", decisionType: "professional_assessment", benefitSummary: "勞工在勞資爭議訴訟期間可申請生活補助，須依案件與資力條件審查。" },
  { title: "訴訟裁判費、律師費及裁決律師費", slug: "taoyuan-labor-lawsuit-fee-support", category: "social_aid", benefitType: "grant", decisionType: "professional_assessment", benefitSummary: "補助符合條件勞工的裁判費、律師費或不當勞動行為裁決代理費。" },
  {
    title: "身心障礙者參加公務人員考試補習費用補助",
    slug: "taoyuan-disabled-civil-exam-prep",
    category: "education",
    benefitType: "grant",
    decisionType: "official_record_check",
    benefitSummary: "補助公務人員考試補習課程或函授教材費用，錄取後另有第二階段補助。",
    match: {
      rule: { all: [
        condition("age", "gte", 18, "年滿 18 歲", "年滿 18 歲"),
        condition("household_city", "eq", "taoyuan", "設籍桃園市", "設籍於桃園市"),
        condition("is_disabled", "eq", true, "持有身心障礙證明", "領有身心障礙證明"),
        condition("is_public_employee", "eq", false, "不是現任公職人員", "非現任公職人員"),
        condition("civil_service_exam_prep", "eq", true, "參加合法立案課程或購買相關函授教材", "參加合法立案補習班之公務人員考試課程（含購買函授教材）"),
      ] },
      caveats: ["平台只比對基本申請門檻；課程、費用、付款證明與補助階段仍由勞動局查核。"],
    },
  },
  { title: "身心障礙者就業及職業重建服務", slug: "taoyuan-disability-vocational-rehab", category: "employment", benefitType: "care_service", decisionType: "professional_assessment", benefitSummary: "提供職涯諮詢、職業訓練、工作媒合、職務再設計與職場支持。" },
  { title: "身心障礙者就業相關手語翻譯服務", slug: "taoyuan-employment-sign-language", category: "employment", benefitType: "free_service", decisionType: "professional_assessment", benefitSummary: "提供面試、職涯諮詢、職場溝通、訓練及勞資爭議等就業情境的手語翻譯。" },
  { title: "身心障礙者社區居住補助", slug: "taoyuan-disability-community-living", category: "care", benefitType: "care_service", decisionType: "professional_assessment", benefitSummary: "提供社區居住、個別化生活支持、生活訓練及社會參與服務。" },
  { title: "身心障礙者職業訓練", slug: "taoyuan-disability-vocational-training", category: "employment", benefitType: "training", decisionType: "professional_assessment", benefitSummary: "提供免學費、就業導向的職業訓練；符合條件者可另申請職業訓練生活津貼。" },
  {
    title: "身心障礙者自力更生創業補助申請",
    slug: "taoyuan-disabled-startup-grant",
    category: "startup",
    benefitType: "grant",
    decisionType: "professional_assessment",
    benefitSummary: "補助創業營業場所租金或設備費用；兩類補助每人終身各以一次為限。",
    match: {
      rule: { all: [
        condition("age", "between", [18, 65], "年齡為 18–65 歲", "年滿十八歲至六十五歲"),
        condition("is_disabled", "eq", true, "持有身心障礙證明", "領有身心障礙證明"),
        condition("household_city", "eq", "taoyuan", "設籍桃園市", "設籍本市"),
        condition("residence_city", "eq", "taoyuan", "實際居住桃園市", "實際居住本市"),
        condition("startup_intent_and_work_ability", "eq", true, "具有創業意願及工作能力", "具有創業意願及工作能力"),
        condition("is_registered_business_owner", "eq", true, "是所創事業的登記或許可負責人", "為所創事業登記或許可設立之負責人"),
        condition("business_registered_within_year", "eq", true, "事業登記或執業許可未逾一年", "公司、商業登記或領有執業許可證未逾一年"),
        condition("business_tax_registered_in_taoyuan", "eq", true, "營業稅籍設於桃園市", "營業稅籍設於本市"),
      ] },
      caveats: ["平台只比對申請基本門檻；創業計畫、工作能力、費用及終身使用紀錄仍由勞動局審查。"],
    },
  },
  { title: "農田受災救助", slug: "taoyuan-farmland-disaster-relief", category: "social_aid", benefitType: "cash", decisionType: "professional_assessment", benefitSummary: "農田流失每公頃最高 10 萬元、埋沒每公頃最高 5 萬元，須達受災面積標準。" },
];

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function summary(value: unknown): string {
  const cleaned = text(value).split("【備註】")[0].trim();
  return cleaned.length > 240 ? `${cleaned.slice(0, 237)}…` : cleaned;
}

function documents(value: unknown): string[] {
  return [...new Set(text(value).split(/；|\n/).map((item) => item.replace(/^[-\s]+/, "").trim()).filter(Boolean))];
}

function attachEvidence(rule: RuleDraft, base: Omit<Evidence, "locator" | "extractedValue">, sourceLocator: string): RuleNode {
  if ("all" in rule) return { all: rule.all.map((child) => attachEvidence(child, base, sourceLocator)) };
  if ("any" in rule) return { any: rule.any.map((child) => attachEvidence(child, base, sourceLocator)) };
  const { evidenceText, ...atomic } = rule;
  return {
    ...atomic,
    evidence: {
      ...base,
      locator: `${sourceLocator} / eligibilityCriteria / ${atomic.field}`,
      extractedValue: evidenceText,
    },
  };
}

function requestedFacts(rule?: RuleNode): string[] {
  if (!rule) return [];
  if ("all" in rule) return [...new Set(rule.all.flatMap(requestedFacts))];
  if ("any" in rule) return [...new Set(rule.any.flatMap(requestedFacts))];
  return [rule.field === "age" ? "birth_date" : rule.field];
}

export function buildTaoyuanReviewedPrograms(items: ReviewedTaoyuanItem[], reviewedAt: string): Program[] {
  const itemByTitle = new Map(items.map((item) => [item.title, item]));
  return taoyuanProgramCurations.map((curation) => {
    const item = itemByTitle.get(curation.title);
    if (!item) throw new Error(`Missing reviewed Taoyuan Source item: ${curation.title}`);
    const draft = item.canonical_draft;
    const applicationUrl = text(draft.applicationUrl);
    const authorityUrl = text(draft.authorityUrl);
    const eligibilityText = text(draft.eligibilityText);
    const sourceLocator = `sourceUrl=${applicationUrl}`;
    const baseEvidence = {
      sourceId: "taoyuan-welfare-open-data",
      snapshotId: item.snapshot_id,
      reviewedAt,
    };
    const rule = curation.match ? attachEvidence(curation.match.rule, baseEvidence, sourceLocator) : undefined;
    return {
      id: curation.slug,
      slug: curation.slug,
      title: curation.title,
      summary: summary(draft.summary) || curation.benefitSummary,
      category: curation.category,
      tags: ["桃園市", ...((Array.isArray(draft.tags) ? draft.tags : []).filter((tag): tag is string => typeof tag === "string"))],
      benefitType: curation.benefitType,
      benefitSummary: curation.benefitSummary,
      coverage: rule ? "matchable" : "descriptive_only",
      decisionType: curation.decisionType,
      jurisdiction: "桃園市",
      authority: text(draft.authority).startsWith("桃園市政府") ? text(draft.authority) : `桃園市政府${text(draft.authority)}`,
      officialUrl: authorityUrl || applicationUrl,
      applicationUrl,
      verifiedAt: reviewedAt,
      requestedFacts: requestedFacts(rule),
      ...(rule ? { rule } : {}),
      caveats: curation.match
        ? [...curation.match.caveats, "實際資格、額度與受理期間以桃園市主管機關認定為準。"]
        : ["資格仍是自然語言，尚未轉為可自動 Matching 的 Rules。", "實際資格、額度與受理期間以桃園市主管機關認定為準。"],
      documents: documents(draft.documentsText),
      methods: [text(draft.applicationMethod), text(draft.applicationLocation)].filter(Boolean),
      evidence: [
        { ...baseEvidence, locator: `${sourceLocator} / eligibilityCriteria`, extractedValue: eligibilityText || "資格依桃園市 E-service 說明" },
        { ...baseEvidence, locator: `${sourceLocator} / policyDescription`, extractedValue: text(draft.summary) || curation.benefitSummary },
      ],
    };
  });
}
