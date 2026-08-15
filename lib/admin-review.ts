import { isDeepStrictEqual } from "node:util";
import type { Evidence, Program, RuleNode } from "@/lib/domain";
import { evidenceNeedsReview } from "@/lib/source-freshness";
import { normalizeNonSubstantiveSourceText } from "@/lib/source-text-normalization";
import { supabaseConfig, supabaseRest } from "@/lib/supabase-rest";

export type DatabaseSource = {
  id: string;
  automation_level: string;
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
  id: string;
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
  effective_from: string | null;
  effective_to: string | null;
  application_open: string | null;
  application_close: string | null;
  last_verified_at: string | null;
  next_review_at: string | null;
  created_at: string;
  published_at: string | null;
  programs: { stable_key: string; slug: string };
  field_evidence: EvidenceRow[];
};

export const PROGRAM_VERSION_SELECT = "id,program_id,version,status,coverage,title,summary,benefit_type,decision_type,canonical_content,rule_tree,effective_from,effective_to,application_open,application_close,application_url,last_verified_at,next_review_at,created_at,published_at,programs(stable_key,slug),field_evidence(id,field_path,source_id,snapshot_id,locator,extracted_value,reviewed_at)";

export type EvidenceIssue = {
  evidence: EvidenceRow;
  latestSnapshot: SnapshotRow | null;
  sourceError: string | null;
  sourceChanges: ItemChange[];
};

export type NeedsReviewProgram = {
  version: ProgramVersionRow;
  issues: EvidenceIssue[];
  existingDraft?: ProgramVersionRow;
  blocked: boolean;
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

export type ActivityReportRow = {
  id: string;
  opportunity_slug: string;
  reason: "expired" | "broken_link" | "incorrect_info" | "incorrect_eligibility" | "other";
  detail: string | null;
  status: "open" | "resolved" | "dismissed";
  created_at: string;
};

export type ItemChange = {
  externalId: string;
  title: string;
  beforeTitle?: string;
  afterTitle?: string;
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

export type SnapshotReviewState = "unchanged" | "changed" | "missing";

const nonReviewCanonicalFields = new Set(["links", "url", "detailUrl", "officialUrl", "applicationUrl"]);

function normalizeVisibleValue(value: unknown, sourceId: string): unknown {
  if (typeof value === "string") {
    const normalized = normalizeNonSubstantiveSourceText(value);
    if (sourceId === "yda-overseas-dream") {
      return normalized.replace(/最新消息\s+(?:\d{2,3}|\d{4})-\d{2}-\d{2}[\s\S]*?更多\s+影音專區/g, "最新消息 影音專區");
    }
    return normalized;
  }
  if (Array.isArray(value)) return value.map((child) => normalizeVisibleValue(child, sourceId));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, normalizeVisibleValue(child, sourceId)]));
  }
  return value;
}

function changedFields(before: SourceItemRow, after: SourceItemRow): string[] {
  const fields = before.title === after.title ? [] : ["title"];
  const keys = new Set([...Object.keys(before.canonical_draft), ...Object.keys(after.canonical_draft)]);
  for (const key of keys) {
    if (nonReviewCanonicalFields.has(key)) continue;
    if (before.source_id === "yda-overseas-dream" && key === "publishedText") continue;
    if (!isDeepStrictEqual(normalizeVisibleValue(before.canonical_draft[key], before.source_id), normalizeVisibleValue(after.canonical_draft[key], after.source_id))) {
      fields.push(`canonical_draft.${key}`);
    }
  }
  return fields;
}

export function compareSnapshotItems(
  sourceId: string,
  previousSnapshotId: string,
  currentSnapshotId: string,
  items: SourceItemRow[],
): ItemChange[] {
  const previous = new Map(items
    .filter((item) => item.source_id === sourceId && item.snapshot_id === previousSnapshotId)
    .map((item) => [item.external_id, item]));
  const current = new Map(items
    .filter((item) => item.source_id === sourceId && item.snapshot_id === currentSnapshotId)
    .map((item) => [item.external_id, item]));
  const changes: ItemChange[] = [];
  for (const item of current.values()) {
    const old = previous.get(item.external_id);
    if (!old) changes.push({ externalId: item.external_id, title: item.title, afterTitle: item.title, fields: ["new"], after: item.canonical_draft });
    else {
      const fields = changedFields(old, item);
      if (fields.length) changes.push({ externalId: item.external_id, title: item.title, beforeTitle: old.title, afterTitle: item.title, fields, before: old.canonical_draft, after: item.canonical_draft });
    }
  }
  for (const item of previous.values()) {
    if (!current.has(item.external_id)) changes.push({ externalId: item.external_id, title: item.title, beforeTitle: item.title, fields: ["removed"], before: item.canonical_draft });
  }
  return changes;
}

export function snapshotReviewState(
  sourceId: string,
  previousSnapshotId: string,
  currentSnapshotId: string,
  items: SourceItemRow[],
): SnapshotReviewState {
  if (previousSnapshotId === currentSnapshotId) return "unchanged";
  const hasPrevious = items.some((item) => item.source_id === sourceId && item.snapshot_id === previousSnapshotId);
  const hasCurrent = items.some((item) => item.source_id === sourceId && item.snapshot_id === currentSnapshotId);
  // A parser introduced after the Evidence snapshot has no trustworthy text baseline.
  // Do not turn the entire current page into a fake "added" approval task.
  if (!hasPrevious && hasCurrent) return "unchanged";
  if (!hasCurrent) return "missing";
  return compareSnapshotItems(sourceId, previousSnapshotId, currentSnapshotId, items).length ? "changed" : "unchanged";
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
      if (!old) added.push({ externalId: item.external_id, title: item.title, afterTitle: item.title, fields: ["new"], after: item.canonical_draft });
      else {
        const fields = changedFields(old, item);
        if (fields.length) changed.push({ externalId: item.external_id, title: item.title, beforeTitle: old.title, afterTitle: item.title, fields, before: old.canonical_draft, after: item.canonical_draft });
        else unchanged += 1;
      }
    }
    for (const item of before.values()) {
      if (!after.has(item.external_id)) removed.push({ externalId: item.external_id, title: item.title, beforeTitle: item.title, fields: ["removed"], before: item.canonical_draft });
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

export function latestSnapshotsBySource(snapshots: SnapshotRow[]): Map<string, SnapshotRow> {
  const latest = new Map<string, SnapshotRow>();
  for (const snapshot of snapshots) {
    if (!snapshot.content_hash) continue;
    const current = latest.get(snapshot.source_id);
    if (!current || snapshot.observed_at > current.observed_at) latest.set(snapshot.source_id, snapshot);
  }
  return latest;
}

export function buildNeedsReviewPrograms(
  databaseSources: DatabaseSource[],
  snapshots: SnapshotRow[],
  versions: ProgramVersionRow[],
  items: SourceItemRow[] = [],
): NeedsReviewProgram[] {
  const sourceById = new Map(databaseSources.map((source) => [source.id, source]));
  const latestBySource = latestSnapshotsBySource(snapshots);
  const draftsByProgram = new Map<string, ProgramVersionRow>();
  for (const version of versions) {
    if (["draft", "in_review"].includes(version.status) && !draftsByProgram.has(version.program_id)) draftsByProgram.set(version.program_id, version);
  }
  return versions.filter((version) => version.status === "published").flatMap((version) => {
    const issues = version.field_evidence.flatMap((evidence): EvidenceIssue[] => {
      const source = sourceById.get(evidence.source_id);
      const latestSnapshot = latestBySource.get(evidence.source_id) ?? null;
      const sourceError = source?.last_check_error?.message ?? (!source ? "Source registry 不存在" : null);
      if (!evidenceNeedsReview(source, evidence.snapshot_id, latestSnapshot?.id)) return [];
      const sourceChanges = latestSnapshot
        ? compareSnapshotItems(evidence.source_id, evidence.snapshot_id, latestSnapshot.id, items)
        : [];
      const reviewState = latestSnapshot
        ? snapshotReviewState(evidence.source_id, evidence.snapshot_id, latestSnapshot.id, items)
        : "missing";
      if (!sourceError && reviewState === "unchanged") return [];
      return [{ evidence, latestSnapshot, sourceError, sourceChanges }];
    });
    if (issues.length === 0) return [];
    return [{
      version,
      issues,
      existingDraft: draftsByProgram.get(version.program_id),
      blocked: issues.some((issue) => issue.sourceError || !issue.latestSnapshot),
    }];
  });
}

function replaceRuleEvidence(rule: RuleNode, path: string[], evidence: Evidence): RuleNode {
  if (path.length === 0) {
    if ("all" in rule || "any" in rule) throw new Error("Evidence path 沒有指向 Atomic rule");
    return { ...rule, evidence };
  }
  const [operator, rawIndex, ...rest] = path;
  const index = Number(rawIndex);
  if (!Number.isInteger(index) || index < 0) throw new Error("Evidence path index 不正確");
  if (operator === "all" && "all" in rule && rule.all[index]) {
    return { all: rule.all.map((child, childIndex) => childIndex === index ? replaceRuleEvidence(child, rest, evidence) : child) };
  }
  if (operator === "any" && "any" in rule && rule.any[index]) {
    return { any: rule.any.map((child, childIndex) => childIndex === index ? replaceRuleEvidence(child, rest, evidence) : child) };
  }
  throw new Error("Evidence path 與 Rule tree 不一致");
}

export function refreshProgramEvidence(
  program: Program,
  updates: Array<{ fieldPath: string; evidence: Evidence }>,
): Program {
  const allowed = new Set(requiredEvidencePaths(program));
  let evidenceRows = [...program.evidence];
  let rule = program.rule;
  for (const update of updates) {
    if (!allowed.has(update.fieldPath)) throw new Error(`Unknown Evidence path: ${update.fieldPath}`);
    const path = update.fieldPath.split("/").filter(Boolean);
    if (path[0] === "evidence") {
      const index = Number(path[1]);
      if (path.length !== 2 || !Number.isInteger(index) || !evidenceRows[index]) throw new Error("Program Evidence path 不正確");
      evidenceRows = evidenceRows.map((item, itemIndex) => itemIndex === index ? update.evidence : item);
    } else if (path[0] === "rule" && rule) {
      rule = replaceRuleEvidence(rule, path.slice(1), update.evidence);
    } else throw new Error("Evidence path 不正確");
  }
  return { ...program, evidence: evidenceRows, ...(rule ? { rule } : {}) };
}

export async function loadAdminReviewData() {
  const config = supabaseConfig(true);
  if (!config) return null;
  const [databaseSources, snapshots, recentItems, versions, reviews, activityReports] = await Promise.all([
    supabaseRest<DatabaseSource[]>(config, "sources?select=id,automation_level,status,last_checked_at,last_successful_fetch_at,last_check_error"),
    supabaseRest<SnapshotRow[]>(config, "source_snapshots?select=id,source_id,observed_at,content_hash,http_status,fetch_error&order=observed_at.desc"),
    supabaseRest<SourceItemRow[]>(config, "source_items?select=id,source_id,snapshot_id,external_id,title,canonical_draft,unknown_fields,classification,classification_rationale,review_status&order=created_at.desc"),
    supabaseRest<ProgramVersionRow[]>(config, `program_versions?select=${PROGRAM_VERSION_SELECT}&order=version.desc`),
    supabaseRest<ReviewRow[]>(config, "reviews?select=id,program_version_id,source_item_id,reviewer_name,action,rationale,created_at&order=created_at.desc&limit=30"),
    supabaseRest<ActivityReportRow[]>(config, "activity_reports?select=id,opportunity_slug,reason,detail,status,created_at&status=eq.open&order=created_at.desc&limit=100"),
  ]);
  const latestSnapshots = latestSnapshotsBySource(snapshots);
  const comparisonSnapshotIds = [...new Set([
    ...[...latestSnapshots.values()].map((snapshot) => snapshot.id),
    ...versions.flatMap((version) => version.field_evidence.map((evidence) => evidence.snapshot_id)),
  ])];
  const comparisonItems = comparisonSnapshotIds.length
    ? await supabaseRest<SourceItemRow[]>(config, `source_items?select=id,source_id,snapshot_id,external_id,title,canonical_draft,unknown_fields,classification,classification_rationale,review_status&snapshot_id=in.(${comparisonSnapshotIds.map(encodeURIComponent).join(",")})`)
    : [];
  const items = [...new Map([...recentItems, ...comparisonItems].map((item) => [item.id, item])).values()];
  const latestSnapshotIds = new Set([...latestSnapshots.values()].map((snapshot) => snapshot.id));
  const databaseSourceById = new Map(databaseSources.map((source) => [source.id, source]));
  const publishedPrograms = new Set(versions.filter((version) => version.status === "published").map((version) => version.program_id));
  const publishedProgramSourceIds = new Set(versions
    .filter((version) => version.status === "published")
    .flatMap((version) => version.field_evidence.map((evidence) => evidence.source_id)));
  const reviewableSources = new Set(databaseSources
    .filter((source) => source.status === "active" && source.last_check_error == null)
    .map((source) => source.id));
  const rollbackByProgram = new Map<string, ProgramVersionRow>();
  for (const version of versions) {
    if (version.status === "superseded" && publishedPrograms.has(version.program_id) && !rollbackByProgram.has(version.program_id)) {
      rollbackByProgram.set(version.program_id, version);
    }
  }
  const sourceDiffs = buildSourceDiffs(snapshots, items);
  return {
    sources: databaseSourceById,
    snapshots,
    items,
    sourceDiffs,
    needsReviewPrograms: buildNeedsReviewPrograms(databaseSources, snapshots, versions, items),
    pendingItems: items.filter((item) => {
      const source = databaseSourceById.get(item.source_id);
      return source?.automation_level !== "structured_extract"
        && reviewableSources.has(item.source_id)
        && latestSnapshotIds.has(item.snapshot_id)
        && item.review_status === "draft"
        && item.canonical_draft.entityType !== "opportunity"
        && !publishedProgramSourceIds.has(item.source_id);
    }),
    pendingVersions: versions.filter((version) => version.status === "draft" || version.status === "in_review"),
    rollbackCandidates: [...rollbackByProgram.values()],
    reviews,
    activityReports,
    published: versions.filter((version) => version.status === "published"),
  };
}
