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
