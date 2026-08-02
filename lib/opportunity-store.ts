import { cache } from "react";
import { reviewedOpportunities, type CuratedOpportunity } from "@/data/opportunities";

export type OpportunityStatus = "open" | "not_open" | "closed" | "ended" | "unknown";
export type PublicOpportunity = CuratedOpportunity & {
  status: OpportunityStatus;
};

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

function withRuntimeState(item: CuratedOpportunity): PublicOpportunity {
  return { ...item, status: getOpportunityStatus(item) };
}

async function loadOpportunities(): Promise<PublicOpportunity[]> {
  return reviewedOpportunities.map(withRuntimeState);
}

export const getOpportunities = cache(loadOpportunities);

export async function getOpportunityBySlug(slug: string) {
  return (await getOpportunities()).find((item) => item.slug === slug);
}
