import assert from "node:assert/strict";
import test from "node:test";
import { isAdminAuthorization } from "../lib/admin-auth";
import { buildSourceDiffs, requiredEvidencePaths, type SnapshotRow, type SourceItemRow } from "../lib/admin-review";
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
