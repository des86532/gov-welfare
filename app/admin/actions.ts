"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isAdminAuthorization } from "@/lib/admin-auth";
import { supabaseConfig, supabaseRest } from "@/lib/supabase-rest";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function requireAdmin() {
  const authorization = (await headers()).get("authorization");
  if (!isAdminAuthorization(authorization, process.env.ADMIN_PASSWORD)) throw new Error("Unauthorized");
}

function message(error: unknown): string {
  return (error instanceof Error ? error.message : "操作失敗").slice(0, 180);
}

export async function resolveActivityReportAction(formData: FormData) {
  await requireAdmin();
  try {
    const config = supabaseConfig(true);
    if (!config) throw new Error("Supabase service configuration missing");
    const reportId = String(formData.get("reportId") ?? "");
    if (!UUID.test(reportId)) throw new Error("reportId 格式不正確");
    const status = String(formData.get("reportStatus") ?? "");
    if (status !== "resolved" && status !== "dismissed") throw new Error("回報處理狀態不正確");
    const rationale = String(formData.get("rationale") ?? "").trim();
    if (rationale.length < 5 || rationale.length > 1_000) throw new Error("處理紀錄長度不正確");
    await supabaseRest(config, `activity_reports?id=eq.${reportId}&status=eq.open`, {
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
