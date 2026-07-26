import { isDeepStrictEqual } from "node:util";
import type { Program, RuleNode } from "@/lib/domain";
import { supabaseConfig, supabaseRest } from "@/lib/supabase-rest";

export type DatabaseSource = {
  id: string;
  status: "active" | "blocked" | "archived";
  last_checked_at: string | null;
  last_successful_fetch_at: string | null;
  last_check_error: { message?: string } | null;
};

export type SourceItemRow = {
  id: string;
  source_id: string;
  snapshot_id: string;
  external_id: string;
  title: string;
  canonical_draft: Record<string, unknown>;
  unknown_fields: Record<string, unknown>;
  classification: "matchable" | "descriptive_only" | "excluded" | null;
  classification_rationale: string | null;
  review_status: "draft" | "in_review" | "published" | "rejected" | "superseded";
};

export type SnapshotRow = {
  id: string;
  source_id: string;
  observed_at: string;
  content_hash: string | null;
  http_status: number;
  fetch_error: { message?: string } | null;
};

export type EvidenceRow = {
  field_path: string;
  source_id: string;
  snapshot_id: string;
  locator: string;
  extracted_value: string;
  reviewed_at: string | null;
};

export type ProgramVersionRow = {
  id: string;
  program_id: string;
  version: number;
  status: "draft" | "in_review" | "published" | "rejected" | "superseded";
  coverage: string;
  title: string;
  summary: string;
  benefit_type: string;
  decision_type: string;
  canonical_content: Program;
  rule_tree: RuleNode | null;
  application_url: string | null;
  last_verified_at: string | null;
  created_at: string;
  published_at: string | null;
  programs: { stable_key: string; slug: string };
  field_evidence: EvidenceRow[];
};

export type ReviewRow = {
  id: string;
  program_version_id: string | null;
  source_item_id: string | null;
  reviewer_name: string | null;
  action: string;
  rationale: string;
  created_at: string;
};

export type ItemChange = {
  externalId: string;
  title: string;
  fields: string[];
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
};

export type SourceDiff = {
  sourceId: string;
  current: SnapshotRow;
  previous?: SnapshotRow;
  added: ItemChange[];
  removed: ItemChange[];
  changed: ItemChange[];
  unchanged: number;
};

function changedFields(before: SourceItemRow, after: SourceItemRow): string[] {
  const values = {
    title: [before.title, after.title],
    canonical_draft: [before.canonical_draft, after.canonical_draft],
    unknown_fields: [before.unknown_fields, after.unknown_fields],
  } as const;
  return Object.entries(values)
    .filter(([, [oldValue, newValue]]) => !isDeepStrictEqual(oldValue, newValue))
    .map(([key]) => key);
}

export function buildSourceDiffs(snapshots: SnapshotRow[], items: SourceItemRow[]): SourceDiff[] {
  const itemsBySnapshot = new Map<string, SourceItemRow[]>();
  for (const item of items) {
    const rows = itemsBySnapshot.get(item.snapshot_id) ?? [];
    rows.push(item);
    itemsBySnapshot.set(item.snapshot_id, rows);
  }
  const bySource = new Map<string, SnapshotRow[]>();
  for (const snapshot of snapshots) {
    if (!snapshot.content_hash) continue;
    const rows = bySource.get(snapshot.source_id) ?? [];
    rows.push(snapshot);
    bySource.set(snapshot.source_id, rows);
  }
  return [...bySource.entries()].map(([sourceId, rows]) => {
    rows.sort((a, b) => b.observed_at.localeCompare(a.observed_at));
    const [current, previous] = rows;
    const before = new Map((previous ? itemsBySnapshot.get(previous.id) ?? [] : []).map((item) => [item.external_id, item]));
    const after = new Map((itemsBySnapshot.get(current.id) ?? []).map((item) => [item.external_id, item]));
    const added: ItemChange[] = [];
    const removed: ItemChange[] = [];
    const changed: ItemChange[] = [];
    let unchanged = 0;
    for (const item of after.values()) {
      const old = before.get(item.external_id);
      if (!old) added.push({ externalId: item.external_id, title: item.title, fields: ["new"], after: item.canonical_draft });
      else {
        const fields = changedFields(old, item);
        if (fields.length) changed.push({ externalId: item.external_id, title: item.title, fields, before: old.canonical_draft, after: item.canonical_draft });
        else unchanged += 1;
      }
    }
    for (const item of before.values()) {
      if (!after.has(item.external_id)) removed.push({ externalId: item.external_id, title: item.title, fields: ["removed"], before: item.canonical_draft });
    }
    return { sourceId, current, previous, added, removed, changed, unchanged };
  }).sort((a, b) => b.current.observed_at.localeCompare(a.current.observed_at));
}

function collectRuleEvidencePaths(rule: RuleNode, path = "/rule"): string[] {
  if ("all" in rule) return rule.all.flatMap((child, index) => collectRuleEvidencePaths(child, `${path}/all/${index}`));
  if ("any" in rule) return rule.any.flatMap((child, index) => collectRuleEvidencePaths(child, `${path}/any/${index}`));
  return [path];
}

export function requiredEvidencePaths(program: Program): string[] {
  return [
    ...program.evidence.map((_, index) => `/evidence/${index}`),
    ...(program.rule ? collectRuleEvidencePaths(program.rule) : []),
  ];
}

export async function loadAdminReviewData() {
  const config = supabaseConfig(true);
  if (!config) return null;
  const [databaseSources, snapshots, items, versions, reviews] = await Promise.all([
    supabaseRest<DatabaseSource[]>(config, "sources?select=id,status,last_checked_at,last_successful_fetch_at,last_check_error"),
    supabaseRest<SnapshotRow[]>(config, "source_snapshots?select=id,source_id,observed_at,content_hash,http_status,fetch_error&order=observed_at.desc"),
    supabaseRest<SourceItemRow[]>(config, "source_items?select=id,source_id,snapshot_id,external_id,title,canonical_draft,unknown_fields,classification,classification_rationale,review_status&order=created_at.desc"),
    supabaseRest<ProgramVersionRow[]>(config, "program_versions?select=id,program_id,version,status,coverage,title,summary,benefit_type,decision_type,canonical_content,rule_tree,application_url,last_verified_at,created_at,published_at,programs(stable_key,slug),field_evidence(field_path,source_id,snapshot_id,locator,extracted_value,reviewed_at)&order=version.desc"),
    supabaseRest<ReviewRow[]>(config, "reviews?select=id,program_version_id,source_item_id,reviewer_name,action,rationale,created_at&order=created_at.desc&limit=30"),
  ]);
  const latestSnapshotIds = new Set<string>();
  const seenSources = new Set<string>();
  for (const snapshot of snapshots) {
    if (snapshot.content_hash && !seenSources.has(snapshot.source_id)) {
      latestSnapshotIds.add(snapshot.id);
      seenSources.add(snapshot.source_id);
    }
  }
  const publishedPrograms = new Set(versions.filter((version) => version.status === "published").map((version) => version.program_id));
  const reviewableSources = new Set(databaseSources
    .filter((source) => source.status === "active" && source.last_check_error == null)
    .map((source) => source.id));
  const rollbackByProgram = new Map<string, ProgramVersionRow>();
  for (const version of versions) {
    if (version.status === "superseded" && publishedPrograms.has(version.program_id) && !rollbackByProgram.has(version.program_id)) {
      rollbackByProgram.set(version.program_id, version);
    }
  }
  return {
    sources: new Map(databaseSources.map((source) => [source.id, source])),
    snapshots,
    items,
    sourceDiffs: buildSourceDiffs(snapshots, items),
    pendingItems: items.filter((item) => reviewableSources.has(item.source_id) && latestSnapshotIds.has(item.snapshot_id) && item.review_status === "draft"),
    pendingVersions: versions.filter((version) => version.status === "draft" || version.status === "in_review"),
    rollbackCandidates: [...rollbackByProgram.values()],
    reviews,
    published: versions.filter((version) => version.status === "published"),
  };
}
