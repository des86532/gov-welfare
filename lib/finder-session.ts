import type { ProfileFacts } from "@/lib/domain";

export type FinderSession = { facts: ProfileFacts; showAllFollowups: boolean; step: 1 | 2 | 3 };

export function parseFinderSession(value: string | null): FinderSession | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { facts?: unknown; showAllFollowups?: unknown; step?: unknown };
    if (!parsed || typeof parsed !== "object" || ![1, 2, 3].includes(Number(parsed.step)) || !parsed.facts || typeof parsed.facts !== "object" || Array.isArray(parsed.facts)) return null;
    const facts = Object.fromEntries(Object.entries(parsed.facts).filter(([, item]) => ["boolean", "number", "string"].includes(typeof item))) as ProfileFacts;
    return { facts, showAllFollowups: parsed.showAllFollowups === true, step: Number(parsed.step) as 1 | 2 | 3 };
  } catch {
    return null;
  }
}
