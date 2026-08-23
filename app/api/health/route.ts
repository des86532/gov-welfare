import { getPrograms } from "@/lib/program-store";
import { supabaseConfig, supabaseRest } from "@/lib/supabase-rest";

type SourceHealth = { id: string; last_check_error: unknown };

export async function GET() {
  const config = supabaseConfig(true);
  if (!config) return Response.json({ ok: false, status: "unconfigured", service: "taiwan-welfare-navigator" }, { status: 503 });
  try {
    const [programs, sources] = await Promise.all([
      getPrograms(),
      supabaseRest<SourceHealth[]>(config, "sources?select=id,last_check_error&status=eq.active", { cache: "no-store" }),
    ]);
    const failedSources = sources.filter((source) => source.last_check_error != null).map((source) => source.id);
    const ok = programs.length > 0;
    return Response.json({
      ok,
      status: ok ? "healthy" : "degraded",
      service: "taiwan-welfare-navigator",
      programs: { total: programs.length },
      sources: { active: sources.length, failed: failedSources },
    }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, status: "dependency_unavailable", service: "taiwan-welfare-navigator" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
