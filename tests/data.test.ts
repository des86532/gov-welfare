import assert from "node:assert/strict";
import test from "node:test";
import { programs } from "../data/programs";
import { factDefinitions, taiwanCityOptions } from "../data/facts";
import { sources } from "../data/sources";
import { taoyuanSourceClassifications } from "../data/taoyuan-source-items";
import { buildTaoyuanReviewedPrograms, taoyuanProgramCurations } from "../data/taoyuan-programs";
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

test("桃園 21 筆可發布 Source items 都有 Program curation", () => {
  const curatedTitles = taoyuanSourceClassifications
    .filter((item) => item.classification !== "excluded" && item.title !== "桃園市身心障礙者取得技術士證照獎勵")
    .map((item) => item.title)
    .sort();
  assert.deepEqual(taoyuanProgramCurations.map((item) => item.title).sort(), curatedTitles);
  const built = buildTaoyuanReviewedPrograms(taoyuanProgramCurations.map((item) => ({
    title: item.title,
    snapshot_id: "00000000-0000-4000-8000-000000000001",
    canonical_draft: {
      title: item.title,
      tags: ["測試"],
      summary: `${item.title}官方說明`,
      eligibilityText: "依主管機關審查",
      authority: "測試局",
      authorityUrl: "https://example.gov.tw/authority",
      applicationUrl: `https://example.gov.tw/apply/${item.slug}`,
      applicationMethod: "線上申請",
    },
  })), "2026-07-27");
  assert.equal(built.length, 21);
  assert.equal(built.filter((program) => program.coverage === "matchable").length, 4);
  assert.equal(built.filter((program) => program.coverage === "descriptive_only").length, 17);
  assert.ok(built.every((program) => program.evidence.length === 2));
  const facts = new Set(factDefinitions.map((definition) => definition.key));
  for (const program of built.filter((item) => item.coverage === "matchable")) {
    assert.ok(program.rule, program.title);
    for (const rule of atomicRules(program.rule)) {
      assert.ok(rule.evidence.sourceId && rule.evidence.snapshotId && rule.evidence.locator && rule.evidence.reviewedAt, `${program.title}: ${rule.field}`);
      assert.ok(rule.field === "age" || facts.has(rule.field), `${program.title}: missing FactDefinition ${rule.field}`);
    }
  }
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

test("戶籍與居住地可選擇臺灣 22 縣市", () => {
  assert.equal(taiwanCityOptions.length, 22);
  assert.equal(new Set(taiwanCityOptions.map((city) => city.value)).size, 22);
  assert.ok(taiwanCityOptions.some((city) => city.value === "taoyuan"));
  assert.ok(taiwanCityOptions.some((city) => city.value === "taipei"));
  assert.ok(taiwanCityOptions.some((city) => city.value === "new_taipei"));
  assert.ok(taiwanCityOptions.some((city) => city.value === "taichung"));
});
