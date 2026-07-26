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
