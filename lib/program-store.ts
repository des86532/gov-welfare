import { cache } from "react";
import { unstable_cache } from "next/cache";
import { programs as seedPrograms } from "@/data/programs";
import { CATEGORY_KEYS, type Program } from "@/lib/domain";
import { supabaseConfig, supabaseRest } from "@/lib/supabase-rest";

type PublishedVersion = {
  canonical_content: unknown;
  field_evidence: Array<{ source_id: string; snapshot_id: string }>;
};

type SnapshotState = {
  id: string;
  source_id: string;
};

type SourceState = { id: string; last_check_error: unknown };

function isProgram(value: unknown): value is Program {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<Program>;
  return typeof item.id === "string"
    && typeof item.slug === "string"
    && typeof item.title === "string"
    && typeof item.summary === "string"
    && typeof item.category === "string"
    && CATEGORY_KEYS.includes(item.category as Program["category"])
    && Array.isArray(item.evidence);
}

async function loadPrograms(): Promise<Program[]> {
  const publicConfig = supabaseConfig(false);
  if (!publicConfig) return seedPrograms;
  try {
    const versions = await supabaseRest<PublishedVersion[]>(
      publicConfig,
      "program_versions?select=canonical_content,field_evidence(source_id,snapshot_id)&status=eq.published",
      { cache: "no-store" },
    );
    const published = versions.flatMap((row) => isProgram(row.canonical_content)
      ? [{ program: row.canonical_content, evidence: row.field_evidence }]
      : []);
    if (published.length === 0) return seedPrograms;

    const serviceConfig = supabaseConfig(true);
    if (serviceConfig) {
      const sourceIds = [...new Set(versions.flatMap((row) => row.field_evidence.map((item) => item.source_id)))];
      const [latest, sourceStates] = await Promise.all([
        supabaseRest<SnapshotState[]>(
          serviceConfig,
          `source_snapshots?select=id,source_id&content_hash=not.is.null&source_id=in.(${sourceIds.map(encodeURIComponent).join(",")})&order=observed_at.desc`,
          { cache: "no-store" },
        ),
        supabaseRest<SourceState[]>(
          serviceConfig,
          `sources?select=id,last_check_error&id=in.(${sourceIds.map(encodeURIComponent).join(",")})`,
          { cache: "no-store" },
        ),
      ]);
      const latestBySource = new Map<string, SnapshotState>();
      for (const snapshot of latest) if (!latestBySource.has(snapshot.source_id)) latestBySource.set(snapshot.source_id, snapshot);
      const errors = new Map(sourceStates.map((source) => [source.id, source.last_check_error]));
      for (const item of published) {
        const evidence = item.evidence;
        const stale = evidence.some((item) => {
          const newest = latestBySource.get(item.source_id);
          return !newest || errors.get(item.source_id) != null || newest.id !== item.snapshot_id;
        });
        if (stale) item.program = { ...item.program, coverage: "needs_review" };
      }
    }

    const merged = new Map(seedPrograms.map((program) => [program.slug, program]));
    for (const { program } of published) merged.set(program.slug, program);
    return [...merged.values()];
  } catch (error) {
    console.error("Supabase Program read failed; using reviewed Seed fallback", error);
    return seedPrograms;
  }
}

const getProgramsCached = unstable_cache(loadPrograms, ["public-programs-v1"], { revalidate: 300, tags: ["programs"] });
export const getPrograms = cache(getProgramsCached);

export async function getProgramBySlug(slug: string) {
  return (await getPrograms()).find((program) => program.slug === slug);
}
