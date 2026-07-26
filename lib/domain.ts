export const CATEGORY_KEYS = [
  "health",
  "employment",
  "education",
  "youth_overseas",
  "startup",
  "family",
  "housing",
  "social_aid",
  "care",
  "public_service",
] as const;

export type CategoryKey = (typeof CATEGORY_KEYS)[number];

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  health: "健康與醫療",
  employment: "就業與職能",
  education: "教育與進修",
  youth_overseas: "青年與海外",
  startup: "創業與融資",
  family: "育兒與家庭",
  housing: "住宅與生活",
  social_aid: "社會救助",
  care: "高齡、身障與長照",
  public_service: "交通、文化與公共服務",
};

export type CoverageLevel =
  | "catalog_only"
  | "descriptive_only"
  | "matchable"
  | "needs_review"
  | "archived";

export type DecisionType =
  | "entitlement"
  | "official_record_check"
  | "professional_assessment"
  | "competitive_selection"
  | "loan_credit_review"
  | "automatic";

export type BenefitType =
  | "cash"
  | "grant"
  | "loan"
  | "interest_subsidy"
  | "fee_reduction"
  | "free_service"
  | "training"
  | "scholarship"
  | "guarantee"
  | "care_service";

export type SourceFormat = "json" | "csv" | "xml" | "ods" | "html" | "pdf" | "manual";
export type SourceRole = "discovery" | "eligibility" | "application" | "legal_basis" | "supplement";
export type AutomationLevel = "structured_extract" | "text_extract" | "change_detection_only" | "manual";

export type Evidence = {
  sourceId: string;
  snapshotId: string;
  locator: string;
  extractedValue: string;
  reviewedAt?: string;
};

export type AtomicOperator =
  | "eq"
  | "neq"
  | "in"
  | "gte"
  | "gt"
  | "lte"
  | "lt"
  | "between"
  | "date_on_or_before_years_ago";

export type AtomicRule = {
  field: string;
  operator: AtomicOperator;
  value: string | number | boolean | Array<string | number>;
  label: string;
  evidence: Evidence;
};

export type RuleNode = AtomicRule | { all: RuleNode[] } | { any: RuleNode[] };
export type FactValue = string | number | boolean | null | undefined;
export type ProfileFacts = Record<string, FactValue>;
export type TruthValue = true | false | "unknown";

export type ApplicationWindow = {
  open?: string;
  close?: string;
  label: string;
};

export type Program = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: CategoryKey;
  tags: string[];
  benefitType: BenefitType;
  benefitSummary: string;
  coverage: CoverageLevel;
  decisionType: DecisionType;
  jurisdiction: "中央" | "桃園市";
  authority: string;
  officialUrl: string;
  applicationUrl?: string;
  verifiedAt: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  applicationWindow?: ApplicationWindow;
  requestedFacts: string[];
  rule?: RuleNode;
  caveats: string[];
  documents: string[];
  methods: string[];
  evidence: Evidence[];
};

export type FactDefinition = {
  key: string;
  type: "boolean" | "enum" | "number" | "date";
  label: string;
  help?: string;
  sensitive: boolean;
  core?: boolean;
  options?: Array<{ value: string; label: string }>;
};

export type SourceConfig = {
  id: string;
  name: string;
  authority: string;
  jurisdiction: "中央" | "桃園市";
  url: string;
  publicUrl?: string;
  format: SourceFormat;
  roles: SourceRole[];
  automation: AutomationLevel;
  adapterKey: "taoyuan_welfare_json" | "myegov_html" | "official_page" | "document_monitor" | "manual";
  checkEveryHours: number | null;
  crawlerRequired: boolean;
  status: "active" | "blocked" | "archived";
  catalogModifiedAt?: string;
  resourceModifiedAt?: string;
  lastVerifiedAt: string;
  note?: string;
};

export type RawSnapshot = {
  sourceId: string;
  observedAt: string;
  contentType: string;
  etag?: string;
  lastModified?: string;
  contentHash: string;
  body: string;
  status: number;
};

export type DraftSourceItem = {
  externalId: string;
  title: string;
  raw: Record<string, unknown>;
  canonicalDraft: Record<string, unknown>;
  unknownFields: Record<string, unknown>;
  reviewStatus: "pending";
  warnings: string[];
};
