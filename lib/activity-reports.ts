import { reviewedOpportunities } from "@/data/opportunities";
import { ACTIVITY_REPORT_REASONS, type ActivityReportReason } from "@/lib/activity-report-shared";

const knownSlugs = new Set(reviewedOpportunities.map((item) => item.slug));

export function parseActivityReport(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("回報內容格式錯誤");
  const input = value as Record<string, unknown>;
  if (input.website) throw new Error("回報未通過檢查");
  const opportunitySlug = String(input.opportunitySlug ?? "");
  const reason = String(input.reason ?? "") as ActivityReportReason;
  const detail = String(input.detail ?? "").trim();
  if (!knownSlugs.has(opportunitySlug)) throw new Error("找不到這筆活動");
  if (!ACTIVITY_REPORT_REASONS.includes(reason)) throw new Error("請選擇回報原因");
  if (detail.length > 1_000) throw new Error("補充說明不可超過 1000 字");
  if (reason === "other" && detail.length < 5) throw new Error("請簡單說明問題");
  return { opportunitySlug, reason, detail: detail || null };
}
