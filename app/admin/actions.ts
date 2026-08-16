"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { isAdminAuthorization } from "@/lib/admin-auth";
import { PROGRAM_VERSION_SELECT, refreshProgramEvidence, requiredEvidencePaths, snapshotReviewState, type ProgramVersionRow, type SourceItemRow } from "@/lib/admin-review";
import type { Evidence } from "@/lib/domain";
import { supabaseConfig, supabaseRest, type SupabaseConfig } from "@/lib/supabase-rest";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function requireAdmin() {
  const authorization = (await headers()).get("authorization");
  if (!isAdminAuthorization(authorization, process.env.ADMIN_PASSWORD)) throw new Error("Unauthorized");
}

function textField(formData: FormData, key: string, minimum: number, maximum: number): string {
  const value = String(formData.get(key) ?? "").trim();
  if (value.length < minimum || value.length > maximum) throw new Error(`${key} 長度不正確`);
  return value;
}

function idField(formData: FormData, key: string): string {
  const value = String(formData.get(key) ?? "");
  if (!UUID.test(value)) throw new Error(`${key} 格式不正確`);
  return value;
}

function adminConfig(): SupabaseConfig {
  const config = supabaseConfig(true);
  if (!config) throw new Error("Supabase service configuration missing");
  return config;
}

function message(error: unknown): string {
  return (error instanceof Error ? error.message : "Review 操作失敗").slice(0, 180);
}

async function assertPublishable(config: SupabaseConfig, versionId: string, expectedStatus: "publish" | "rollback") {
  const [version] = await supabaseRest<ProgramVersionRow[]>(config,
    `program_versions?select=${PROGRAM_VERSION_SELECT}&id=eq.${versionId}&limit=1`);
  const allowed = expectedStatus === "rollback" ? ["superseded"] : ["draft", "in_review"];
  if (!version || !allowed.includes(version.status)) throw new Error("Version 狀態已改變，請重新整理");
  if (!version.application_url || !version.last_verified_at) throw new Error("缺少官方申請入口或驗證日期");
  const evidenceByPath = new Map(version.field_evidence.map((item) => [item.field_path, item]));
  const missing = requiredEvidencePaths(version.canonical_content).filter((path) => !evidenceByPath.get(path)?.reviewed_at);
  if (missing.length) throw new Error(`Evidence 尚未完成 Review：${missing.slice(0, 3).join(", ")}`);
  const sourceIds = [...new Set(version.field_evidence.map((item) => item.source_id))];
  const encoded = sourceIds.map(encodeURIComponent).join(",");
  const [snapshots, sources] = await Promise.all([
    supabaseRest<Array<{ id: string; source_id: string }>>(config, `source_snapshots?select=id,source_id&content_hash=not.is.null&source_id=in.(${encoded})&order=observed_at.desc`),
    supabaseRest<Array<{ id: string; automation_level: string; last_check_error: unknown }>>(config, `sources?select=id,automation_level,last_check_error&id=in.(${encoded})`),
  ]);
  const latest = new Map<string, string>();
  for (const snapshot of snapshots) if (!latest.has(snapshot.source_id)) latest.set(snapshot.source_id, snapshot.id);
  const sourceState = new Map(sources.map((source) => [source.id, source]));
  if (sources.some((source) => source.automation_level !== "structured_extract" && source.last_check_error != null)) throw new Error("Authority Source 最近一次檢查失敗，禁止 Publish");
  const snapshotIds = [...new Set([...version.field_evidence.map((item) => item.snapshot_id), ...latest.values()])];
  const sourceItems = await supabaseRest<SourceItemRow[]>(config,
    `source_items?select=id,source_id,snapshot_id,external_id,title,canonical_draft,unknown_fields,classification,classification_rationale,review_status&snapshot_id=in.(${snapshotIds.map(encodeURIComponent).join(",")})`);
  const visibleChange = version.field_evidence.some((item) => {
    if (sourceState.get(item.source_id)?.automation_level === "structured_extract") return false;
    const latestSnapshotId = latest.get(item.source_id);
    return !latestSnapshotId || snapshotReviewState(item.source_id, item.snapshot_id, latestSnapshotId, sourceItems) !== "unchanged";
  });
  if (visibleChange) throw new Error("Authority Evidence 的公開文字已變更或缺少可比較資料，禁止 Publish");
}

function taiwanDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export async function createNeedsReviewDraftAction(formData: FormData) {
  await requireAdmin();
  try {
    const config = adminConfig();
    const versionId = idField(formData, "versionId");
    const reviewer = textField(formData, "reviewer", 2, 80);
    const rationale = textField(formData, "rationale", 10, 1_000);
    if (formData.get("canonicalUnchanged") !== "true") throw new Error("必須確認 Canonical content 與 Rules 不需要修改");
    const [version] = await supabaseRest<ProgramVersionRow[]>(config,
      `program_versions?select=${PROGRAM_VERSION_SELECT}&id=eq.${versionId}&status=eq.published&limit=1`);
    if (!version) throw new Error("Published version 已改變，請重新整理");

    const existingVersions = await supabaseRest<Array<{ id: string; version: number; status: string }>>(config,
      `program_versions?select=id,version,status&program_id=eq.${version.program_id}&order=version.desc`);
    if (existingVersions.some((item) => item.status === "draft" || item.status === "in_review")) {
      throw new Error("這個 Program 已有待審核 Draft");
    }

    const sourceIds = [...new Set(version.field_evidence.map((item) => item.source_id))];
    if (sourceIds.length === 0) throw new Error("Program 沒有 Evidence");
    const encoded = sourceIds.map(encodeURIComponent).join(",");
    const [snapshots, sources] = await Promise.all([
      supabaseRest<Array<{ id: string; source_id: string }>>(config,
        `source_snapshots?select=id,source_id&content_hash=not.is.null&source_id=in.(${encoded})&order=observed_at.desc`),
      supabaseRest<Array<{ id: string; automation_level: string; last_check_error: unknown }>>(config,
        `sources?select=id,automation_level,last_check_error&id=in.(${encoded})`),
    ]);
    const latest = new Map<string, string>();
    for (const snapshot of snapshots) if (!latest.has(snapshot.source_id)) latest.set(snapshot.source_id, snapshot.id);
    const sourceState = new Map(sources.map((source) => [source.id, source]));
    if (sourceIds.some((sourceId) => {
      const source = sourceState.get(sourceId);
      return !source || (source.automation_level !== "structured_extract" && (source.last_check_error != null || !latest.has(sourceId)));
    })) {
      throw new Error("Authority Source 缺少最新 successful Snapshot 或最近檢查失敗");
    }

    const staleEvidence = version.field_evidence.filter((item) => {
      const latestSnapshotId = latest.get(item.source_id);
      return latestSnapshotId != null && latestSnapshotId !== item.snapshot_id;
    });
    if (staleEvidence.length === 0) throw new Error("Evidence 已是最新版本，不需要建立 Draft");
    const reviewedAt = new Date();
    const reviewedAtIso = reviewedAt.toISOString();
    const evidenceUpdates = staleEvidence.map((item) => {
      const isStructured = sourceState.get(item.source_id)?.automation_level === "structured_extract";
      return {
        fieldPath: item.field_path,
        evidence: {
          sourceId: item.source_id,
          snapshotId: latest.get(item.source_id)!,
          locator: isStructured ? item.locator : textField(formData, `locator_${item.id}`, 2, 500),
          extractedValue: isStructured ? item.extracted_value : textField(formData, `value_${item.id}`, 2, 4_000),
          reviewedAt: isStructured ? item.reviewed_at ?? reviewedAtIso : reviewedAtIso,
        } satisfies Evidence,
      };
    });
    const canonical = refreshProgramEvidence(version.canonical_content, evidenceUpdates);
    canonical.verifiedAt = taiwanDate(reviewedAt);
    const evidenceByPath = new Map(evidenceUpdates.map((item) => [item.fieldPath, item.evidence]));
    const nextVersion = (existingVersions[0]?.version ?? version.version) + 1;
    const [draft] = await supabaseRest<Array<{ id: string }>>(config, "program_versions", {
      method: "POST",
      body: JSON.stringify({
        program_id: version.program_id,
        version: nextVersion,
        status: "draft",
        coverage: version.coverage,
        title: canonical.title,
        summary: canonical.summary,
        benefit_type: version.benefit_type,
        decision_type: version.decision_type,
        canonical_content: canonical,
        rule_tree: canonical.rule ?? null,
        effective_from: version.effective_from,
        effective_to: version.effective_to,
        application_open: version.application_open,
        application_close: version.application_close,
        application_url: version.application_url,
        last_verified_at: reviewedAtIso,
        next_review_at: version.next_review_at,
      }),
      headers: { Prefer: "return=representation" },
    });
    if (!draft?.id) throw new Error("Draft insert 沒有回傳 id");
    try {
      await supabaseRest(config, "field_evidence", {
        method: "POST",
        body: JSON.stringify(version.field_evidence.map((item) => {
          const updated = evidenceByPath.get(item.field_path);
          return {
            program_version_id: draft.id,
            field_path: item.field_path,
            source_id: item.source_id,
            snapshot_id: updated?.snapshotId ?? item.snapshot_id,
            locator: updated?.locator ?? item.locator,
            extracted_value: updated?.extractedValue ?? item.extracted_value,
            reviewed_at: updated?.reviewedAt ?? item.reviewed_at,
          };
        })),
        headers: { Prefer: "return=minimal" },
      });
      await supabaseRest(config, "reviews", {
        method: "POST",
        body: JSON.stringify({
          program_version_id: draft.id,
          reviewer_name: reviewer,
          action: "resolve_conflict",
          rationale,
          diff: { fromVersion: version.version, refreshedEvidence: staleEvidence.map((item) => item.field_path) },
        }),
        headers: { Prefer: "return=minimal" },
      });
    } catch (error) {
      try {
        await supabaseRest(config, "rpc/reject_program_version", {
          method: "POST",
          body: JSON.stringify({ target_version_id: draft.id, reviewer: "Draft recovery", rationale: "Rejected an incomplete needs-review Draft after Evidence persistence failed." }),
          headers: { Prefer: "return=minimal" },
        });
      } catch {
        // The incomplete Draft remains fail-closed because Publish requires complete reviewed Evidence.
      }
      throw error;
    }
  } catch (error) {
    redirect(`/admin?error=${encodeURIComponent(message(error))}`);
  }
  revalidatePath("/admin");
  redirect(`/admin?notice=${encodeURIComponent("Evidence Draft 已建立，請再次確認後 Publish")}`);
}

async function versionAction(formData: FormData, action: "publish" | "rollback") {
  await requireAdmin();
  try {
    const config = adminConfig();
    const versionId = idField(formData, "versionId");
    const reviewer = textField(formData, "reviewer", 2, 80);
    const rationale = textField(formData, "rationale", 10, 1_000);
    await assertPublishable(config, versionId, action);
    await supabaseRest(config, "rpc/publish_program_version", {
      method: "POST",
      body: JSON.stringify({ target_version_id: versionId, reviewer, rationale, review_action: action }),
      headers: { Prefer: "return=minimal" },
    });
  } catch (error) {
    redirect(`/admin?error=${encodeURIComponent(message(error))}`);
  }
  revalidatePath("/admin");
  updateTag("programs");
  revalidatePath("/", "layout");
  redirect(`/admin?notice=${encodeURIComponent(action === "rollback" ? "Rollback 已發布" : "Version 已發布")}`);
}

export async function publishVersionAction(formData: FormData) {
  return versionAction(formData, "publish");
}

export async function rollbackVersionAction(formData: FormData) {
  return versionAction(formData, "rollback");
}

export async function rejectVersionAction(formData: FormData) {
  await requireAdmin();
  try {
    const versionId = idField(formData, "versionId");
    const reviewer = textField(formData, "reviewer", 2, 80);
    const rationale = textField(formData, "rationale", 10, 1_000);
    await supabaseRest(adminConfig(), "rpc/reject_program_version", {
      method: "POST",
      body: JSON.stringify({ target_version_id: versionId, reviewer, rationale }),
      headers: { Prefer: "return=minimal" },
    });
  } catch (error) {
    redirect(`/admin?error=${encodeURIComponent(message(error))}`);
  }
  revalidatePath("/admin");
  redirect(`/admin?notice=${encodeURIComponent("Version 已退回")}`);
}

export async function resolveActivityReportAction(formData: FormData) {
  await requireAdmin();
  try {
    const reportId = idField(formData, "reportId");
    const status = String(formData.get("reportStatus") ?? "");
    if (status !== "resolved" && status !== "dismissed") throw new Error("回報處理狀態不正確");
    const rationale = textField(formData, "rationale", 5, 1_000);
    await supabaseRest(adminConfig(), `activity_reports?id=eq.${reportId}&status=eq.open`, {
      method: "PATCH",
      body: JSON.stringify({ status, resolution_note: rationale, resolved_at: new Date().toISOString() }),
      headers: { Prefer: "return=minimal" },
    });
  } catch (error) {
    redirect(`/admin?error=${encodeURIComponent(message(error))}`);
  }
  revalidatePath("/admin");
  redirect(`/admin?notice=${encodeURIComponent("活動資料回報已處理")}`);
}
