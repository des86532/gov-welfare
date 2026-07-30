import { NextResponse } from "next/server";
import { getOpportunities } from "@/lib/opportunity-store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ opportunities: await getOpportunities() }, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
  });
}
