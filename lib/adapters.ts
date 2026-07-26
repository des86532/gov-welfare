import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import type { DraftSourceItem, RawSnapshot, SourceConfig } from "@/lib/domain";

export interface SourceAdapter {
  fetch(source: SourceConfig): Promise<RawSnapshot>;
  extract(snapshot: RawSnapshot): Promise<DraftSourceItem[]>;
}

export async function fetchSnapshot(source: SourceConfig): Promise<RawSnapshot> {
  const response = await fetch(source.url, {
    headers: { "user-agent": "TaiwanWelfareNavigator/0.1 source-monitor" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`${source.id}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  const isText = /json|text|html|xml|csv/i.test(contentType) || ["json", "csv", "xml", "html"].includes(source.format);
  return {
    sourceId: source.id,
    observedAt: new Date().toISOString(),
    contentType,
    etag: response.headers.get("etag") ?? undefined,
    lastModified: response.headers.get("last-modified") ?? undefined,
    contentHash: createHash("sha256").update(bytes).digest("hex"),
    body: isText ? bytes.toString("utf8") : bytes.toString("base64"),
    status: response.status,
  };
}

const taoyuanKnownFields = new Set([
  "policyName",
  "policyCategory",
  "welfareIdentity",
  "dataPublishedDate",
  "agencyName",
  "divisionName",
  "policyDescription",
  "eligibilityCriteria",
  "applicationMethod",
  "processingTime",
  "applicationLocation",
  "requiredDocuments",
  "sourceUrl",
  "contactUnit",
  "市話",
  "contactExtension",
  "competentAuthorityUrl",
  "tyeserviceurl",
]);

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function extractTaoyuanRows(body: string): DraftSourceItem[] {
  const parsed: unknown = JSON.parse(body.replace(/^\uFEFF/, ""));
  if (!Array.isArray(parsed)) throw new Error("桃園 Source format changed: expected a JSON array");
  return parsed.map((value, index) => {
    const row = objectRecord(value);
    if (!row || typeof row.policyName !== "string") throw new Error(`桃園 row ${index} 缺少 policyName`);
    const unknownFields = Object.fromEntries(Object.entries(row).filter(([key]) => !taoyuanKnownFields.has(key)));
    return {
      externalId: typeof row.sourceUrl === "string" ? row.sourceUrl : `${index}:${row.policyName}`,
      title: row.policyName,
      raw: row,
      canonicalDraft: {
        title: row.policyName,
        rawCategory: row.policyCategory ?? null,
        tags: typeof row.welfareIdentity === "string" ? [row.welfareIdentity] : [],
        summary: row.policyDescription ?? null,
        eligibilityText: row.eligibilityCriteria ?? null,
        applicationMethod: row.applicationMethod ?? null,
        applicationLocation: row.applicationLocation ?? null,
        documentsText: row.requiredDocuments ?? null,
        authority: row.agencyName ?? null,
        authorityUrl: row.competentAuthorityUrl ?? null,
        applicationUrl: row.sourceUrl ?? null,
        resourceModifiedAt: row.dataPublishedDate ?? null,
      },
      unknownFields,
      reviewStatus: "pending" as const,
      warnings: ["rawCategory_not_trusted", "draft_never_auto_publish"],
    };
  });
}

const headingSelector = "h1, h2, h3, h4";

function cleanText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

export function extractMyEGovHtml(body: string, sourceId: string): DraftSourceItem[] {
  const $ = cheerio.load(body);
  $("script, style, nav, footer, header, noscript").remove();
  const title = cleanText($("h1").first().text()) || cleanText($("title").text()) || "未命名申辦服務";
  const sections: Record<string, string[]> = {};
  $(headingSelector).each((_, element) => {
    const heading = cleanText($(element).text());
    if (!heading || element.tagName === "h1") return;
    const values: string[] = [];
    let sibling = $(element).next();
    while (sibling.length && !sibling.is(headingSelector)) {
      const text = cleanText(sibling.text());
      if (text && !values.includes(text)) values.push(text);
      sibling = sibling.next();
    }
    if (values.length > 0) sections[heading] = [...new Set([...(sections[heading] ?? []), ...values])];
  });
  const uniqueParagraphs = [...new Set($("main p, main li, article p, article li").map((_, element) => cleanText($(element).text())).get().filter(Boolean))];
  return [{
    externalId: sourceId,
    title,
    raw: { html: body },
    canonicalDraft: { title, sections, paragraphs: uniqueParagraphs },
    unknownFields: {},
    reviewStatus: "pending",
    warnings: ["application_channel_duplicates_deduplicated", "draft_never_auto_publish"],
  }];
}

export function extractOfficialPage(body: string, sourceId: string): DraftSourceItem[] {
  const $ = cheerio.load(body);
  $("script, style, nav, footer, header, noscript").remove();
  const title = cleanText($("h1").first().text()) || cleanText($("title").text()) || sourceId;
  const publishedText = cleanText($("time, .date, .publish-date, [class*='date']").first().text());
  const mainText = cleanText($("main, article, #content, .content").first().text() || $("body").text());
  return [{
    externalId: sourceId,
    title,
    raw: { html: body },
    canonicalDraft: { title, publishedText: publishedText || null, bodyText: mainText, links: $("a[href]").map((_, element) => $(element).attr("href")).get() },
    unknownFields: {},
    reviewStatus: "pending",
    warnings: ["no_automatic_rule_generation", "draft_never_auto_publish"],
  }];
}

class TaoyuanJsonAdapter implements SourceAdapter {
  fetch = fetchSnapshot;
  async extract(snapshot: RawSnapshot) { return extractTaoyuanRows(snapshot.body); }
}

class MyEGovHtmlAdapter implements SourceAdapter {
  fetch = fetchSnapshot;
  async extract(snapshot: RawSnapshot) { return extractMyEGovHtml(snapshot.body, snapshot.sourceId); }
}

class OfficialPageAdapter implements SourceAdapter {
  fetch = fetchSnapshot;
  async extract(snapshot: RawSnapshot) { return extractOfficialPage(snapshot.body, snapshot.sourceId); }
}

class DocumentMonitorAdapter implements SourceAdapter {
  fetch = fetchSnapshot;
  async extract(snapshot: RawSnapshot): Promise<DraftSourceItem[]> {
    return [{
      externalId: snapshot.sourceId,
      title: snapshot.sourceId,
      raw: { contentHash: snapshot.contentHash, contentType: snapshot.contentType },
      canonicalDraft: { contentHash: snapshot.contentHash, textExtractionStatus: "not_attempted" },
      unknownFields: {},
      reviewStatus: "pending",
      warnings: ["hash_only", "content_change_requires_review"],
    }];
  }
}

class ManualAdapter implements SourceAdapter {
  async fetch(source: SourceConfig): Promise<RawSnapshot> {
    throw new Error(`${source.id}: manual source cannot be fetched`);
  }
  async extract(): Promise<DraftSourceItem[]> { return []; }
}

export function createAdapter(source: SourceConfig): SourceAdapter {
  switch (source.adapterKey) {
    case "taoyuan_welfare_json": return new TaoyuanJsonAdapter();
    case "myegov_html": return new MyEGovHtmlAdapter();
    case "official_page": return new OfficialPageAdapter();
    case "document_monitor": return new DocumentMonitorAdapter();
    case "manual": return new ManualAdapter();
  }
}
