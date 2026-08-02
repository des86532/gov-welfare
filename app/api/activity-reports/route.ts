import { NextResponse } from "next/server";
import { parseActivityReport } from "@/lib/activity-reports";
import { supabaseConfig, supabaseRest } from "@/lib/supabase-rest";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 10_000) return NextResponse.json({ error: "回報內容過大" }, { status: 413 });
    const config = supabaseConfig(true);
    if (!config) return NextResponse.json({ error: "回報服務暫時無法使用" }, { status: 503 });
    const report = parseActivityReport(await request.json());
    await supabaseRest(config, "activity_reports", {
      method: "POST",
      body: JSON.stringify({ opportunity_slug: report.opportunitySlug, reason: report.reason, detail: report.detail }),
      headers: { Prefer: "return=minimal" },
    });
    return NextResponse.json({ ok: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "回報失敗";
    return NextResponse.json({ error: message.slice(0, 180) }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
