export const ACTIVITY_REPORT_REASONS = ["expired", "broken_link", "incorrect_info", "incorrect_eligibility", "other"] as const;
export type ActivityReportReason = typeof ACTIVITY_REPORT_REASONS[number];

export const activityReportReasonLabels: Record<ActivityReportReason, string> = {
  expired: "活動或報名已過期",
  broken_link: "官方連結失效",
  incorrect_info: "日期、地點或費用錯誤",
  incorrect_eligibility: "參加資格錯誤",
  other: "其他問題",
};
