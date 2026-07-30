import { cache } from "react";
import { reviewedOpportunities, type CuratedOpportunity } from "@/data/opportunities";
import { supabaseConfig, supabaseRest } from "@/lib/supabase-rest";

export type OpportunityStatus = "open" | "not_open" | "closed" | "ended" | "unknown";
export type OpportunityReviewState = "reviewed" | "needs_review" | "reviewed_seed";

export type PublicOpportunity = CuratedOpportunity & {
  status: OpportunityStatus;
  reviewState: OpportunityReviewState;
  reviewRationale?: string;
};

type SourceItemState = {
  source_id: string;
  external_id: string;
  snapshot_id: string;
  classification_rationale: string | null;
  created_at: string;
};

type SnapshotState = { id: string; source_id: string };
type SourceState = { id: string; last_check_error: unknown };

export function getOpportunityStatus(item: CuratedOpportunity, now = new Date()): OpportunityStatus {
  const time = now.getTime();
  if (item.eventEnd && new Date(item.eventEnd).getTime() < time) return "ended";
  if (item.applicationOpen && new Date(item.applicationOpen).getTime() > time) return "not_open";
  if (item.applicationClose && new Date(item.applicationClose).getTime() < time) return "closed";
  if (item.applicationOpen && item.applicationClose) return "open";
  if (item.applicationClose) return "open";
  return "unknown";
}

export function opportunityMatchesRegion(item: CuratedOpportunity, region?: string): boolean {
  return !region || item.regions.includes(region);
}

export function opportunityMatchesAudience(item: CuratedOpportunity, audience?: string): boolean {
  return !audience || item.audiences.includes(audience as CuratedOpportunity["audiences"][number]);
}

function withRuntimeState(item: CuratedOpportunity, reviewState: OpportunityReviewState, rationale?: string): PublicOpportunity {
  return { ...item, status: getOpportunityStatus(item), reviewState, ...(rationale ? { reviewRationale: rationale } : {}) };
}

async function loadOpportunities(): Promise<PublicOpportunity[]> {
  const config = supabaseConfig(true);
  if (!config) return reviewedOpportunities.map((item) => withRuntimeState(item, "reviewed_seed"));
  try {
    const sourceIds = [...new Set(reviewedOpportunities.map((item) => item.sourceId))];
    const encoded = sourceIds.map(encodeURIComponent).join(",");
    const [publishedItems, snapshots, sourceStates] = await Promise.all([
      supabaseRest<SourceItemState[]>(config,
        `source_items?select=source_id,external_id,snapshot_id,classification_rationale,created_at&source_id=in.(${encoded})&review_status=eq.published&classification=eq.descriptive_only&order=created_at.desc`,
        { cache: "no-store" }),
      supabaseRest<SnapshotState[]>(config,
        `source_snapshots?select=id,source_id&source_id=in.(${encoded})&content_hash=not.is.null&order=observed_at.desc`,
        { cache: "no-store" }),
      supabaseRest<SourceState[]>(config,
        `sources?select=id,last_check_error&id=in.(${encoded})`,
        { cache: "no-store" }),
    ]);
    if (publishedItems.length === 0) {
      return reviewedOpportunities.map((item) => withRuntimeState(item, "reviewed_seed"));
    }
    const reviewedByKey = new Map<string, SourceItemState>();
    for (const row of publishedItems) {
      const key = `${row.source_id}\n${row.external_id}`;
      if (!reviewedByKey.has(key)) reviewedByKey.set(key, row);
    }
    const latestBySource = new Map<string, string>();
    for (const snapshot of snapshots) if (!latestBySource.has(snapshot.source_id)) latestBySource.set(snapshot.source_id, snapshot.id);
    const sourceErrors = new Map(sourceStates.map((source) => [source.id, source.last_check_error]));

    return reviewedOpportunities.flatMap((item) => {
      const reviewed = reviewedByKey.get(`${item.sourceId}\n${item.externalId}`);
      if (!reviewed) return [];
      const stale = sourceErrors.get(item.sourceId) != null || latestBySource.get(item.sourceId) !== reviewed.snapshot_id;
      return [withRuntimeState(item, stale ? "needs_review" : "reviewed", reviewed.classification_rationale ?? undefined)];
    });
  } catch (error) {
    console.error("Supabase Opportunity read failed; using reviewed Seed fallback", error);
    return reviewedOpportunities.map((item) => withRuntimeState(item, "reviewed_seed"));
  }
}

export const getOpportunities = cache(loadOpportunities);

export async function getOpportunityBySlug(slug: string) {
  return (await getOpportunities()).find((item) => item.slug === slug);
}
