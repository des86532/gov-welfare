import assert from "node:assert/strict";
import test from "node:test";
import { isAdminAuthorization } from "../lib/admin-auth";
import { buildNeedsReviewPrograms, buildSourceDiffs, refreshProgramEvidence, requiredEvidencePaths, type DatabaseSource, type ProgramVersionRow, type SnapshotRow, type SourceItemRow } from "../lib/admin-review";
import type { Program } from "../lib/domain";

const snapshots: SnapshotRow[] = [
  { id: "new", source_id: "source-a", observed_at: "2026-07-27T02:00:00Z", content_hash: "new-hash", http_status: 200, fetch_error: null },
  { id: "old", source_id: "source-a", observed_at: "2026-07-26T02:00:00Z", content_hash: "old-hash", http_status: 200, fetch_error: null },
];

function item(snapshotId: string, externalId: string, title: string, value: string): SourceItemRow {
  return {
    id: `${snapshotId}-${externalId}`,
    source_id: "source-a",
    snapshot_id: snapshotId,
    external_id: externalId,
    title,
    canonical_draft: { value },
    unknown_fields: {},
    classification: null,
    classification_rationale: null,
    review_status: "draft",
  };
}

test("Admin Basic Auth 驗證完整密碼且忽略 username", () => {
  assert.equal(isAdminAuthorization(`Basic ${btoa("admin:correct horse")}`, "correct horse"), true);
  assert.equal(isAdminAuthorization(`Basic ${btoa("other:wrong")}`, "correct horse"), false);
  assert.equal(isAdminAuthorization("Bearer token", "correct horse"), false);
  assert.equal(isAdminAuthorization(null, "correct horse"), false);
  assert.equal(isAdminAuthorization(`Basic ${btoa("admin:correct horse")}`, undefined), false);
});

test("Source diff 分開列出新增、移除、變更與未變更項目", () => {
  const rows = [
    item("old", "same", "相同", "A"), item("new", "same", "相同", "A"),
    item("old", "changed", "變更", "A"), item("new", "changed", "變更", "B"),
    item("old", "removed", "移除", "A"), item("new", "added", "新增", "A"),
  ];
  const [diff] = buildSourceDiffs(snapshots, rows);
  assert.equal(diff.unchanged, 1);
  assert.deepEqual(diff.added.map((entry) => entry.externalId), ["added"]);
  assert.deepEqual(diff.removed.map((entry) => entry.externalId), ["removed"]);
  assert.deepEqual(diff.changed.map((entry) => entry.fields), [["canonical_draft"]]);
});

test("Publish gate 要求 Program evidence 與每個 Atomic rule path", () => {
  const evidence = { sourceId: "source-a", snapshotId: "new", locator: "資格", extractedValue: "年滿 18 歲", reviewedAt: "2026-07-27" };
  const program = {
    evidence: [evidence],
    rule: { all: [
      { field: "age", operator: "gte", value: 18, label: "年滿 18 歲", evidence },
      { any: [
        { field: "nationality", operator: "eq", value: "taiwan", label: "具本國籍", evidence },
        { field: "residence", operator: "eq", value: true, label: "符合居留資格", evidence },
      ] },
    ] },
  } as Program;
  assert.deepEqual(requiredEvidencePaths(program), [
    "/evidence/0",
    "/rule/all/0",
    "/rule/all/1/any/0",
    "/rule/all/1/any/1",
  ]);
});

test("needs_review Queue 找出 stale Evidence 並關聯既有 Draft", () => {
  const source: DatabaseSource = { id: "source-a", status: "active", last_checked_at: null, last_successful_fetch_at: null, last_check_error: null };
  const published = {
    id: "published", program_id: "program-a", version: 1, status: "published",
    field_evidence: [{ id: "evidence-a", field_path: "/evidence/0", source_id: "source-a", snapshot_id: "old", locator: "資格", extracted_value: "年滿 18 歲", reviewed_at: "2026-07-26" }],
  } as ProgramVersionRow;
  const draft = { id: "draft", program_id: "program-a", version: 2, status: "draft", field_evidence: [] } as unknown as ProgramVersionRow;
  const queue = buildNeedsReviewPrograms([source], snapshots, [published, draft], []);
  assert.equal(queue.length, 1);
  assert.equal(queue[0].issues[0].latestSnapshot?.id, "new");
  assert.equal(queue[0].existingDraft?.id, "draft");
  assert.equal(queue[0].blocked, false);
});

test("Evidence refresh 同步更新 Program Evidence 與 Atomic rule 且不修改舊物件", () => {
  const oldEvidence = { sourceId: "source-a", snapshotId: "old", locator: "舊資格", extractedValue: "年滿 18 歲", reviewedAt: "2026-07-26" };
  const nextEvidence = { ...oldEvidence, snapshotId: "new", locator: "新資格", reviewedAt: "2026-08-02" };
  const program = {
    evidence: [oldEvidence],
    rule: { field: "age", operator: "gte", value: 18, label: "年滿 18 歲", evidence: oldEvidence },
  } as Program;
  const refreshed = refreshProgramEvidence(program, [
    { fieldPath: "/evidence/0", evidence: nextEvidence },
    { fieldPath: "/rule", evidence: nextEvidence },
  ]);
  assert.equal(refreshed.evidence[0].snapshotId, "new");
  assert.ok(refreshed.rule && !("all" in refreshed.rule) && !("any" in refreshed.rule));
  if (refreshed.rule && !("all" in refreshed.rule) && !("any" in refreshed.rule)) assert.equal(refreshed.rule.evidence.locator, "新資格");
  assert.equal(program.evidence[0].snapshotId, "old");
});
