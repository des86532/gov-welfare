"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isAdminAuthorization } from "@/lib/admin-auth";
import { requiredEvidencePaths, type ProgramVersionRow } from "@/lib/admin-review";
import { supabaseConfig, supabaseRest, type SupabaseConfig } from "@/lib/supabase-rest";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLASSIFICATIONS = new Set(["matchable", "descriptive_only", "excluded"]);

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
    `program_versions?select=id,program_id,version,status,coverage,title,summary,benefit_type,decision_type,canonical_content,rule_tree,application_url,last_verified_at,created_at,published_at,programs(stable_key,slug),field_evidence(field_path,source_id,snapshot_id,locator,extracted_value,reviewed_at)&id=eq.${versionId}&limit=1`);
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
    supabaseRest<Array<{ id: string; last_check_error: unknown }>>(config, `sources?select=id,last_check_error&id=in.(${encoded})`),
  ]);
  const latest = new Map<string, string>();
  for (const snapshot of snapshots) if (!latest.has(snapshot.source_id)) latest.set(snapshot.source_id, snapshot.id);
  if (sources.some((source) => source.last_check_error != null)) throw new Error("Source 最近一次檢查失敗，禁止 Publish");
  if (version.field_evidence.some((item) => latest.get(item.source_id) !== item.snapshot_id)) throw new Error("Evidence 不是最新 Snapshot，禁止 Publish");
}

async function assertClassifiable(config: SupabaseConfig, itemId: string, classification: string) {
  const [item] = await supabaseRest<Array<{ source_id: string; snapshot_id: string; canonical_draft: Record<string, unknown> }>>(config,
    `source_items?select=source_id,snapshot_id,canonical_draft&id=eq.${itemId}&limit=1`);
  if (!item) throw new Error("Source item 不存在，請重新整理");
  if (item.canonical_draft.entityType === "opportunity" && classification === "matchable") {
    throw new Error("Activity 不能分類為 matchable，只能 descriptive_only 或 excluded");
  }
  const [snapshots, sources] = await Promise.all([
    supabaseRest<Array<{ id: string }>>(config,
      `source_snapshots?select=id&source_id=eq.${encodeURIComponent(item.source_id)}&content_hash=not.is.null&order=observed_at.desc&limit=1`),
    supabaseRest<Array<{ last_check_error: unknown }>>(config,
      `sources?select=last_check_error&id=eq.${encodeURIComponent(item.source_id)}&limit=1`),
  ]);
  if (!sources[0]) throw new Error("Source registry 不存在，禁止 Classification");
  if (sources[0].last_check_error != null) throw new Error("Source 最近一次檢查失敗，禁止 Classification");
  if (snapshots[0]?.id !== item.snapshot_id) throw new Error("Source item 不是最新 Snapshot，請重新整理");
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

export async function classifySourceItemAction(formData: FormData) {
  await requireAdmin();
  try {
    const sourceItemId = idField(formData, "sourceItemId");
    const classification = String(formData.get("classification") ?? "");
    if (!CLASSIFICATIONS.has(classification)) throw new Error("Classification 不正確");
    const reviewer = textField(formData, "reviewer", 2, 80);
    const rationale = textField(formData, "rationale", 10, 1_000);
    const config = adminConfig();
    await assertClassifiable(config, sourceItemId, classification);
    await supabaseRest(config, "rpc/classify_source_item", {
      method: "POST",
      body: JSON.stringify({ target_item_id: sourceItemId, target_classification: classification, reviewer, rationale }),
      headers: { Prefer: "return=minimal" },
    });
  } catch (error) {
    redirect(`/admin?error=${encodeURIComponent(message(error))}`);
  }
  revalidatePath("/admin");
  revalidatePath("/activities");
  revalidatePath("/api/opportunities");
  redirect(`/admin?notice=${encodeURIComponent("Source item 已分類")}`);
}
