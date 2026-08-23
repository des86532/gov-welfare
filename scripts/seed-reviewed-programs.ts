import { programs } from "../data/programs";
import { reviewedOpportunities } from "../data/opportunities";
import { newTaipeiSourceClassifications } from "../data/new-taipei-source-items";
import { taipeiSourceClassifications } from "../data/taipei-source-items";
import { taichungSourceClassifications } from "../data/taichung-source-items";
import { buildTaoyuanReviewedPrograms, type ReviewedTaoyuanItem } from "../data/taoyuan-programs";
import { taoyuanSourceClassifications } from "../data/taoyuan-source-items";
import { buildTainanPassthroughPrograms, type TainanSourceItem } from "../data/tainan-programs";
import { isDeepStrictEqual } from "node:util";
import type { Evidence, Program, RuleNode } from "../lib/domain";
import { canReconcileSourceRemovals } from "../lib/ingestion";
import { supabaseConfig, supabaseRest, type SupabaseConfig } from "../lib/supabase-rest";

type SnapshotRow = { id: string; source_id: string; observed_at: string };
type VersionRow = { version: number; canonical_content: Program };
type VersionWithStatusRow = VersionRow & { status: string };
type VersionStatusRow = { id: string; program_id: string; version: number };
type TaoyuanItemRow = ReviewedTaoyuanItem & {
  id: string;
  source_id: string;
  external_id: string;
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
const publishUpdates = process.argv.includes("--publish-updates");
const publishStructuredPassthrough = process.argv.includes("--publish-structured-passthrough");
function requiredConfig(): SupabaseConfig {
  const value = supabaseConfig(true);
  if (!value) throw new Error("Seeding requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  return value;
}

const config = requiredConfig();

function withSnapshot(evidence: Evidence, snapshots: Map<string, string>, observedOnBySource: Map<string, string>): Evidence {
  const snapshotId = snapshots.get(evidence.sourceId);
  if (!snapshotId) throw new Error(`Missing successful snapshot for ${evidence.sourceId}`);
  return { ...evidence, snapshotId, reviewedAt: observedOnBySource.get(evidence.sourceId) ?? evidence.reviewedAt };
}

function mapRule(
  rule: RuleNode,
  snapshots: Map<string, string>,
  observedOnBySource: Map<string, string>,
  rows: EvidenceRow[],
  path = "/rule",
): RuleNode {
  if ("all" in rule) return { all: rule.all.map((child, index) => mapRule(child, snapshots, observedOnBySource, rows, `${path}/all/${index}`)) };
  if ("any" in rule) return { any: rule.any.map((child, index) => mapRule(child, snapshots, observedOnBySource, rows, `${path}/any/${index}`)) };
  const evidence = withSnapshot(rule.evidence, snapshots, observedOnBySource);
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

function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string").join("\n");
  return "";
}

function compact(value: string, limit = 1_200): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}…` : normalized;
}

function sourceExcerpt(program: Program, items: TaoyuanItemRow[]): { sourceId: string; value: string } | undefined {
  const normalizedTitle = program.title.replace(/\s+/g, "").toLocaleLowerCase("zh-Hant");
  const sourceIds = new Set(program.evidence.map((item) => item.sourceId));
  const candidates = items.filter((item) => sourceIds.has(item.source_id) && item.classification !== "excluded");
  const item = candidates.find((candidate) => candidate.title.replace(/\s+/g, "").toLocaleLowerCase("zh-Hant") === normalizedTitle)
    ?? (candidates.length === 1 ? candidates[0] : undefined);
  if (!item) return undefined;
  const draft = item.canonical_draft as Record<string, unknown>;
  const value = compact([
    text(draft.eligibilityText),
    text(draft.summary),
    text(draft.description),
    text(draft.bodyText),
    text(draft.paragraphs),
  ].find((candidate) => candidate.trim()) ?? "");
  return value ? { sourceId: item.source_id, value } : undefined;
}

function canonicalProgram(
  program: Program,
  snapshots: Map<string, string>,
  observedOnBySource: Map<string, string>,
  sourceItems: TaoyuanItemRow[],
) {
  const evidenceRows: EvidenceRow[] = [];
  const excerpt = sourceExcerpt(program, sourceItems);
  const evidence = program.evidence.map((item, index) => {
    const mapped = withSnapshot(item, snapshots, observedOnBySource);
    if (excerpt?.sourceId === mapped.sourceId) mapped.extractedValue = excerpt.value;
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
    verifiedAt: [...new Set(program.evidence.map((item) => observedOnBySource.get(item.sourceId)).filter((value): value is string => Boolean(value)))].sort().at(-1) ?? program.verifiedAt,
    evidence,
    ...(excerpt ? { sourceExcerpt: excerpt.value, sourceSyncedAt: observedOnBySource.get(excerpt.sourceId) } : {}),
    ...(program.rule ? { rule: mapRule(program.rule, snapshots, observedOnBySource, evidenceRows) } : {}),
  };
  const unique = new Map(evidenceRows.map((row) => [
    `${row.field_path}:${row.source_id}:${row.locator}`,
    row,
  ]));
  return { canonical, evidenceRows: [...unique.values()] };
}

async function main() {
  const [snapshotRows, sourceStates] = await Promise.all([
    supabaseRest<SnapshotRow[]>(config, "source_snapshots?select=id,source_id,observed_at&content_hash=not.is.null&order=observed_at.desc"),
    supabaseRest<Array<{ id: string; last_check_error: unknown }>>(config, "sources?select=id,last_check_error"),
  ]);
  const failedSourceIds = new Set(sourceStates.filter((source) => source.last_check_error != null).map((source) => source.id));
  const snapshots = new Map<string, string>();
  const observedOnBySource = new Map<string, string>();
  for (const row of snapshotRows) {
    if (snapshots.has(row.source_id)) continue;
    snapshots.set(row.source_id, row.id);
    observedOnBySource.set(row.source_id, row.observed_at.slice(0, 10));
  }

  const manifests = new Map([
    ["taoyuan-welfare-open-data", taoyuanSourceClassifications],
    ["new-taipei-welfare-open-data", newTaipeiSourceClassifications],
    ["taipei-social-aid-open-data", taipeiSourceClassifications],
    ["taichung-social-aid-open-data", taichungSourceClassifications],
  ]);
  const opportunitySourceIds = new Set(reviewedOpportunities.map((item) => item.sourceId));
  const programSourceIds = new Set(programs.flatMap((program) => program.evidence.map((item) => item.sourceId)));
  const sourceItems: TaoyuanItemRow[] = [];
  const latestSnapshotIds = [...new Set([...manifests.keys(), ...opportunitySourceIds, ...programSourceIds, "tainan-social-welfare-open-data"]
    .map((sourceId) => snapshots.get(sourceId)).filter((value): value is string => Boolean(value)))];
  if (latestSnapshotIds.length) {
    sourceItems.push(...await supabaseRest<TaoyuanItemRow[]>(config,
      `source_items?select=id,source_id,external_id,title,snapshot_id,canonical_draft,classification,review_status&snapshot_id=in.(${latestSnapshotIds.map(encodeURIComponent).join(",")})`));
  }
  const reviewedTaoyuanItems = sourceItems.filter((item) =>
    item.source_id === "taoyuan-welfare-open-data" && item.review_status === "published" && item.classification !== "excluded");
  const reviewedPrograms = reviewedTaoyuanItems.length > 0
    ? buildTaoyuanReviewedPrograms(reviewedTaoyuanItems, "2026-07-27")
    : [];
  const tainanItems = sourceItems.filter((item) =>
    item.source_id === "tainan-social-welfare-open-data") as unknown as TainanSourceItem[];
  const tainanPrograms = tainanItems.length > 0
    ? buildTainanPassthroughPrograms(tainanItems, observedOnBySource.get("tainan-social-welfare-open-data") ?? new Date().toISOString().slice(0, 10))
    : [];
  const allPrograms = publishStructuredPassthrough && !publishUpdates
    ? tainanPrograms
    : [...programs, ...reviewedPrograms, ...tainanPrograms];
  const classificationUpdates = sourceItems.flatMap((item) => {
    const expected = manifests.get(item.source_id)?.find((entry) => entry.title === item.title);
    return expected && (expected.classification !== item.classification || item.review_status !== "published")
      ? [{ item, expected }]
      : [];
  });
  const opportunityClassificationUpdates = reviewedOpportunities.flatMap((expected) => {
    const item = sourceItems.find((row) => row.source_id === expected.sourceId && row.external_id === expected.externalId);
    if (!item) return [];
    return item.classification !== "descriptive_only" || item.review_status !== "published"
      ? [{ item, expected }]
      : [];
  });

  const ready = allPrograms.filter((program) => program.evidence.every((item) => snapshots.has(item.sourceId) && !failedSourceIds.has(item.sourceId)));
  const skipped = allPrograms.filter((program) => !ready.includes(program));
  if (!apply) {
    console.log(JSON.stringify({ dryRun: true, ready: ready.map((item) => item.slug), classificationUpdates: classificationUpdates.map(({ item }) => item.title), opportunityClassificationUpdates: opportunityClassificationUpdates.map(({ expected }) => expected.slug), skipped: skipped.map((item) => item.slug) }, null, 2));
    return;
  }

  for (const { item, expected } of classificationUpdates) {
    await supabaseRest(config, `source_items?id=eq.${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ classification: expected.classification, classification_rationale: expected.rationale, review_status: "published" }),
      headers: { Prefer: "return=minimal" },
    });
  }

  for (const { item, expected } of opportunityClassificationUpdates) {
    await supabaseRest(config, `source_items?id=eq.${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        classification: "descriptive_only",
        classification_rationale: `Official Source auto-sync for ${expected.slug}; official link remains the final reference.`,
        review_status: "published",
      }),
      headers: { Prefer: "return=minimal" },
    });
  }

  let created = 0;
  let unchanged = 0;
  let drafted = 0;
  let archived = 0;
  const failedPrograms: Array<{ slug: string; error: string }> = [];
  for (const program of ready) {
    let createdVersionId: string | undefined;
    try {
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
    const { canonical, evidenceRows } = canonicalProgram(program, snapshots, observedOnBySource, sourceItems);
    if (previous[0] && isDeepStrictEqual(previous[0].canonical_content, canonical)) {
      unchanged += 1;
      continue;
    }
    const isInitial = previous.length === 0;
    const status = isInitial && (publishInitial || publishUpdates || publishStructuredPassthrough) ? "published" : "draft";
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
    createdVersionId = version.id;
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
          reviewer_name: "Official Source auto-sync",
          action: "publish",
          rationale: program.sourceMode === "government_api_passthrough"
            ? "Published descriptive government API content without generating Eligibility Rules."
            : "Automatically published from the registered official Source and Repository Rule definitions.",
        }),
        headers: { Prefer: "return=minimal" },
      });
      created += 1;
    } else if (publishUpdates || publishStructuredPassthrough) {
      await supabaseRest(config, "rpc/publish_program_version", {
        method: "POST",
        body: JSON.stringify({
          target_version_id: version.id,
          reviewer: "Official Source auto-sync",
          rationale: program.sourceMode === "government_api_passthrough"
            ? "Published changed descriptive government API content without generating Eligibility Rules."
            : "Automatically published the latest registered official Source snapshot while preserving explicit Eligibility Rules.",
          review_action: "publish",
        }),
        headers: { Prefer: "return=minimal" },
      });
      created += 1;
    } else {
      drafted += 1;
    }
    } catch (error) {
      if (createdVersionId) {
        try {
          await supabaseRest(config, "rpc/reject_program_version", {
            method: "POST",
            body: JSON.stringify({
              target_version_id: createdVersionId,
              reviewer: "Official Source auto-sync",
              rationale: "Rejected an incomplete automatic sync version after publication failed.",
            }),
            headers: { Prefer: "return=minimal" },
          });
        } catch {
          // A non-published partial version remains invisible and will be reported by the failed workflow.
        }
      }
      failedPrograms.push({ slug: program.slug, error: error instanceof Error ? error.message : String(error) });
    }
  }

  if ((publishUpdates || publishStructuredPassthrough) && canReconcileSourceRemovals("tainan-social-welfare-open-data", failedSourceIds)) {
    const currentIds = new Set(ready.map((program) => program.id));
    const existing = await supabaseRest<Array<{ id: string; stable_key: string }>>(
      config,
      "programs?select=id,stable_key&stable_key=like.tainan-social-welfare-*",
    );
    const sourceId = "tainan-social-welfare-open-data";
    const snapshotId = snapshots.get(sourceId);
    const observedOn = observedOnBySource.get(sourceId);
    if (!snapshotId || !observedOn) throw new Error("Missing current Tainan Source snapshot for removal reconciliation");
    for (const identity of existing.filter((item) => !currentIds.has(item.stable_key))) {
      const versions = await supabaseRest<VersionWithStatusRow[]>(
        config,
        `program_versions?select=version,status,canonical_content&program_id=eq.${identity.id}&order=version.desc`,
      );
      const published = versions.find((version) => version.status === "published");
      if (!published || published.canonical_content.coverage === "archived") continue;
      const canonical: Program = {
        ...published.canonical_content,
        coverage: "archived",
        effectiveTo: observedOn,
        verifiedAt: observedOn,
        caveats: [
          ...published.canonical_content.caveats,
          `臺南市政府 API 自 ${observedOn} 起不再回傳此項目，已停止公開。`,
        ],
        evidence: [{
          sourceId,
          snapshotId,
          locator: `removed[stable_key=${identity.stable_key}]`,
          extractedValue: "Current government API response no longer contains this item.",
          reviewedAt: observedOn,
        }],
      };
      const [version] = await supabaseRest<Array<{ id: string }>>(config, "program_versions", {
        method: "POST",
        body: JSON.stringify({
          program_id: identity.id,
          version: (versions[0]?.version ?? 0) + 1,
          status: "draft",
          coverage: "archived",
          title: canonical.title,
          summary: canonical.summary,
          benefit_type: canonical.benefitType,
          decision_type: canonical.decisionType,
          canonical_content: canonical,
          rule_tree: null,
          effective_to: observedOn,
          application_url: canonical.applicationUrl ?? canonical.officialUrl,
          last_verified_at: observedOn,
        }),
        headers: { Prefer: "return=representation" },
      });
      await supabaseRest(config, "field_evidence", {
        method: "POST",
        body: JSON.stringify({
          program_version_id: version.id,
          field_path: "/evidence/0",
          source_id: sourceId,
          snapshot_id: snapshotId,
          locator: `removed[stable_key=${identity.stable_key}]`,
          extracted_value: "Current government API response no longer contains this item.",
          reviewed_at: observedOn,
        }),
        headers: { Prefer: "return=minimal" },
      });
      await supabaseRest(config, "rpc/publish_program_version", {
        method: "POST",
        body: JSON.stringify({
          target_version_id: version.id,
          reviewer: "Official Source auto-sync",
          rationale: "Archived a descriptive item removed from the current government API response.",
          review_action: "publish",
        }),
        headers: { Prefer: "return=minimal" },
      });
      archived += 1;
    }
  }

  let rejectedStaleDrafts = 0;
  if (publishUpdates || publishStructuredPassthrough) {
    const [pendingVersions, publishedVersions] = await Promise.all([
      supabaseRest<VersionStatusRow[]>(config, "program_versions?select=id,program_id,version&status=in.(draft,in_review)"),
      supabaseRest<VersionStatusRow[]>(config, "program_versions?select=id,program_id,version&status=eq.published"),
    ]);
    const publishedByProgram = new Map(publishedVersions.map((version) => [version.program_id, version.version]));
    const staleVersions = pendingVersions.filter((version) => version.version < (publishedByProgram.get(version.program_id) ?? 0));
    for (const version of staleVersions) {
      await supabaseRest(config, "rpc/reject_program_version", {
        method: "POST",
        body: JSON.stringify({
          target_version_id: version.id,
          reviewer: "Official Source auto-sync",
          rationale: "Rejected an obsolete interrupted-sync draft after a newer Source version was published.",
        }),
        headers: { Prefer: "return=minimal" },
      });
      rejectedStaleDrafts += 1;
    }
  }
  console.log(JSON.stringify({ dryRun: false, published: created, archived, drafts: drafted, rejectedStaleDrafts, unchanged, classificationUpdates: classificationUpdates.length, opportunityClassificationUpdates: opportunityClassificationUpdates.length, skipped: skipped.map((item) => item.slug), failedPrograms }, null, 2));
  if (failedPrograms.length > 0) process.exitCode = 1;
}

void main();
