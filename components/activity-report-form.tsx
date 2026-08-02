"use client";

import { useState, type FormEvent } from "react";
import { ACTIVITY_REPORT_REASONS, activityReportReasonLabels } from "@/lib/activity-report-shared";

export function ActivityReportForm({ opportunitySlug }: { opportunitySlug: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setState("sending");
    try {
      const data = new FormData(form);
      const response = await fetch("/api/activity-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunitySlug, reason: data.get("reason"), detail: data.get("detail"), website: data.get("website") }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "回報失敗，請稍後再試");
      form.reset();
      setMessage("謝謝你的回報，我們會在 Admin 中確認並修正資料。");
      setState("sent");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "回報失敗，請稍後再試");
      setState("error");
    }
  }

  return (
    <details className="activity-report">
      <summary>資料有誤？回報給我們</summary>
      <form onSubmit={submit}>
        <label>問題類型<select name="reason" required defaultValue=""><option value="" disabled>請選擇</option>{ACTIVITY_REPORT_REASONS.map((reason) => <option key={reason} value={reason}>{activityReportReasonLabels[reason]}</option>)}</select></label>
        <label>補充說明（選填）<textarea name="detail" maxLength={1_000} placeholder="例如：官方頁顯示報名已於 8 月 1 日截止" /></label>
        <label className="report-honeypot" aria-hidden="true">網站<input name="website" tabIndex={-1} autoComplete="off" /></label>
        <button className="button button-small" disabled={state === "sending"}>{state === "sending" ? "送出中…" : "送出回報"}</button>
        {message ? <p className={`report-message ${state}`} role={state === "error" ? "alert" : "status"}>{message}</p> : null}
      </form>
    </details>
  );
}
