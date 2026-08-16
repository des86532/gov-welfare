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
import { buildTainanPassthroughPrograms } from "../data/tainan-programs";
import { mapWithConcurrency } from "../lib/concurrency";
import type { AtomicRule, RuleNode } from "../lib/domain";
import { parseFinderSession } from "../lib/finder-session";
import { appliesToApplicant, appliesToRegion, filterProgramsForProfileRegion, getProgramApplicantTypes, getProgramAvailability, paginatePrograms, PROGRAMS_PER_PAGE, sortProgramsForCatalog } from "../lib/program-filters";
import { isSourceDue, shouldPersistSourceItems } from "../lib/ingestion";

function atomicRules(rule: RuleNode): AtomicRule[] {
  if ("all" in rule) return rule.all.flatMap(atomicRules);
  if ("any" in rule) return rule.any.flatMap(atomicRules);
  return [rule];
}

test("bounded concurrency 保留輸出順序且不超過上限", async () => {
  let active = 0;
  let maximumActive = 0;
  const values = await mapWithConcurrency([40, 5, 20, 1, 10, 2], 3, async (delay, index) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, delay));
    active -= 1;
    return `item-${index}`;
  });

  assert.deepEqual(values, ["item-0", "item-1", "item-2", "item-3", "item-4", "item-5"]);
  assert.equal(maximumActive, 3);
});

test("資格初篩只恢復同分頁內的有效 Session state", () => {
  assert.deepEqual(parseFinderSession('{"step":3,"facts":{"age":25,"employed":true},"showAllFollowups":true}'), {
    step: 3,
    facts: { age: 25, employed: true },
    showAllFollowups: true,
  });
  assert.equal(parseFinderSession('{"step":9,"facts":{}}'), null);
  assert.equal(parseFinderSession("not-json"), null);
});

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

test("臺南 structured API 原文自動建立 descriptive Programs", () => {
  const built = buildTainanPassthroughPrograms([
    {
      external_id: "17",
      title: "醫療補助",
      snapshot_id: "00000000-0000-4000-8000-000000000017",
      classification: "descriptive_only",
      review_status: "published",
      canonical_draft: {
        identityText: "低收入戶",
        householdCondition: "臺南市",
        otherEligibilityText: "醫療費用造成家庭生活困難",
        documentsText: "1. 申請表\n2. 醫療收據",
        authority: "戶籍地區公所",
        contactText: "06-2991111",
      },
    },
    {
      external_id: "18",
      title: "醫療補助",
      snapshot_id: "00000000-0000-4000-8000-000000000017",
      classification: "descriptive_only",
      review_status: "published",
      canonical_draft: { identityText: "中低收入戶" },
    },
  ], "2026-08-13");
  assert.equal(built.length, 2);
  assert.equal(built[0].title, "醫療補助（低收入戶）");
  assert.equal(built[1].title, "醫療補助（中低收入戶）");
  assert.ok(built.every((program) => program.jurisdiction === "臺南市"));
  assert.ok(built.every((program) => program.coverage === "descriptive_only" && !program.rule));
  assert.ok(built.every((program) => program.sourceMode === "government_api_passthrough"));
  assert.ok(built.every((program) => program.officialUrl === "https://data.gov.tw/dataset/79613"));
  assert.equal(built[0].documents.length, 2);
});

test("100% Matchable atomic rules 有 Field-level evidence", () => {
  const facts = new Map(factDefinitions.map((definition) => [definition.key, definition]));
  for (const program of programs.filter((item) => item.coverage === "matchable")) {
    assert.ok(program.rule, program.title);
    for (const requestedFact of program.requestedFacts) {
      assert.ok(facts.has(requestedFact), `${program.title}: unknown requestedFact ${requestedFact}`);
    }
    for (const rule of atomicRules(program.rule)) {
      assert.ok(rule.evidence.sourceId, `${program.title}: sourceId`);
      assert.ok(rule.evidence.snapshotId, `${program.title}: snapshotId`);
      assert.ok(rule.evidence.locator, `${program.title}: locator`);
      assert.ok(rule.evidence.reviewedAt, `${program.title}: reviewedAt`);
      assert.ok(rule.field === "age" || facts.has(rule.field), `${program.title}: missing FactDefinition ${rule.field}`);
      assert.ok(program.requestedFacts.includes(rule.field === "age" ? "birth_date" : rule.field), `${program.title}: Rule field not requested ${rule.field}`);
      const definition = facts.get(rule.field);
      if (definition?.type === "enum" && ["eq", "neq", "in"].includes(rule.operator)) {
        const allowed = new Set(definition.options?.map((option) => option.value));
        const expected = Array.isArray(rule.value) ? rule.value : [rule.value];
        for (const value of expected) assert.ok(typeof value === "string" && allowed.has(value), `${program.title}: invalid ${rule.field} value ${value}`);
      }
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

test("企業升級方案只作 descriptive catalog 並標示企業申請對象", () => {
  const enterprise = programs.filter((program) => program.category === "business_upgrade");
  assert.equal(enterprise.length, 8);
  assert.ok(enterprise.every((program) => program.coverage === "descriptive_only"));
  assert.ok(enterprise.every((program) => program.applicantTypes?.length === 1 && program.applicantTypes[0] === "business"));
  assert.ok(enterprise.every((program) => program.rule === undefined));
  assert.ok(enterprise.every((program) => program.evidence.every((item) => item.reviewedAt === "2026-08-07")));
});

test("申請對象篩選區分一般民眾、準備創業與已設立企業", () => {
  const health = programs.find((program) => program.slug === "adult-preventive-care");
  const startup = programs.find((program) => program.category === "startup");
  const business = programs.find((program) => program.category === "business_upgrade");
  assert.ok(health && startup && business);
  assert.deepEqual(getProgramApplicantTypes(health), ["individual"]);
  assert.deepEqual(getProgramApplicantTypes(startup), ["individual", "startup"]);
  assert.deepEqual(getProgramApplicantTypes(business), ["business"]);
  assert.equal(appliesToApplicant(health, "business"), false);
  assert.equal(appliesToApplicant(startup, "startup"), true);
  assert.equal(appliesToApplicant(business, "business"), true);
});

test("限時企業方案依官方申請期間顯示申請狀態", () => {
  const cloud = programs.find((program) => program.slug === "industrial-cloud-solution-points-115");
  const energy = programs.find((program) => program.slug === "commercial-service-system-energy-saving-115");
  const succession = programs.find((program) => program.slug === "business-succession-ai-digital-transformation-115");
  assert.ok(cloud && energy && succession);
  assert.equal(getProgramAvailability(cloud, "2026-08-07"), "open");
  assert.equal(getProgramAvailability(energy, "2026-08-07"), "open");
  assert.equal(getProgramAvailability(succession, "2026-08-07"), "closed");
});

test("企業補助 Authority Sources 每日監測且不自動產生 Rules", () => {
  const enterpriseSourceIds = new Set(programs
    .filter((program) => program.category === "business_upgrade")
    .flatMap((program) => program.evidence.map((item) => item.sourceId)));
  for (const source of sources.filter((item) => enterpriseSourceIds.has(item.id))) {
    assert.equal(source.adapterKey, "official_page", source.id);
    assert.equal(source.automation, "change_detection_only", source.id);
    assert.equal(source.checkEveryHours, 24, source.id);
    assert.equal(source.status, "active", source.id);
  }
  assert.equal(enterpriseSourceIds.size, 8);
});

test("新北、臺北、臺中與臺南地方 Dataset 已使用 Source-specific adapters", () => {
  const adapters = new Map(sources.map((source) => [source.id, source.adapterKey]));
  assert.equal(adapters.get("new-taipei-welfare-open-data"), "new_taipei_welfare_csv");
  assert.equal(adapters.get("taipei-social-aid-open-data"), "taipei_social_aid_csv");
  assert.equal(adapters.get("taichung-social-aid-open-data"), "taichung_social_aid_json");
  assert.equal(adapters.get("tainan-social-welfare-open-data"), "tainan_social_welfare_json");
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

test("資格初篩依戶籍與居住地保留中央及相關地方方案", () => {
  const scoped = filterProgramsForProfileRegion(programs, {
    household_city: "taoyuan",
    residence_city: "taoyuan",
  });
  assert.ok(scoped.some((program) => program.jurisdiction === "中央"));
  assert.ok(scoped.some((program) => program.jurisdiction === "桃園市"));
  assert.equal(scoped.some((program) => program.jurisdiction === "新北市"), false);
  assert.equal(scoped.some((program) => program.jurisdiction === "臺中市"), false);
  assert.equal(scoped.some((program) => program.slug === "new-taipei-youth-rent-115"), false);
  assert.equal(scoped.some((program) => program.slug === "taichung-disaster-relocation-assistance"), false);
});

test("戶籍與居住地不同時保留兩地方案", () => {
  const scoped = filterProgramsForProfileRegion(programs, {
    household_city: "taoyuan",
    residence_city: "new_taipei",
  });
  assert.ok(scoped.some((program) => program.jurisdiction === "中央"));
  assert.ok(scoped.some((program) => program.jurisdiction === "桃園市"));
  assert.ok(scoped.some((program) => program.jurisdiction === "新北市"));
  assert.equal(scoped.some((program) => program.jurisdiction === "臺中市"), false);
});

test("方案分頁限制每頁筆數並修正超出範圍的頁碼", () => {
  const items = Array.from({ length: PROGRAMS_PER_PAGE * 2 + 1 }, (_, index) => index + 1);
  assert.deepEqual(paginatePrograms(items, 2), {
    items: items.slice(PROGRAMS_PER_PAGE, PROGRAMS_PER_PAGE * 2),
    page: 2,
    pageCount: 3,
    from: 13,
    to: 24,
  });
  assert.equal(paginatePrograms(items, 99).page, 3);
  assert.equal(paginatePrograms(items, Number.NaN).page, 1);
  assert.deepEqual(paginatePrograms([], 1), { items: [], page: 1, pageCount: 1, from: 0, to: 0 });
});

test("方案清單先按 Primary category 再按繁中標題穩定排序", () => {
  const sample = [
    programs.find((program) => program.slug === "cervical-cancer-screening"),
    programs.find((program) => program.slug === "adult-preventive-care"),
    programs.find((program) => program.slug === "industrial-talent-investment"),
  ].filter((program): program is (typeof programs)[number] => Boolean(program));
  assert.deepEqual(sortProgramsForCatalog(sample).map((program) => program.slug), [
    "cervical-cancer-screening",
    "adult-preventive-care",
    "industrial-talent-investment",
  ]);
});

test("申請狀態不把未提供期限的方案誤判為申請中", () => {
  const open = programs.find((program) => program.slug === "moe-public-study-exam-115");
  const unspecified = programs.find((program) => program.slug === "adult-preventive-care");
  assert.ok(open && unspecified);
  assert.equal(getProgramAvailability(open, "2026-07-30"), "open");
  assert.equal(getProgramAvailability(open, "2026-08-01"), "closed");
  assert.equal(getProgramAvailability(unspecified, "2026-07-30"), "unspecified");
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

test("未經 Repository curation 的 HTML 不寫入 source_items", () => {
  const candidate = sources.find((source) => source.id === "moe-humanities-overseas-talent");
  const reviewedDocument = sources.find((source) => source.id === "moe-scholarship-115-guide");
  const structured = sources.find((source) => source.id === "tainan-social-welfare-open-data");
  assert.ok(candidate && reviewedDocument && structured);
  assert.equal(shouldPersistSourceItems(candidate), false);
  assert.equal(shouldPersistSourceItems(reviewedDocument), true);
  assert.equal(shouldPersistSourceItems(structured), true);
});
