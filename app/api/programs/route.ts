import { getPrograms } from "@/lib/program-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const programs = await getPrograms();
  const published = programs.filter((program) => !["catalog_only", "archived"].includes(program.coverage));
  const reviewedAt = published.map((program) => program.verifiedAt).sort().at(-1) ?? null;
  return Response.json({ data: published, meta: { count: published.length, coverage: "central-seed+taoyuan-pilot", reviewedAt } }, {
    headers: { "Cache-Control": "no-store" },
  });
}
