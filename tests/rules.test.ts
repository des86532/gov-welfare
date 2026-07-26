import assert from "node:assert/strict";
import test from "node:test";
import { programs } from "../data/programs";
import { evaluateRule, matchProgram } from "../lib/rules";
import type { Evidence, RuleNode } from "../lib/domain";

const evidence: Evidence = { sourceId: "test", snapshotId: "snapshot", locator: "test", extractedValue: "test" };
const atom = (field: string, operator: "gte" | "eq", value: number | boolean): RuleNode => ({ field, operator, value, label: field, evidence });

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
