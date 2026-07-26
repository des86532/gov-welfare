import type { BenefitType, CategoryKey, DecisionType, Program } from "@/lib/domain";

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
};

export const taoyuanProgramCurations: Curation[] = [
  { title: "公立幼兒園及非營利幼兒園課後留園弱勢(幼兒)補助", slug: "taoyuan-kindergarten-after-school-support", category: "family", benefitType: "cash", decisionType: "official_record_check", benefitSummary: "弱勢幼兒平日留園費用全額補助；寒暑假每人每月最高補助 3,500 元。" },
  { title: "公立幼兒園及非營利幼兒園需要協助幼兒優先入園", slug: "taoyuan-kindergarten-priority-admission", category: "education", benefitType: "care_service", decisionType: "competitive_selection", benefitSummary: "提供公立及非營利幼兒園優先入園資格，實際錄取仍依招生名額與程序。" },
  { title: "原住民族法律費用補助", slug: "taoyuan-indigenous-legal-fee-support", category: "social_aid", benefitType: "grant", decisionType: "professional_assessment", benefitSummary: "補助法律諮詢、文件、裁判及律師費；不同項目與審級設有金額上限。" },
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
  { title: "身心障礙者參加公務人員考試補習費用補助", slug: "taoyuan-disabled-civil-exam-prep", category: "education", benefitType: "grant", decisionType: "official_record_check", benefitSummary: "補助公務人員考試補習課程或函授教材費用，錄取後另有第二階段補助。" },
  { title: "身心障礙者就業及職業重建服務", slug: "taoyuan-disability-vocational-rehab", category: "employment", benefitType: "care_service", decisionType: "professional_assessment", benefitSummary: "提供職涯諮詢、職業訓練、工作媒合、職務再設計與職場支持。" },
  { title: "身心障礙者就業相關手語翻譯服務", slug: "taoyuan-employment-sign-language", category: "employment", benefitType: "free_service", decisionType: "professional_assessment", benefitSummary: "提供面試、職涯諮詢、職場溝通、訓練及勞資爭議等就業情境的手語翻譯。" },
  { title: "身心障礙者社區居住補助", slug: "taoyuan-disability-community-living", category: "care", benefitType: "care_service", decisionType: "professional_assessment", benefitSummary: "提供社區居住、個別化生活支持、生活訓練及社會參與服務。" },
  { title: "身心障礙者職業訓練", slug: "taoyuan-disability-vocational-training", category: "employment", benefitType: "training", decisionType: "professional_assessment", benefitSummary: "提供免學費、就業導向的職業訓練；符合條件者可另申請職業訓練生活津貼。" },
  { title: "身心障礙者自力更生創業補助申請", slug: "taoyuan-disabled-startup-grant", category: "startup", benefitType: "grant", decisionType: "professional_assessment", benefitSummary: "補助創業營業場所租金或設備費用；兩類補助每人終身各以一次為限。" },
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

export function buildTaoyuanDescriptivePrograms(items: ReviewedTaoyuanItem[], reviewedAt: string): Program[] {
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
    return {
      id: curation.slug,
      slug: curation.slug,
      title: curation.title,
      summary: summary(draft.summary) || curation.benefitSummary,
      category: curation.category,
      tags: ["桃園市", ...((Array.isArray(draft.tags) ? draft.tags : []).filter((tag): tag is string => typeof tag === "string"))],
      benefitType: curation.benefitType,
      benefitSummary: curation.benefitSummary,
      coverage: "descriptive_only",
      decisionType: curation.decisionType,
      jurisdiction: "桃園市",
      authority: text(draft.authority).startsWith("桃園市政府") ? text(draft.authority) : `桃園市政府${text(draft.authority)}`,
      officialUrl: authorityUrl || applicationUrl,
      applicationUrl,
      verifiedAt: reviewedAt,
      requestedFacts: [],
      caveats: ["資格仍是自然語言，尚未轉為可自動 Matching 的 Rules。", "實際資格、額度與受理期間以桃園市主管機關認定為準。"],
      documents: documents(draft.documentsText),
      methods: [text(draft.applicationMethod), text(draft.applicationLocation)].filter(Boolean),
      evidence: [
        { ...baseEvidence, locator: `${sourceLocator} / eligibilityCriteria`, extractedValue: eligibilityText || "資格依桃園市 E-service 說明" },
        { ...baseEvidence, locator: `${sourceLocator} / policyDescription`, extractedValue: text(draft.summary) || curation.benefitSummary },
      ],
    };
  });
}
