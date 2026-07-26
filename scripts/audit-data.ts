import assert from "node:assert/strict";
import { programs } from "../data/programs";
import { sources } from "../data/sources";
import { buildTaoyuanReviewedPrograms, type ReviewedTaoyuanItem } from "../data/taoyuan-programs";
import { taoyuanSourceClassifications } from "../data/taoyuan-source-items";
import type { Program, RuleNode } from "../lib/domain";
import { supabaseConfig, supabaseRest, type SupabaseConfig } from "../lib/supabase-rest";

type Snapshot = { id: string; source_id: string };
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
  const [databaseSources, snapshots, taoyuanItems, versions, drafts] = await Promise.all([
    supabaseRest<Array<{ id: string; status: string; last_check_error: unknown }>>(config, "sources?select=id,status,last_check_error"),
    supabaseRest<Snapshot[]>(config, "source_snapshots?select=id,source_id&content_hash=not.is.null&order=observed_at.desc"),
    supabaseRest<Array<ReviewedTaoyuanItem & { classification: string | null; review_status: string }>>(config, "source_items?select=title,snapshot_id,canonical_draft,classification,review_status&source_id=eq.taoyuan-welfare-open-data"),
    supabaseRest<Version[]>(config, "program_versions?select=status,coverage,canonical_content,field_evidence(field_path,source_id,snapshot_id,reviewed_at)&status=eq.published"),
    supabaseRest<Array<{ id: string }>>(config, "program_versions?select=id&status=eq.draft"),
  ]);

  const latest = new Map<string, Snapshot>();
  for (const snapshot of snapshots) if (!latest.has(snapshot.source_id)) latest.set(snapshot.source_id, snapshot);
  const taoyuanSnapshotId = latest.get("taoyuan-welfare-open-data")?.id;
  const latestTaoyuanItems = taoyuanItems.filter((item) => item.snapshot_id === taoyuanSnapshotId);
  const reviewedTaoyuanItems = latestTaoyuanItems.filter((item) => item.classification !== "excluded" && item.review_status === "published");
  const expectedPrograms = [...programs, ...buildTaoyuanReviewedPrograms(reviewedTaoyuanItems, "2026-07-27")];
  const expected = expectedPrograms.filter((program) => program.evidence.every((item) => latest.has(item.sourceId)));

  assert.deepEqual(new Set(databaseSources.map((source) => source.id)), new Set(sources.map((source) => source.id)), "Source registry drift");
  assert.equal(databaseSources.filter((source) => source.status === "active" && source.last_check_error).length, 0, "Active Source check errors");
  assert.equal(latestTaoyuanItems.length, 26, "Taoyuan item count");
  assert.equal(latestTaoyuanItems.filter((item) => item.classification === null).length, 0, "Unclassified Taoyuan items");
  assert.deepEqual(
    new Map(latestTaoyuanItems.map((item) => [item.title, item.classification])),
    new Map(taoyuanSourceClassifications.map((item) => [item.title, item.classification])),
    "Taoyuan classification drift",
  );
  assert.equal(versions.length, expected.length, "Published Program count");
  assert.equal(drafts.length, 0, "Unreviewed Program drafts");

  for (const version of versions) {
    const program = version.canonical_content;
    assert.ok(program.authority && program.jurisdiction && program.benefitType && program.decisionType, `${program.title}: required fields`);
    assert.match(program.applicationUrl ?? program.officialUrl, /^https:\/\//, `${program.title}: official application URL`);
    for (const item of version.field_evidence) {
      const newest = latest.get(item.source_id);
      assert.ok(newest && newest.id === item.snapshot_id, `${program.title}: stale ${item.source_id}`);
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
    publishedPrograms: versions.length,
    matchablePrograms: versions.filter((version) => version.coverage === "matchable").length,
    draftVersions: drafts.length,
    staleEvidence: 0,
  }, null, 2));
}

void main();
