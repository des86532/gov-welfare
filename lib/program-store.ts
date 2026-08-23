import { cache } from "react";
import { unstable_cache } from "next/cache";
import { programs as seedPrograms } from "@/data/programs";
import { CATEGORY_KEYS, type Program } from "@/lib/domain";
import { supabaseConfig, supabaseRest } from "@/lib/supabase-rest";

type PublishedVersion = {
  canonical_content: unknown;
  field_evidence: Array<{ source_id: string; snapshot_id: string }>;
};

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
      ? [{
        program: row.canonical_content.coverage === "needs_review"
          ? { ...row.canonical_content, coverage: "descriptive_only" as const }
          : row.canonical_content,
      }]
      : []);
    if (published.length === 0) return seedPrograms;

    const merged = new Map(seedPrograms.map((program) => [program.slug, program]));
    for (const { program } of published) merged.set(program.slug, program);
    return [...merged.values()];
  } catch (error) {
    console.error("Supabase Program read failed; using Repository Seed fallback", error);
    return seedPrograms;
  }
}

const getProgramsCached = unstable_cache(loadPrograms, ["public-programs-v2"], { revalidate: 300, tags: ["programs"] });
export const getPrograms = cache(getProgramsCached);

export async function getProgramBySlug(slug: string) {
  return (await getPrograms()).find((program) => program.slug === slug);
}
