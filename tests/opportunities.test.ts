import assert from "node:assert/strict";
import test from "node:test";
import { reviewedOpportunities } from "../data/opportunities";
import { sources } from "../data/sources";
import { getOpportunityStatus, opportunityMatchesAudience, opportunityMatchesRegion } from "../lib/opportunity-store";
import { parseActivityReport } from "../lib/activity-reports";

test("Reviewed Opportunity manifest 具有唯一穩定鍵與必要公開欄位", () => {
  assert.ok(reviewedOpportunities.length >= 6);
  assert.equal(new Set(reviewedOpportunities.map((item) => item.slug)).size, reviewedOpportunities.length);
  assert.equal(new Set(reviewedOpportunities.map((item) => `${item.sourceId}\n${item.externalId}`)).size, reviewedOpportunities.length);
  for (const item of reviewedOpportunities) {
    assert.ok(item.title && item.summary && item.organizer && item.locationSummary, item.slug);
    assert.ok(item.eligibilitySummary && item.feeSummary && item.applicationDateLabel && item.eventDateLabel, item.slug);
    assert.match(item.officialUrl, /^https:\/\//, item.slug);
    assert.match(item.verifiedAt, /^\d{4}-\d{2}-\d{2}$/, item.slug);
    assert.ok(item.evidence.length >= 3, item.slug);
  }
});

test("每個 Reviewed Opportunity 欄位 Evidence 都指向 Source registry", () => {
  const sourceIds = new Set(sources.map((source) => source.id));
  for (const item of reviewedOpportunities) {
    assert.ok(sourceIds.has(item.sourceId), item.slug);
    for (const evidence of item.evidence) {
      assert.equal(evidence.sourceId, item.sourceId, `${item.slug}: ${evidence.field}`);
      assert.match(evidence.sourceUrl, /^https:\/\//, `${item.slug}: ${evidence.field}`);
      assert.ok(evidence.locator && evidence.extractedValue, `${item.slug}: ${evidence.field}`);
    }
  }
});

test("活動狀態以報名期間與活動結束日動態判斷", () => {
  const trail = reviewedOpportunities.find((item) => item.slug === "miaoli-oil-well-trail-2026");
  const marine = reviewedOpportunities.find((item) => item.slug === "cga-marine-student-camp-115");
  const youthCamp = reviewedOpportunities.find((item) => item.slug === "spnp-youth-camp-18");
  assert.ok(trail && marine && youthCamp);
  assert.equal(getOpportunityStatus(trail, new Date("2026-07-30T12:00:00+08:00")), "open");
  assert.equal(getOpportunityStatus(trail, new Date("2026-08-25T12:00:00+08:00")), "closed");
  assert.equal(getOpportunityStatus(trail, new Date("2026-09-01T12:00:00+08:00")), "ended");
  assert.equal(getOpportunityStatus(marine, new Date("2026-07-30T12:00:00+08:00")), "ended");
  assert.equal(getOpportunityStatus(youthCamp, new Date("2026-07-30T12:00:00+08:00")), "unknown");
});

test("活動地點與適用對象 Filters 不混用中央 Jurisdiction", () => {
  const trail = reviewedOpportunities.find((item) => item.slug === "miaoli-oil-well-trail-2026");
  const youthCamp = reviewedOpportunities.find((item) => item.slug === "spnp-youth-camp-18");
  assert.ok(trail && youthCamp);
  assert.equal(opportunityMatchesRegion(trail, "苗栗縣"), true);
  assert.equal(opportunityMatchesRegion(trail, "桃園市"), false);
  assert.equal(opportunityMatchesRegion(youthCamp, "臺中市"), true);
  assert.equal(opportunityMatchesAudience(youthCamp, "高中職學生"), true);
  assert.equal(opportunityMatchesAudience(youthCamp, "女性青年"), false);
});

test("非政府主辦或政府支應待證明的活動不得冒充官方補助", () => {
  const trail = reviewedOpportunities.find((item) => item.slug === "miaoli-oil-well-trail-2026");
  const airCamp = reviewedOpportunities.find((item) => item.slug === "cadf-summer-air-camp-2026");
  assert.equal(trail?.organizerType, "nonprofit");
  assert.equal(trail?.governmentSupportStatus, "claimed_pending_evidence");
  assert.equal(airCamp?.organizerType, "foundation");
  assert.equal(airCamp?.governmentSupportStatus, "not_applicable");
});

test("匿名活動回報只接受已公開活動與允許的原因", () => {
  const slug = reviewedOpportunities[0].slug;
  assert.deepEqual(parseActivityReport({ opportunitySlug: slug, reason: "broken_link", detail: "官方頁顯示 404", website: "" }), {
    opportunitySlug: slug,
    reason: "broken_link",
    detail: "官方頁顯示 404",
  });
  assert.throws(() => parseActivityReport({ opportunitySlug: "unknown", reason: "expired" }), /找不到/);
  assert.throws(() => parseActivityReport({ opportunitySlug: slug, reason: "other", detail: "太短" }), /簡單說明/);
  assert.throws(() => parseActivityReport({ opportunitySlug: slug, reason: "expired", website: "spam" }), /未通過/);
});
