import assert from "node:assert/strict";
import test from "node:test";
import { programs } from "../data/programs";
import { buildTaoyuanReviewedPrograms, taoyuanProgramCurations } from "../data/taoyuan-programs";
import { evaluateRule, matchProgram } from "../lib/rules";
import type { Evidence, RuleNode } from "../lib/domain";

const evidence: Evidence = { sourceId: "test", snapshotId: "snapshot", locator: "test", extractedValue: "test" };
const atom = (field: string, operator: "gte" | "eq", value: number | boolean): RuleNode => ({ field, operator, value, label: field, evidence });
const taoyuanPrograms = buildTaoyuanReviewedPrograms(taoyuanProgramCurations.map((item) => ({
  title: item.title,
  snapshot_id: "00000000-0000-4000-8000-000000000001",
  canonical_draft: {
    title: item.title,
    eligibilityText: "測試資格",
    authority: "測試局",
    applicationUrl: `https://example.gov.tw/${item.slug}`,
  },
})), "2026-07-27");

test("生日當天才增加實歲", () => {
  const rule = atom("age", "gte", 30);
  assert.equal(evaluateRule(rule, { birth_date: "1996-07-27" }, "2026-07-26").truth, false);
  assert.equal(evaluateRule(rule, { birth_date: "1996-07-26" }, "2026-07-26").truth, true);
});

test("all 與 any 保留 unknown", () => {
  const allRule: RuleNode = { all: [atom("a", "eq", true), atom("b", "eq", true)] };
  const anyRule: RuleNode = { any: [atom("a", "eq", true), atom("b", "eq", true)] };
  assert.equal(evaluateRule(allRule, { a: true }).truth, "unknown");
  assert.equal(evaluateRule(allRule, { a: false }).truth, false);
  assert.equal(evaluateRule(anyRule, { a: false }).truth, "unknown");
  assert.equal(evaluateRule(anyRule, { a: true }).truth, true);
});

test("檢查間隔用 as-of 日期判斷", () => {
  const rule: RuleNode = { field: "last", operator: "date_on_or_before_years_ago", value: 3, label: "三年", evidence };
  assert.equal(evaluateRule(rule, { last: "2023-07-26" }, "2026-07-26").truth, true);
  assert.equal(evaluateRule(rule, { last: "2023-07-27" }, "2026-07-26").truth, false);
  assert.equal(evaluateRule(rule, {}, "2026-07-26").truth, "unknown");
});

test("過去年數內日期不接受逾期或未來日期", () => {
  const rule: RuleNode = { field: "event_date", operator: "date_within_past_years", value: 1, label: "一年內", evidence };
  assert.equal(evaluateRule(rule, { event_date: "2025-07-27" }, "2026-07-27").truth, true);
  assert.equal(evaluateRule(rule, { event_date: "2025-07-26" }, "2026-07-27").truth, false);
  assert.equal(evaluateRule(rule, { event_date: "2026-07-28" }, "2026-07-27").truth, false);
});

test("Competitive selection 不產生核准結果", () => {
  const program = programs.find((item) => item.slug === "youth-overseas-dream-fund");
  assert.ok(program);
  assert.equal(matchProgram(program, { birth_date: "2000-01-01", nationality: "taiwan" }, "2026-07-26").status, "review_required");
});

test("Annual application window 截止後為 closed", () => {
  const program = programs.find((item) => item.slug === "rent-subsidy-115");
  assert.ok(program);
  assert.equal(matchProgram(program, { is_renting: true, owns_home: false, household_income_eligible: true }, "2027-01-01").status, "closed");
});

test("桃園公職補習補助只判斷基本門檻並保留官方查核", () => {
  const program = taoyuanPrograms.find((item) => item.slug === "taoyuan-disabled-civil-exam-prep");
  assert.ok(program);
  const facts = {
    birth_date: "1990-01-01",
    household_city: "taoyuan",
    is_disabled: true,
    is_public_employee: false,
    civil_service_exam_prep: true,
  };
  assert.equal(matchProgram(program, facts, "2026-07-27").status, "review_required");
  assert.equal(matchProgram(program, { ...facts, is_public_employee: true }, "2026-07-27").status, "ineligible");
  assert.equal(matchProgram(program, { ...facts, civil_service_exam_prep: undefined }, "2026-07-27").status, "possible");
});

test("桃園原住民族法律費用補助正確處理四個月居住門檻", () => {
  const program = taoyuanPrograms.find((item) => item.slug === "taoyuan-indigenous-legal-fee-support");
  assert.ok(program);
  const facts = { is_indigenous: true, household_city: "taoyuan", residence_city: "taoyuan", taoyuan_residence_months: 4 };
  assert.equal(matchProgram(program, facts, "2026-07-27").status, "review_required");
  assert.equal(matchProgram(program, { ...facts, taoyuan_residence_months: 3 }, "2026-07-27").status, "ineligible");
});

test("桃園弱勢幼兒留園補助接受三種官方身分類別", () => {
  const program = taoyuanPrograms.find((item) => item.slug === "taoyuan-kindergarten-after-school-support");
  assert.ok(program);
  const facts = {
    child_age: 4,
    child_registered_in_taoyuan: true,
    child_attends_taoyuan_public_or_nonprofit_kindergarten: true,
    child_support_status: "mid_low_income",
  };
  assert.equal(matchProgram(program, facts, "2026-07-27").status, "review_required");
  assert.equal(matchProgram(program, { ...facts, child_support_status: "none" }, "2026-07-27").status, "ineligible");
});

test("新北兒童卡可由設籍年齡或新北小學學籍符合", () => {
  const program = programs.find((item) => item.slug === "new-taipei-child-card");
  assert.ok(program);
  assert.equal(matchProgram(program, {
    child_age: 8,
    child_registered_in_new_taipei: true,
    child_attends_new_taipei_elementary_school: false,
  }, "2026-07-27").status, "review_required");
  assert.equal(matchProgram(program, {
    child_age: 12,
    child_registered_in_new_taipei: false,
    child_attends_new_taipei_elementary_school: true,
  }, "2026-07-27").status, "review_required");
  assert.equal(matchProgram(program, {
    child_age: 12,
    child_registered_in_new_taipei: true,
    child_attends_new_taipei_elementary_school: false,
  }, "2026-07-27").status, "ineligible");
});

test("新北生育獎勵金以出生後一年為申請邊界", () => {
  const program = programs.find((item) => item.slug === "new-taipei-birth-grant");
  assert.ok(program);
  const facts = {
    household_city: "new_taipei",
    newborn_registered_in_new_taipei: true,
    new_taipei_parent_registration_eligible: true,
    newborn_birth_date: "2025-07-27",
  };
  assert.equal(matchProgram(program, facts, "2026-07-27").status, "review_required");
  assert.equal(matchProgram(program, { ...facts, newborn_birth_date: "2025-07-26" }, "2026-07-27").status, "ineligible");
});

test("新北好孕專車支援孕婦設籍與非本國籍配偶兩種路徑", () => {
  const program = programs.find((item) => item.slug === "new-taipei-pregnancy-taxi");
  assert.ok(program);
  const base = { is_pregnant: true, pregnancy_before_due_date: true };
  assert.equal(matchProgram(program, { ...base, household_city: "new_taipei" }, "2026-07-27").status, "review_required");
  assert.equal(matchProgram(program, { ...base, household_city: "taipei", nationality: "foreign_spouse", spouse_registered_in_new_taipei: true }, "2026-07-27").status, "review_required");
  assert.equal(matchProgram(program, { ...base, household_city: "taipei", nationality: "taiwan", spouse_registered_in_new_taipei: true }, "2026-07-27").status, "ineligible");
});

test("新北長者健檢正確處理一般與原住民年齡門檻", () => {
  const program = programs.find((item) => item.slug === "new-taipei-senior-health-check");
  assert.ok(program);
  const base = { household_city: "new_taipei" };
  assert.equal(matchProgram(program, { ...base, birth_date: "1961-07-27", is_indigenous: false }, "2026-07-27").status, "review_required");
  assert.equal(matchProgram(program, { ...base, birth_date: "1971-07-27", is_indigenous: true }, "2026-07-27").status, "review_required");
  assert.equal(matchProgram(program, { ...base, birth_date: "1971-07-27", is_indigenous: false }, "2026-07-27").status, "ineligible");
});

test("新北身障生活補助要求國內居住超過 183 日且無排除情形", () => {
  const program = programs.find((item) => item.slug === "new-taipei-disability-living-support");
  assert.ok(program);
  const facts = {
    household_city: "new_taipei",
    residence_city: "new_taipei",
    is_disabled: true,
    days_in_taiwan_last_year: 184,
    disability_living_financial_eligible: true,
    receives_full_time_public_care: false,
    is_incarcerated_or_in_service: false,
  };
  assert.equal(matchProgram(program, facts, "2026-07-27").status, "review_required");
  assert.equal(matchProgram(program, { ...facts, days_in_taiwan_last_year: 183 }, "2026-07-27").status, "ineligible");
  assert.equal(matchProgram(program, { ...facts, receives_full_time_public_care: true }, "2026-07-27").status, "ineligible");
});

test("115 年新北青年租補不允許重複住宅補貼", () => {
  const program = programs.find((item) => item.slug === "new-taipei-youth-rent-115");
  assert.ok(program);
  const facts = {
    birth_date: "1990-01-01",
    household_city: "new_taipei",
    works_in_new_taipei: false,
    studies_in_new_taipei: false,
    rents_in_new_taipei: true,
    new_taipei_youth_household_type: "single",
    no_home_in_northern_four_cities: true,
    new_taipei_youth_rent_income_eligible: true,
    receives_other_housing_subsidy: false,
    landlord_is_direct_relative: false,
    household_in_public_or_affordable_housing: false,
  };
  assert.equal(matchProgram(program, facts, "2026-07-27").status, "review_required");
  assert.equal(matchProgram(program, { ...facts, receives_other_housing_subsidy: true }, "2026-07-27").status, "ineligible");
  assert.equal(matchProgram(program, facts, "2027-01-01").status, "closed");
});

test("臺北低收入戶扶助要求設籍、實住、183 日與財稅門檻", () => {
  const program = programs.find((item) => item.slug === "taipei-low-income-living-support");
  assert.ok(program);
  const facts = {
    household_city: "taipei",
    residence_city: "taipei",
    days_in_taiwan_last_year: 184,
    taipei_low_income_financial_eligible: true,
  };
  assert.equal(matchProgram(program, facts, "2026-07-27").status, "review_required");
  assert.equal(matchProgram(program, { ...facts, days_in_taiwan_last_year: 183 }, "2026-07-27").status, "ineligible");
  assert.equal(matchProgram(program, { ...facts, residence_city: "new_taipei" }, "2026-07-27").status, "ineligible");
});

test("臺北低收入戶就學生活補助正確處理年齡、學籍與重複補助", () => {
  const program = programs.find((item) => item.slug === "taipei-low-income-study-living-support");
  assert.ok(program);
  const facts = {
    birth_date: "2002-07-27",
    household_city: "taipei",
    social_assistance_status: "low_income",
    taipei_eligible_student: true,
    receives_similar_education_subsidy: false,
  };
  assert.equal(matchProgram(program, facts, "2026-07-27").status, "review_required");
  assert.equal(matchProgram(program, { ...facts, birth_date: "2001-07-27" }, "2026-07-27").status, "ineligible");
  assert.equal(matchProgram(program, { ...facts, receives_similar_education_subsidy: true }, "2026-07-27").status, "ineligible");
});

test("臺北低收入戶學生交通補助對 18 至 24 歲要求學籍", () => {
  const program = programs.find((item) => item.slug === "taipei-low-income-student-transport-support");
  assert.ok(program);
  const base = { household_city: "taipei", social_assistance_status: "low_income", receives_similar_education_subsidy: false };
  assert.equal(matchProgram(program, { ...base, birth_date: "2010-01-01", taipei_eligible_student: false }, "2026-07-27").status, "eligible");
  assert.equal(matchProgram(program, { ...base, birth_date: "2002-01-01", taipei_eligible_student: true }, "2026-07-27").status, "eligible");
  assert.equal(matchProgram(program, { ...base, birth_date: "2002-01-01", taipei_eligible_student: false }, "2026-07-27").status, "ineligible");
});

test("臺北中低收入戶查定只判斷基本申請門檻", () => {
  const program = programs.find((item) => item.slug === "taipei-mid-low-income-status");
  assert.ok(program);
  const facts = { birth_date: "2000-01-01", household_city: "taipei", taipei_mid_low_income_financial_eligible: true };
  assert.equal(matchProgram(program, facts, "2026-07-27").status, "review_required");
  assert.equal(matchProgram(program, { ...facts, taipei_mid_low_income_financial_eligible: undefined }, "2026-07-27").status, "possible");
});

test("臺北身障生活補助要求無全日公費安置", () => {
  const program = programs.find((item) => item.slug === "taipei-disability-living-support");
  assert.ok(program);
  const facts = {
    household_city: "taipei",
    residence_city: "taipei",
    days_in_taiwan_last_year: 184,
    is_disabled: true,
    taipei_disability_financial_eligible: true,
    receives_full_time_public_care: false,
  };
  assert.equal(matchProgram(program, facts, "2026-07-27").status, "review_required");
  assert.equal(matchProgram(program, { ...facts, receives_full_time_public_care: true }, "2026-07-27").status, "ineligible");
});

test("臺北中低收入老人津貼要求 65 歲且無拘禁排除情形", () => {
  const program = programs.find((item) => item.slug === "taipei-senior-living-allowance");
  assert.ok(program);
  const facts = {
    birth_date: "1961-07-27",
    household_city: "taipei",
    residence_city: "taipei",
    days_in_taiwan_last_year: 184,
    taipei_senior_allowance_financial_eligible: true,
    receives_full_time_public_care: false,
    is_incarcerated_or_detained: false,
  };
  assert.equal(matchProgram(program, facts, "2026-07-27").status, "review_required");
  assert.equal(matchProgram(program, { ...facts, birth_date: "1961-07-28" }, "2026-07-27").status, "ineligible");
  assert.equal(matchProgram(program, { ...facts, is_incarcerated_or_detained: true }, "2026-07-27").status, "ineligible");
});

test("臺北營養補助需要目標身分與醫師評估", () => {
  const program = programs.find((item) => item.slug === "taipei-nutrition-support");
  assert.ok(program);
  const facts = {
    household_city: "taipei",
    social_assistance_status: "mid_low_income",
    taipei_nutrition_target: "infant_under_2",
    taipei_nutrition_medical_eligible: true,
  };
  assert.equal(matchProgram(program, facts, "2026-07-27").status, "review_required");
  assert.equal(matchProgram(program, { ...facts, taipei_nutrition_target: "none" }, "2026-07-27").status, "ineligible");
});

test("臺北生育補助限制 60 日且不得重複領取生育獎勵金", () => {
  const program = programs.find((item) => item.slug === "taipei-birth-support");
  assert.ok(program);
  const facts = {
    household_city: "taipei",
    social_assistance_status: "low_income",
    taipei_birth_event_type: "registered_birth",
    taipei_birth_event_within_60_days: true,
    receives_taipei_birth_reward: false,
  };
  assert.equal(matchProgram(program, facts, "2026-07-27").status, "review_required");
  assert.equal(matchProgram(program, { ...facts, taipei_birth_event_within_60_days: false }, "2026-07-27").status, "ineligible");
  assert.equal(matchProgram(program, { ...facts, receives_taipei_birth_reward: true }, "2026-07-27").status, "ineligible");
});

test("臺北市民醫療補助支援列冊身分與一般市民財稅兩條路徑", () => {
  const program = programs.find((item) => item.slug === "taipei-citizen-medical-support");
  assert.ok(program);
  const base = { household_city: "taipei", taipei_medical_expense_eligible: true };
  assert.equal(matchProgram(program, { ...base, social_assistance_status: "low_income", taipei_medical_financial_eligible: false }, "2026-07-27").status, "review_required");
  assert.equal(matchProgram(program, { ...base, social_assistance_status: "none", taipei_medical_financial_eligible: true }, "2026-07-27").status, "review_required");
  assert.equal(matchProgram(program, { ...base, social_assistance_status: "none", taipei_medical_financial_eligible: false }, "2026-07-27").status, "ineligible");
});

test("臺北急難救助支援市民與外縣市流落受災兩種路徑", () => {
  const program = programs.find((item) => item.slug === "taipei-emergency-assistance");
  assert.ok(program);
  assert.equal(matchProgram(program, {
    household_city: "taipei",
    taipei_emergency_reason_within_3_months: true,
    stranded_or_disaster_in_taipei: false,
  }, "2026-07-27").status, "review_required");
  assert.equal(matchProgram(program, {
    household_city: "taichung",
    taipei_emergency_reason_within_3_months: false,
    stranded_or_disaster_in_taipei: true,
  }, "2026-07-27").status, "review_required");
  assert.equal(matchProgram(program, {
    household_city: "taichung",
    taipei_emergency_reason_within_3_months: true,
    stranded_or_disaster_in_taipei: false,
  }, "2026-07-27").status, "ineligible");
});

test("臺中市急難救助與行旅返鄉車資只判斷可申請門檻", () => {
  const emergency = programs.find((item) => item.slug === "taichung-municipal-emergency-assistance");
  const traveler = programs.find((item) => item.slug === "taichung-traveler-return-fare");
  assert.ok(emergency && traveler);
  assert.equal(matchProgram(emergency, {
    household_city: "taichung",
    taichung_municipal_emergency_within_3_months: true,
  }, "2026-07-27").status, "review_required");
  assert.equal(matchProgram(emergency, {
    household_city: "taipei",
    taichung_municipal_emergency_within_3_months: true,
  }, "2026-07-27").status, "ineligible");
  assert.equal(matchProgram(traveler, {
    taichung_stranded_without_return_fare: true,
    frequent_return_fare_requests_or_identity_unknown: false,
  }, "2026-07-27").status, "review_required");
  assert.equal(matchProgram(traveler, {
    taichung_stranded_without_return_fare: true,
    frequent_return_fare_requests_or_identity_unknown: true,
  }, "2026-07-27").status, "ineligible");
});

test("臺中急難紓困與食物銀行要求實際居住及指定陷困途徑", () => {
  const relief = programs.find((item) => item.slug === "taichung-emergency-relief-program");
  const foodBank = programs.find((item) => item.slug === "taichung-food-bank-assistance");
  assert.ok(relief && foodBank);
  assert.equal(matchProgram(relief, {
    residence_city: "taichung",
    taichung_emergency_relief_reason: true,
  }, "2026-07-27").status, "review_required");
  assert.equal(matchProgram(foodBank, {
    residence_city: "taichung",
    taichung_food_bank_reason: "welfare_recipient_in_hardship",
  }, "2026-07-27").status, "review_required");
  assert.equal(matchProgram(foodBank, {
    residence_city: "taichung",
    taichung_food_bank_reason: "none",
  }, "2026-07-27").status, "ineligible");
});

test("臺中安遷與重傷救助共用災害地點及三個月門檻", () => {
  const relocation = programs.find((item) => item.slug === "taichung-disaster-relocation-assistance");
  const injury = programs.find((item) => item.slug === "taichung-disaster-severe-injury-assistance");
  assert.ok(relocation && injury);
  const disaster = { disaster_event_in_taichung_within_3_months: true };
  assert.equal(matchProgram(relocation, { ...disaster, taichung_disaster_relocation_eligible: true }, "2026-07-27").status, "review_required");
  assert.equal(matchProgram(injury, { ...disaster, taichung_disaster_severe_injury_eligible: true }, "2026-07-27").status, "review_required");
  assert.equal(matchProgram(injury, {
    disaster_event_in_taichung_within_3_months: false,
    taichung_disaster_severe_injury_eligible: true,
  }, "2026-07-27").status, "ineligible");
});

test("臺中死亡與失蹤救助各自保留事件證明條件", () => {
  const death = programs.find((item) => item.slug === "taichung-disaster-death-assistance");
  const missing = programs.find((item) => item.slug === "taichung-disaster-missing-assistance");
  assert.ok(death && missing);
  const disaster = { disaster_event_in_taichung_within_3_months: true };
  assert.equal(matchProgram(death, { ...disaster, taichung_disaster_death_eligible: true }, "2026-07-27").status, "review_required");
  assert.equal(matchProgram(missing, { ...disaster, taichung_disaster_missing_eligible: true }, "2026-07-27").status, "review_required");
  assert.equal(matchProgram(missing, { ...disaster, taichung_disaster_missing_eligible: false }, "2026-07-27").status, "ineligible");
});

test("臺中土石流與淹水住屋救助使用不同災損門檻", () => {
  const mudslide = programs.find((item) => item.slug === "taichung-mudslide-home-assistance");
  const flood = programs.find((item) => item.slug === "taichung-flood-home-assistance");
  assert.ok(mudslide && flood);
  const disaster = { disaster_event_in_taichung_within_3_months: true };
  assert.equal(matchProgram(mudslide, { ...disaster, taichung_mudslide_home_eligible: true }, "2026-07-27").status, "review_required");
  assert.equal(matchProgram(flood, { ...disaster, taichung_flood_home_eligible: true }, "2026-07-27").status, "review_required");
  assert.equal(matchProgram(flood, { ...disaster, taichung_flood_home_eligible: false }, "2026-07-27").status, "ineligible");
});
