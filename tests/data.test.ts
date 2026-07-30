import assert from "node:assert/strict";
import test from "node:test";
import { programs } from "../data/programs";
import { factDefinitions, taiwanCityOptions } from "../data/facts";
import { newTaipeiSourceClassifications } from "../data/new-taipei-source-items";
import { sources } from "../data/sources";
import { taipeiSourceClassifications } from "../data/taipei-source-items";
import { taoyuanSourceClassifications } from "../data/taoyuan-source-items";
import { taichungSourceClassifications } from "../data/taichung-source-items";
import { buildTaoyuanReviewedPrograms, taoyuanProgramCurations } from "../data/taoyuan-programs";
import type { AtomicRule, RuleNode } from "../lib/domain";
import { appliesToRegion } from "../lib/program-filters";
import { isSourceDue } from "../lib/ingestion";

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

test("新北 151 筆 Source items 全部有 Review 去向", () => {
  assert.equal(newTaipeiSourceClassifications.length, 151);
  assert.equal(new Set(newTaipeiSourceClassifications.map((item) => item.title)).size, 151);
  assert.equal(newTaipeiSourceClassifications.filter((item) => item.classification === "matchable").length, 6);
  assert.equal(newTaipeiSourceClassifications.filter((item) => item.classification === "descriptive_only").length, 140);
  assert.equal(newTaipeiSourceClassifications.filter((item) => item.classification === "excluded").length, 5);
  for (const item of newTaipeiSourceClassifications) assert.ok(item.rationale, item.title);
});

test("臺北 10 筆 Source items 全部完成現行 Authority Review", () => {
  assert.equal(taipeiSourceClassifications.length, 10);
  assert.equal(new Set(taipeiSourceClassifications.map((item) => item.title)).size, 10);
  assert.equal(taipeiSourceClassifications.filter((item) => item.classification === "matchable").length, 10);
  for (const item of taipeiSourceClassifications) assert.ok(item.rationale, item.title);
});

test("臺中 10 筆 Source items 全部完成現行 Authority Review", () => {
  assert.equal(taichungSourceClassifications.length, 10);
  assert.equal(new Set(taichungSourceClassifications.map((item) => item.title)).size, 10);
  assert.equal(taichungSourceClassifications.filter((item) => item.classification === "matchable").length, 10);
  for (const item of taichungSourceClassifications) assert.ok(item.rationale, item.title);
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
  const facts = new Set(factDefinitions.map((definition) => definition.key));
  for (const program of programs.filter((item) => item.coverage === "matchable")) {
    assert.ok(program.rule, program.title);
    for (const rule of atomicRules(program.rule)) {
      assert.ok(rule.evidence.sourceId, `${program.title}: sourceId`);
      assert.ok(rule.evidence.snapshotId, `${program.title}: snapshotId`);
      assert.ok(rule.evidence.locator, `${program.title}: locator`);
      assert.ok(rule.evidence.reviewedAt, `${program.title}: reviewedAt`);
      assert.ok(rule.field === "age" || facts.has(rule.field), `${program.title}: missing FactDefinition ${rule.field}`);
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

test("新北、臺北與臺中地方 Dataset 已使用 Source-specific adapters", () => {
  const adapters = new Map(sources.map((source) => [source.id, source.adapterKey]));
  assert.equal(adapters.get("new-taipei-welfare-open-data"), "new_taipei_welfare_csv");
  assert.equal(adapters.get("taipei-social-aid-open-data"), "taipei_social_aid_csv");
  assert.equal(adapters.get("taichung-social-aid-open-data"), "taichung_social_aid_json");
});

test("限時活動 Sources 使用 Opportunity adapters 且不混入自動發布", () => {
  const byId = new Map(sources.map((source) => [source.id, source]));
  assert.equal(byId.get("yda-activity-listing")?.adapterKey, "activity_listing_html");
  assert.equal(byId.get("tmitrail-work-holiday-listing")?.adapterKey, "activity_listing_html");
  assert.equal(byId.get("mnd-nansha-study-camp-115")?.adapterKey, "opportunity_detail");
  assert.equal(byId.get("spnp-activity-calendar-json")?.adapterKey, "spnp_activity_json");
  for (const source of sources.filter((item) => item.adapterKey === "activity_listing_html" || item.adapterKey === "opportunity_detail" || item.adapterKey === "spnp_activity_json")) {
    assert.notEqual(source.automation, "structured_extract", source.id);
    assert.ok(source.note?.includes("Review") || source.note?.includes("不得"), source.id);
  }
});

test("戶籍與居住地可選擇臺灣 22 縣市", () => {
  assert.equal(taiwanCityOptions.length, 22);
  assert.equal(new Set(taiwanCityOptions.map((city) => city.value)).size, 22);
  assert.ok(taiwanCityOptions.some((city) => city.value === "taoyuan"));
  assert.ok(taiwanCityOptions.some((city) => city.value === "taipei"));
  assert.ok(taiwanCityOptions.some((city) => city.value === "new_taipei"));
  assert.ok(taiwanCityOptions.some((city) => city.value === "taichung"));
});

test("地區篩選保留中央方案並排除其他地方方案", () => {
  const central = programs.find((program) => program.jurisdiction === "中央");
  const taoyuan = programs.find((program) => program.jurisdiction === "桃園市");
  const newTaipei = programs.find((program) => program.jurisdiction === "新北市");
  assert.ok(central && taoyuan && newTaipei);
  assert.equal(appliesToRegion(central, "桃園市"), true);
  assert.equal(appliesToRegion(taoyuan, "桃園市"), true);
  assert.equal(appliesToRegion(newTaipei, "桃園市"), false);
});

test("Scheduled Source checks 遵守各 Source 的檢查頻率", () => {
  const source = { ...sources[0], checkEveryHours: 168 };
  const now = new Date("2026-07-30T00:00:00Z");
  assert.equal(isSourceDue(source, null, now), true);
  assert.equal(isSourceDue(source, "2026-07-29T00:00:00Z", now), false);
  assert.equal(isSourceDue(source, "2026-07-23T00:00:00Z", now), true);
  assert.equal(isSourceDue(source, "2026-07-30T00:00:00Z", now, true), true);
  assert.equal(isSourceDue({ ...source, checkEveryHours: null }, null, now), false);
});
