import type { Program } from "@/lib/domain";

export function appliesToRegion(program: Program, regionLabel?: string) {
  return !regionLabel || program.jurisdiction === "中央" || program.jurisdiction === regionLabel;
}
