import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import type { DraftSourceItem, RawSnapshot, SourceConfig } from "@/lib/domain";

export interface SourceAdapter {
  fetch(source: SourceConfig): Promise<RawSnapshot>;
  extract(snapshot: RawSnapshot): Promise<DraftSourceItem[]>;
}

function cleanText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

export function contentHashFor(bytes: Buffer, format: SourceConfig["format"]): string {
  if (format !== "html") return createHash("sha256").update(bytes).digest("hex");
  const $ = cheerio.load(bytes.toString("utf8"));
  $("script, style, noscript, svg").remove();
  const text = cleanText($("body").text())
    .replace(/列印時間：?\s*\d{2,3}\/\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}/g, "列印時間")
    .replace(/專區瀏覽人次\s*累計\d+\s*今日\d+/g, "專區瀏覽人次")
    .replace(/累計瀏覽人次：?[\d,]+\s*今日瀏覽人次：?[\d,]+/g, "瀏覽人次")
    .replace(/您來自：\s*[0-9a-f:.]+/gi, "您來自");
  const links = [...new Set($("a[href]").map((_, element) => cleanText($(element).attr("href") ?? "")).get()
    .filter((href) => href && !href.startsWith("#") && !href.startsWith("javascript:")))]
    .sort();
  return createHash("sha256").update(`${text}\n${links.join("\n")}`).digest("hex");
}

export async function fetchSnapshot(source: SourceConfig): Promise<RawSnapshot> {
  let response: Response | undefined;
  let fetchError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      response = await fetch(source.url, {
        headers: { "user-agent": "TaiwanWelfareNavigator/0.1 source-monitor" },
        signal: AbortSignal.timeout(source.fetchTimeoutMs ?? 20_000),
      });
      break;
    } catch (error) {
      fetchError = error;
    }
  }
  if (!response) throw fetchError;
  if (!response.ok) throw new Error(`${source.id}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  const isText = /json|text|html|xml|csv/i.test(contentType) || ["json", "csv", "xml", "html"].includes(source.format);
  const textBody = isText ? bytes.toString("utf8") : "";
  if (/The requested URL was rejected|Access Denied/i.test(textBody) && textBody.length < 10_000) {
    throw new Error(`${source.id}: Source blocked this runner`);
  }
  return {
    sourceId: source.id,
    observedAt: new Date().toISOString(),
    contentType,
    etag: response.headers.get("etag") ?? undefined,
    lastModified: response.headers.get("last-modified") ?? undefined,
    contentHash: contentHashFor(bytes, source.format),
    body: isText ? textBody : bytes.toString("base64"),
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

export function extractMyEGovHtml(body: string, sourceId: string): DraftSourceItem[] {
  const $ = cheerio.load(body);
  $("script, style, nav, footer, header, noscript").remove();
  const title = cleanText($("meta[property='og:title']").attr("content") ?? "")
    || cleanText($("#CCMS_Content h3").first().text())
    || cleanText($("h1").first().text())
    || cleanText($("title").text())
    || "未命名申辦服務";
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
  $(".css-tr").each((_, row) => {
    const heading = cleanText($(row).find(".css-th").first().text());
    const value = cleanText($(row).find(".css-td").first().text());
    if (heading && value) sections[heading] = [...new Set([...(sections[heading] ?? []), value])];
  });
  const uniqueParagraphs = [...new Set($("#CCMS_Content p, #CCMS_Content li, main p, main li, article p, article li").map((_, element) => cleanText($(element).text())).get().filter(Boolean))];
  const warnings = ["application_channel_duplicates_deduplicated", "draft_never_auto_publish"];
  if (Object.keys(sections).length === 0 && uniqueParagraphs.length === 0) warnings.push("content_extraction_empty");
  return [{
    externalId: sourceId,
    title,
    raw: { sourceId },
    canonicalDraft: { title, sections, paragraphs: uniqueParagraphs },
    unknownFields: {},
    reviewStatus: "pending",
    warnings,
  }];
}

export function extractOfficialPage(body: string, sourceId: string): DraftSourceItem[] {
  const $ = cheerio.load(body);
  $("script, style, nav, footer, header, noscript").remove();
  const title = cleanText($("h1").first().text()) || cleanText($("title").text()) || sourceId;
  const publishedText = cleanText($("time, .date, .publish-date, [class*='date']").first().text());
  const mainText = cleanText($("main, article, #content, .content").first().text() || $("body").text());
  const warnings = ["no_automatic_rule_generation", "draft_never_auto_publish"];
  if (!mainText || title === "undefined") warnings.push("content_extraction_empty");
  return [{
    externalId: sourceId,
    title,
    raw: { sourceId },
    canonicalDraft: { title, publishedText: publishedText || null, bodyText: mainText, links: $("a[href]").map((_, element) => $(element).attr("href")).get() },
    unknownFields: {},
    reviewStatus: "pending",
    warnings,
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
