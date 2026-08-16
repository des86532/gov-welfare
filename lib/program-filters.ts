import { taiwanCityOptions } from "@/data/facts";
import { CATEGORY_KEYS, type ApplicantType, type ProfileFacts, type Program } from "@/lib/domain";

export const PROGRAMS_PER_PAGE = 12;

export const PROGRAM_AVAILABILITY_KEYS = ["open", "upcoming", "closed", "unspecified"] as const;
export type ProgramAvailability = (typeof PROGRAM_AVAILABILITY_KEYS)[number];

export const PROGRAM_SORT_KEYS = ["category", "title", "verified_desc", "deadline"] as const;
export type ProgramSort = (typeof PROGRAM_SORT_KEYS)[number];

const nationwideJurisdictions = new Set(["中央", "全臺", "中央及地方"]);
const regionLabelByValue = new Map(taiwanCityOptions.map((region) => [region.value, region.label]));

export function appliesToRegion(program: Program, regionLabel?: string) {
  return !regionLabel || nationwideJurisdictions.has(program.jurisdiction) || program.jurisdiction === regionLabel;
}

export function getProfileRegionLabels(facts: ProfileFacts) {
  return [...new Set([facts.household_city, facts.residence_city]
    .filter((value): value is string => typeof value === "string")
    .map((value) => regionLabelByValue.get(value))
    .filter((label): label is string => Boolean(label)))];
}

export function filterProgramsForProfileRegion(items: Program[], facts: ProfileFacts) {
  const regionLabels = getProfileRegionLabels(facts);
  if (regionLabels.length === 0) return items;
  return items.filter((program) => regionLabels.some((regionLabel) => appliesToRegion(program, regionLabel)));
}

export function getProgramApplicantTypes(program: Program): ApplicantType[] {
  return program.applicantTypes
    ?? (program.category === "startup" ? ["individual", "startup"] : ["individual"]);
}

export function appliesToApplicant(program: Program, applicant?: ApplicantType) {
  return !applicant || getProgramApplicantTypes(program).includes(applicant);
}

export function getProgramAvailability(program: Program, asOf: string): ProgramAvailability {
  if (program.coverage === "archived" || (program.effectiveTo && program.effectiveTo < asOf)) return "closed";
  if (program.applicationWindow?.close && program.applicationWindow.close < asOf) return "closed";
  if ((program.applicationWindow?.open && program.applicationWindow.open > asOf) || (program.effectiveFrom && program.effectiveFrom > asOf)) return "upcoming";
  if (program.applicationWindow?.open || program.applicationWindow?.close) return "open";
  return "unspecified";
}

export function sortProgramsForCatalog(items: Program[], sort: ProgramSort = "category", asOf = "9999-12-31") {
  return [...items].sort((a, b) => {
    const byTitle = () => a.title.localeCompare(b.title, "zh-Hant-TW");
    if (sort === "title") return byTitle();
    if (sort === "verified_desc") return b.verifiedAt.localeCompare(a.verifiedAt) || byTitle();
    if (sort === "deadline") {
      const rank: Record<ProgramAvailability, number> = { open: 0, upcoming: 1, unspecified: 2, closed: 3 };
      const availabilityOrder = rank[getProgramAvailability(a, asOf)] - rank[getProgramAvailability(b, asOf)];
      return availabilityOrder
        || (a.applicationWindow?.close ?? a.applicationWindow?.open ?? "9999-12-31")
          .localeCompare(b.applicationWindow?.close ?? b.applicationWindow?.open ?? "9999-12-31")
        || byTitle();
    }
    const categoryOrder = CATEGORY_KEYS.indexOf(a.category) - CATEGORY_KEYS.indexOf(b.category);
    return categoryOrder || byTitle();
  });
}

export function paginatePrograms<T>(items: T[], requestedPage: number) {
  const pageCount = Math.max(1, Math.ceil(items.length / PROGRAMS_PER_PAGE));
  const page = Number.isInteger(requestedPage) && requestedPage > 0
    ? Math.min(requestedPage, pageCount)
    : 1;
  const start = (page - 1) * PROGRAMS_PER_PAGE;

  return {
    items: items.slice(start, start + PROGRAMS_PER_PAGE),
    page,
    pageCount,
    from: items.length === 0 ? 0 : start + 1,
    to: Math.min(start + PROGRAMS_PER_PAGE, items.length),
  };
}
