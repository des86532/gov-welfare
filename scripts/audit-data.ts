import assert from "node:assert/strict";
import { programs } from "../data/programs";
import { reviewedOpportunities } from "../data/opportunities";
import { sources } from "../data/sources";
import { taipeiSourceClassifications } from "../data/taipei-source-items";
import { taichungSourceClassifications } from "../data/taichung-source-items";
import { buildTainanPassthroughPrograms, type TainanSourceItem } from "../data/tainan-programs";
import { buildTaoyuanReviewedPrograms, type ReviewedTaoyuanItem } from "../data/taoyuan-programs";
import { taoyuanSourceClassifications } from "../data/taoyuan-source-items";
import type { Program, RuleNode } from "../lib/domain";
import { supabaseConfig, supabaseRest, type SupabaseConfig } from "../lib/supabase-rest";

type Snapshot = { id: string; source_id: string; observed_at: string };
type Version = {
  status: string;
  coverage: string;
  canonical_content: Program;
  field_evidence: Array<{ field_path: string; source_id: string; snapshot_id: string; reviewed_at: string | null }>;
};

function requiredConfig(): SupabaseConfig {
  const config = supabaseConfig(true);
  if (!config) throw new Error("Audit requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  return config;
}

function atomicPaths(rule: RuleNode, path = "/rule"): string[] {
  if ("all" in rule) return rule.all.flatMap((child, index) => atomicPaths(child, `${path}/all/${index}`));
  if ("any" in rule) return rule.any.flatMap((child, index) => atomicPaths(child, `${path}/any/${index}`));
  return [path];
}

async function main() {
  const config = requiredConfig();
  const [databaseSources, snapshots, versions, drafts] = await Promise.all([
    supabaseRest<Array<{ id: string; automation_level: string; status: string; last_check_error: unknown }>>(config, "sources?select=id,automation_level,status,last_check_error"),
    supabaseRest<Snapshot[]>(config, "source_snapshots?select=id,source_id,observed_at&content_hash=not.is.null&order=observed_at.desc"),
    supabaseRest<Version[]>(config, "program_versions?select=status,coverage,canonical_content,field_evidence(field_path,source_id,snapshot_id,reviewed_at)&status=eq.published"),
    supabaseRest<Array<{ id: string }>>(config, "program_versions?select=id&status=eq.draft"),
  ]);

  const latest = new Map<string, Snapshot>();
  for (const snapshot of snapshots) if (!latest.has(snapshot.source_id)) latest.set(snapshot.source_id, snapshot);
  const automationBySource = new Map(databaseSources.map((source) => [source.id, source.automation_level]));
  const taoyuanSnapshotId = latest.get("taoyuan-welfare-open-data")?.id;
  const newTaipeiSnapshotId = latest.get("new-taipei-welfare-open-data")?.id;
  const taipeiSnapshotId = latest.get("taipei-social-aid-open-data")?.id;
  const taichungSnapshotId = latest.get("taichung-social-aid-open-data")?.id;
  const tainanSnapshot = latest.get("tainan-social-welfare-open-data");
  const tainanSnapshotId = tainanSnapshot?.id;
  assert.ok(taoyuanSnapshotId && newTaipeiSnapshotId && taipeiSnapshotId && taichungSnapshotId && tainanSnapshotId, "Missing latest structured Source snapshot");
  const [latestTaoyuanItems, latestNewTaipeiItems, latestTaipeiItems, latestTaichungItems, latestTainanItems] = await Promise.all([
    supabaseRest<Array<ReviewedTaoyuanItem & { classification: string | null; review_status: string }>>(config, `source_items?select=title,snapshot_id,canonical_draft,classification,review_status&snapshot_id=eq.${taoyuanSnapshotId}`),
    supabaseRest<Array<{ title: string; snapshot_id: string; classification: string | null; review_status: string }>>(config, `source_items?select=title,snapshot_id,classification,review_status&snapshot_id=eq.${newTaipeiSnapshotId}`),
    supabaseRest<Array<{ title: string; snapshot_id: string; classification: string | null; review_status: string }>>(config, `source_items?select=title,snapshot_id,classification,review_status&snapshot_id=eq.${taipeiSnapshotId}`),
    supabaseRest<Array<{ title: string; snapshot_id: string; classification: string | null; review_status: string }>>(config, `source_items?select=title,snapshot_id,classification,review_status&snapshot_id=eq.${taichungSnapshotId}`),
    supabaseRest<TainanSourceItem[]>(config, `source_items?select=external_id,title,snapshot_id,canonical_draft,classification,review_status&snapshot_id=eq.${tainanSnapshotId}`),
  ]);
  const reviewedTaoyuanItems = latestTaoyuanItems.filter((item) => item.classification !== "excluded" && item.review_status === "published");
  const tainanPrograms = buildTainanPassthroughPrograms(latestTainanItems, tainanSnapshot.observed_at.slice(0, 10));
  const expectedPrograms = [...programs, ...buildTaoyuanReviewedPrograms(reviewedTaoyuanItems, "2026-07-27"), ...tainanPrograms];
  const expected = expectedPrograms.filter((program) => program.evidence.every((item) => latest.has(item.sourceId)));
  const visibleVersions = versions.filter((version) => version.coverage !== "archived");

  assert.deepEqual(new Set(databaseSources.map((source) => source.id)), new Set(sources.map((source) => source.id)), "Source registry drift");
  assert.equal(databaseSources.filter((source) => source.status === "active" && source.last_check_error).length, 0, "Active Source check errors");
  assert.equal(latestTaoyuanItems.length, 26, "Taoyuan item count");
  assert.equal(latestTaoyuanItems.filter((item) => item.classification === null).length, 0, "Unclassified Taoyuan items");
  assert.deepEqual(
    new Map(latestTaoyuanItems.map((item) => [item.title, item.classification])),
    new Map(taoyuanSourceClassifications.map((item) => [item.title, item.classification])),
    "Taoyuan classification drift",
  );
  assert.ok(latestNewTaipeiItems.length > 0, "Missing New Taipei items");
  assert.equal(latestNewTaipeiItems.filter((item) => item.classification === null).length, 0, "Unclassified New Taipei items");
  assert.ok(latestNewTaipeiItems.every((item) => item.review_status === "published"), "Unreviewed New Taipei items");
  assert.equal(latestTaipeiItems.length, 10, "Taipei item count");
  assert.equal(latestTaipeiItems.filter((item) => item.classification === null).length, 0, "Unclassified Taipei items");
  assert.ok(latestTaipeiItems.every((item) => item.review_status === "published"), "Unreviewed Taipei items");
  assert.deepEqual(
    new Map(latestTaipeiItems.map((item) => [item.title, item.classification])),
    new Map(taipeiSourceClassifications.map((item) => [item.title, item.classification])),
    "Taipei classification drift",
  );
  assert.equal(latestTaichungItems.length, 10, "Taichung item count");
  assert.equal(latestTaichungItems.filter((item) => item.classification === null).length, 0, "Unclassified Taichung items");
  assert.ok(latestTaichungItems.every((item) => item.review_status === "published"), "Unreviewed Taichung items");
  assert.deepEqual(
    new Map(latestTaichungItems.map((item) => [item.title, item.classification])),
    new Map(taichungSourceClassifications.map((item) => [item.title, item.classification])),
    "Taichung classification drift",
  );
  assert.ok(latestTainanItems.length > 0, "Missing Tainan items");
  assert.ok(latestTainanItems.every((item) => item.classification === "descriptive_only"), "Tainan items must remain descriptive passthrough");
  assert.ok(latestTainanItems.every((item) => item.review_status === "published"), "Unpublished Tainan passthrough items");
  assert.equal(tainanPrograms.length, latestTainanItems.length, "Tainan passthrough Program count");
  assert.ok(tainanPrograms.every((program) => program.sourceMode === "government_api_passthrough" && !program.rule), "Tainan passthrough generated Eligibility Rules");
  assert.equal(visibleVersions.length, expected.length, "Published visible Program count");
  assert.equal(drafts.length, 0, "Unreviewed Program drafts");

  for (const version of visibleVersions) {
    const program = version.canonical_content;
    assert.ok(program.authority && program.jurisdiction && program.benefitType && program.decisionType, `${program.title}: required fields`);
    assert.match(program.applicationUrl ?? program.officialUrl, /^https:\/\//, `${program.title}: official application URL`);
    for (const item of version.field_evidence) {
      const newest = latest.get(item.source_id);
      assert.ok(automationBySource.get(item.source_id) === "structured_extract" || (newest && newest.id === item.snapshot_id), `${program.title}: stale ${item.source_id}`);
      assert.ok(item.reviewed_at, `${program.title}: unreviewed evidence ${item.field_path}`);
    }
    if (version.coverage === "matchable") {
      assert.ok(program.rule, `${program.title}: missing Rule tree`);
      const evidencePaths = new Set(version.field_evidence.map((item) => item.field_path));
      for (const path of atomicPaths(program.rule)) assert.ok(evidencePaths.has(path), `${program.title}: missing evidence at ${path}`);
    }
  }

  console.log(JSON.stringify({
    sources: databaseSources.length,
    activeSources: databaseSources.filter((source) => source.status === "active").length,
    snapshots: snapshots.length,
    taoyuanItems: latestTaoyuanItems.length,
    newTaipeiItems: latestNewTaipeiItems.length,
    taipeiItems: latestTaipeiItems.length,
    taichungItems: latestTaichungItems.length,
    tainanItems: latestTainanItems.length,
    platformActivities: reviewedOpportunities.length,
    publishedPrograms: visibleVersions.length,
    archivedPrograms: versions.filter((version) => version.coverage === "archived").length,
    matchablePrograms: visibleVersions.filter((version) => version.coverage === "matchable").length,
    draftVersions: drafts.length,
    staleEvidence: 0,
  }, null, 2));
}

void main();
