import type {
  AtomicRule,
  DecisionType,
  ProfileFacts,
  Program,
  RuleNode,
  TruthValue,
} from "@/lib/domain";

export type RuleReason = {
  label: string;
  truth: TruthValue;
  field: string;
  sourceId: string;
  locator: string;
};

export type RuleEvaluation = {
  truth: TruthValue;
  reasons: RuleReason[];
};

export type MatchStatus =
  | "eligible"
  | "possible"
  | "ineligible"
  | "review_required"
  | "closed"
  | "needs_review"
  | "descriptive";

export type ProgramMatch = {
  program: Program;
  status: MatchStatus;
  evaluation: RuleEvaluation;
};

const REVIEW_DECISIONS = new Set<DecisionType>([
  "competitive_selection",
  "loan_credit_review",
  "professional_assessment",
  "official_record_check",
]);

export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  eligible: "基本條件符合",
  possible: "可能符合，尚缺資料",
  ineligible: "目前有條件不符",
  review_required: "符合申請門檻，仍需官方審查",
  closed: "本期尚未開放／已截止",
  needs_review: "官方資料異動，等待複核",
  descriptive: "其他可能方案",
};

function ageOnDate(birthDate: string, asOf: string): number | undefined {
  const birth = new Date(`${birthDate}T00:00:00Z`);
  const today = new Date(`${asOf}T00:00:00Z`);
  if (Number.isNaN(birth.getTime()) || birth > today) return undefined;
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const birthdayPassed =
    today.getUTCMonth() > birth.getUTCMonth() ||
    (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() >= birth.getUTCDate());
  if (!birthdayPassed) age -= 1;
  return age;
}

export function factValue(field: string, facts: ProfileFacts, asOf: string) {
  if (field === "age") {
    const birthDate = facts.birth_date;
    return typeof birthDate === "string" && birthDate ? ageOnDate(birthDate, asOf) : undefined;
  }
  return facts[field];
}

function compareAtomic(rule: AtomicRule, facts: ProfileFacts, asOf: string): TruthValue {
  const actual = factValue(rule.field, facts, asOf);
  if (actual === undefined || actual === null || actual === "") return "unknown";

  const expected = rule.value;
  switch (rule.operator) {
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "in":
      return Array.isArray(expected) && expected.includes(actual as never);
    case "gte":
      return typeof actual === "number" && typeof expected === "number" ? actual >= expected : false;
    case "gt":
      return typeof actual === "number" && typeof expected === "number" ? actual > expected : false;
    case "lte":
      return typeof actual === "number" && typeof expected === "number" ? actual <= expected : false;
    case "lt":
      return typeof actual === "number" && typeof expected === "number" ? actual < expected : false;
    case "between": {
      if (typeof actual !== "number" || !Array.isArray(expected)) return false;
      const [minimum, maximum] = expected;
      return typeof minimum === "number" && typeof maximum === "number"
        ? actual >= minimum && actual <= maximum
        : false;
    }
    case "date_within_past_years": {
      if (typeof actual !== "string" || typeof expected !== "number") return false;
      const date = new Date(`${actual}T00:00:00Z`);
      const today = new Date(`${asOf}T00:00:00Z`);
      const threshold = new Date(today);
      if (Number.isNaN(date.getTime())) return false;
      threshold.setUTCFullYear(threshold.getUTCFullYear() - expected);
      return date >= threshold && date <= today;
    }
    case "date_on_or_before_years_ago": {
      if (typeof actual !== "string" || typeof expected !== "number") return false;
      const date = new Date(`${actual}T00:00:00Z`);
      const threshold = new Date(`${asOf}T00:00:00Z`);
      if (Number.isNaN(date.getTime())) return false;
      threshold.setUTCFullYear(threshold.getUTCFullYear() - expected);
      return date <= threshold;
    }
  }
}

function combineAll(values: TruthValue[]): TruthValue {
  if (values.includes(false)) return false;
  if (values.includes("unknown")) return "unknown";
  return true;
}

function combineAny(values: TruthValue[]): TruthValue {
  if (values.includes(true)) return true;
  if (values.includes("unknown")) return "unknown";
  return false;
}

export function evaluateRule(rule: RuleNode, facts: ProfileFacts, asOf = todayInTaiwan()): RuleEvaluation {
  if ("all" in rule) {
    const children = rule.all.map((child) => evaluateRule(child, facts, asOf));
    return { truth: combineAll(children.map((child) => child.truth)), reasons: children.flatMap((child) => child.reasons) };
  }
  if ("any" in rule) {
    const children = rule.any.map((child) => evaluateRule(child, facts, asOf));
    return { truth: combineAny(children.map((child) => child.truth)), reasons: children.flatMap((child) => child.reasons) };
  }
  const truth = compareAtomic(rule, facts, asOf);
  return {
    truth,
    reasons: [{
      label: rule.label,
      truth,
      field: rule.field,
      sourceId: rule.evidence.sourceId,
      locator: rule.evidence.locator,
    }],
  };
}

export function todayInTaiwan(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function matchProgram(program: Program, facts: ProfileFacts, asOf = todayInTaiwan()): ProgramMatch {
  const emptyEvaluation: RuleEvaluation = { truth: "unknown", reasons: [] };
  if (program.coverage === "needs_review") return { program, status: "needs_review", evaluation: emptyEvaluation };
  if (program.coverage !== "matchable" || !program.rule) {
    return { program, status: program.coverage === "archived" ? "closed" : "descriptive", evaluation: emptyEvaluation };
  }

  const window = program.applicationWindow;
  if ((window?.open && asOf < window.open) || (window?.close && asOf > window.close)) {
    return { program, status: "closed", evaluation: emptyEvaluation };
  }

  const evaluation = evaluateRule(program.rule, facts, asOf);
  if (evaluation.truth === false) return { program, status: "ineligible", evaluation };
  if (evaluation.truth === "unknown") return { program, status: "possible", evaluation };
  return {
    program,
    status: REVIEW_DECISIONS.has(program.decisionType) ? "review_required" : "eligible",
    evaluation,
  };
}

export function collectRuleFields(rule?: RuleNode): string[] {
  if (!rule) return [];
  if ("all" in rule) return [...new Set(rule.all.flatMap(collectRuleFields))];
  if ("any" in rule) return [...new Set(rule.any.flatMap(collectRuleFields))];
  return [rule.field];
}
