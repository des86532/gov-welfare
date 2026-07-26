import assert from "node:assert/strict";
import test from "node:test";
import { programs } from "../data/programs";
import { sources } from "../data/sources";
import { taoyuanSourceClassifications } from "../data/taoyuan-source-items";
import type { AtomicRule, RuleNode } from "../lib/domain";

function atomicRules(rule: RuleNode): AtomicRule[] {
  if ("all" in rule) return rule.all.flatMap(atomicRules);
  if ("any" in rule) return rule.any.flatMap(atomicRules);
  return [rule];
}

test("桃園 26 筆 Source items 全部有分類與理由", () => {
  assert.equal(taoyuanSourceClassifications.length, 26);
  assert.equal(new Set(taoyuanSourceClassifications.map((item) => item.title)).size, 26);
  for (const item of taoyuanSourceClassifications) assert.ok(item.classification && item.rationale);
});

test("100% Matchable atomic rules 有 Field-level evidence", () => {
  for (const program of programs.filter((item) => item.coverage === "matchable")) {
    assert.ok(program.rule, program.title);
    for (const rule of atomicRules(program.rule)) {
      assert.ok(rule.evidence.sourceId, `${program.title}: sourceId`);
      assert.ok(rule.evidence.snapshotId, `${program.title}: snapshotId`);
      assert.ok(rule.evidence.locator, `${program.title}: locator`);
      assert.ok(rule.evidence.reviewedAt, `${program.title}: reviewedAt`);
    }
  }
});

test("所有 Published Seed Programs 有必要欄位與官方入口", () => {
  for (const program of programs) {
    assert.ok(program.authority && program.jurisdiction && program.benefitType && program.decisionType);
    assert.match(program.applicationUrl ?? program.officialUrl, /^https:\/\//);
    assert.match(program.verifiedAt, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test("所有 Evidence 都能找到 Source registry", () => {
  const ids = new Set(sources.map((source) => source.id));
  for (const program of programs) for (const item of program.evidence) assert.ok(ids.has(item.sourceId), `${program.title}: ${item.sourceId}`);
});
