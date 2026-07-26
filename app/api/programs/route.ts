import { programs } from "@/data/programs";

export function GET() {
  const published = programs.filter((program) => ["matchable", "descriptive_only"].includes(program.coverage));
  return Response.json({ data: published, meta: { count: published.length, coverage: "central-seed+taoyuan-pilot", reviewedAt: "2026-07-26" } }, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
