import { programs } from "../data/programs";
import { newTaipeiSourceClassifications } from "../data/new-taipei-source-items";
import { taipeiSourceClassifications } from "../data/taipei-source-items";
import { taichungSourceClassifications } from "../data/taichung-source-items";
import { buildTaoyuanReviewedPrograms, type ReviewedTaoyuanItem } from "../data/taoyuan-programs";
import { taoyuanSourceClassifications } from "../data/taoyuan-source-items";
import { isDeepStrictEqual } from "node:util";
import type { Evidence, Program, RuleNode } from "../lib/domain";
import { supabaseConfig, supabaseRest, type SupabaseConfig } from "../lib/supabase-rest";

type SnapshotRow = { id: string; source_id: string };
type VersionRow = { version: number; canonical_content: Program };
type TaoyuanItemRow = ReviewedTaoyuanItem & {
  id: string;
  source_id: string;
  classification: "matchable" | "descriptive_only" | "excluded" | null;
  review_status: string;
};
type EvidenceRow = {
  field_path: string;
  source_id: string;
  snapshot_id: string;
  locator: string;
  extracted_value: string;
  reviewed_at: string | null;
};

const apply = process.argv.includes("--apply");
const publishInitial = process.argv.includes("--publish-initial");
const publishUpdates = process.argv.includes("--publish-reviewed-updates");
function requiredConfig(): SupabaseConfig {
  const value = supabaseConfig(true);
  if (!value) throw new Error("Seeding requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  return value;
}

const config = requiredConfig();

function withSnapshot(evidence: Evidence, snapshots: Map<string, string>): Evidence {
  const snapshotId = snapshots.get(evidence.sourceId);
  if (!snapshotId) throw new Error(`Missing successful snapshot for ${evidence.sourceId}`);
  return { ...evidence, snapshotId };
}

function mapRule(
  rule: RuleNode,
  snapshots: Map<string, string>,
  rows: EvidenceRow[],
  path = "/rule",
): RuleNode {
  if ("all" in rule) return { all: rule.all.map((child, index) => mapRule(child, snapshots, rows, `${path}/all/${index}`)) };
  if ("any" in rule) return { any: rule.any.map((child, index) => mapRule(child, snapshots, rows, `${path}/any/${index}`)) };
  const evidence = withSnapshot(rule.evidence, snapshots);
  rows.push({
    field_path: path,
    source_id: evidence.sourceId,
    snapshot_id: evidence.snapshotId,
    locator: evidence.locator,
    extracted_value: evidence.extractedValue,
    reviewed_at: evidence.reviewedAt ?? null,
  });
  return { ...rule, evidence };
}

function canonicalProgram(program: Program, snapshots: Map<string, string>) {
  const evidenceRows: EvidenceRow[] = [];
  const evidence = program.evidence.map((item, index) => {
    const mapped = withSnapshot(item, snapshots);
    evidenceRows.push({
      field_path: `/evidence/${index}`,
      source_id: mapped.sourceId,
      snapshot_id: mapped.snapshotId,
      locator: mapped.locator,
      extracted_value: mapped.extractedValue,
      reviewed_at: mapped.reviewedAt ?? null,
    });
    return mapped;
  });
  const canonical: Program = {
    ...program,
    evidence,
    ...(program.rule ? { rule: mapRule(program.rule, snapshots, evidenceRows) } : {}),
  };
  const unique = new Map(evidenceRows.map((row) => [
    `${row.field_path}:${row.source_id}:${row.locator}`,
    row,
  ]));
  return { canonical, evidenceRows: [...unique.values()] };
}

async function main() {
  const snapshotRows = await supabaseRest<SnapshotRow[]>(
    config,
    "source_snapshots?select=id,source_id&content_hash=not.is.null&order=observed_at.desc",
  );
  const snapshots = new Map<string, string>();
  for (const row of snapshotRows) if (!snapshots.has(row.source_id)) snapshots.set(row.source_id, row.id);

  const manifests = new Map([
    ["taoyuan-welfare-open-data", taoyuanSourceClassifications],
    ["new-taipei-welfare-open-data", newTaipeiSourceClassifications],
    ["taipei-social-aid-open-data", taipeiSourceClassifications],
    ["taichung-social-aid-open-data", taichungSourceClassifications],
  ]);
  const sourceItems: TaoyuanItemRow[] = [];
  for (const sourceId of manifests.keys()) {
    const snapshotId = snapshots.get(sourceId);
    if (!snapshotId) continue;
    sourceItems.push(...await supabaseRest<TaoyuanItemRow[]>(config,
      `source_items?select=id,source_id,title,snapshot_id,canonical_draft,classification,review_status&source_id=eq.${sourceId}&snapshot_id=eq.${snapshotId}`));
  }
  const reviewedTaoyuanItems = sourceItems.filter((item) =>
    item.source_id === "taoyuan-welfare-open-data" && item.review_status === "published" && item.classification !== "excluded");
  const reviewedPrograms = reviewedTaoyuanItems.length > 0
    ? buildTaoyuanReviewedPrograms(reviewedTaoyuanItems, "2026-07-27")
    : [];
  const allPrograms = [...programs, ...reviewedPrograms];
  const classificationUpdates = sourceItems.flatMap((item) => {
    const expected = manifests.get(item.source_id)?.find((entry) => entry.title === item.title);
    return expected && (expected.classification !== item.classification || item.review_status !== "published")
      ? [{ item, expected }]
      : [];
  });

  const ready = allPrograms.filter((program) => program.evidence.every((item) => snapshots.has(item.sourceId)));
  const skipped = allPrograms.filter((program) => !ready.includes(program));
  if (!apply) {
    console.log(JSON.stringify({ dryRun: true, ready: ready.map((item) => item.slug), classificationUpdates: classificationUpdates.map(({ item }) => item.title), skipped: skipped.map((item) => item.slug) }, null, 2));
    return;
  }

  for (const { item, expected } of classificationUpdates) {
    await supabaseRest(config, "rpc/classify_source_item", {
      method: "POST",
      body: JSON.stringify({
        target_item_id: item.id,
        target_classification: expected.classification,
        reviewer: "Repository classification manifest",
        rationale: expected.rationale,
      }),
      headers: { Prefer: "return=minimal" },
    });
  }

  let created = 0;
  let unchanged = 0;
  let drafted = 0;
  for (const program of ready) {
    const [{ id: programId }] = await supabaseRest<Array<{ id: string }>>(config, "programs?on_conflict=stable_key", {
      method: "POST",
      body: JSON.stringify({
        stable_key: program.id,
        slug: program.slug,
        authority: program.authority,
        jurisdiction: program.jurisdiction,
        primary_category: program.category,
      }),
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    });
    const previous = await supabaseRest<VersionRow[]>(
      config,
      `program_versions?select=version,canonical_content&program_id=eq.${programId}&order=version.desc&limit=1`,
    );
    const { canonical, evidenceRows } = canonicalProgram(program, snapshots);
    if (previous[0] && isDeepStrictEqual(previous[0].canonical_content, canonical)) {
      unchanged += 1;
      continue;
    }
    const isInitial = previous.length === 0;
    const status = isInitial && publishInitial ? "published" : "draft";
    const [version] = await supabaseRest<Array<{ id: string }>>(config, "program_versions", {
      method: "POST",
      body: JSON.stringify({
        program_id: programId,
        version: (previous[0]?.version ?? 0) + 1,
        status,
        coverage: program.coverage,
        title: program.title,
        summary: program.summary,
        benefit_type: program.benefitType,
        decision_type: program.decisionType,
        canonical_content: canonical,
        rule_tree: canonical.rule ?? null,
        effective_from: program.effectiveFrom ?? null,
        effective_to: program.effectiveTo ?? null,
        application_open: program.applicationWindow?.open ?? null,
        application_close: program.applicationWindow?.close ?? null,
        application_url: program.applicationUrl ?? program.officialUrl,
        last_verified_at: program.verifiedAt,
        published_at: status === "published" ? new Date().toISOString() : null,
      }),
      headers: { Prefer: "return=representation" },
    });
    await supabaseRest(config, "field_evidence", {
      method: "POST",
      body: JSON.stringify(evidenceRows.map((row) => ({ ...row, program_version_id: version.id }))),
      headers: { Prefer: "return=minimal" },
    });
    if (status === "published") {
      await supabaseRest(config, "reviews", {
        method: "POST",
        body: JSON.stringify({
          program_version_id: version.id,
          reviewer_name: "Initial curated Seed",
          action: "publish",
          rationale: "Imported from the reviewed 2026-07-26 Seed manifest with snapshot-linked Field evidence.",
        }),
        headers: { Prefer: "return=minimal" },
      });
      created += 1;
    } else if (publishUpdates) {
      await supabaseRest(config, "rpc/publish_program_version", {
        method: "POST",
        body: JSON.stringify({
          target_version_id: version.id,
          reviewer: "Reviewed Seed maintenance",
          rationale: "Published an explicitly reviewed Repository update with current snapshot-linked evidence.",
          review_action: "publish",
        }),
        headers: { Prefer: "return=minimal" },
      });
      created += 1;
    } else {
      drafted += 1;
    }
  }
  console.log(JSON.stringify({ dryRun: false, published: created, drafts: drafted, unchanged, classificationUpdates: classificationUpdates.length, skipped: skipped.map((item) => item.slug) }, null, 2));
}

void main();
