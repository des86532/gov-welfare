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

export function validateSnapshotFormat(source: SourceConfig, bytes: Buffer, contentType: string): void {
  if (source.format === "pdf" && bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error(`${source.id}: expected PDF but received ${contentType}`);
  }
}

export async function fetchSnapshot(source: SourceConfig): Promise<RawSnapshot> {
  let response: Response | undefined;
  let fetchError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await fetch(source.url, {
        headers: { "user-agent": "TaiwanWelfareNavigator/0.1 source-monitor" },
        signal: AbortSignal.timeout(source.fetchTimeoutMs ?? 20_000),
      });
      break;
    } catch (error) {
      fetchError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 750 * (2 ** attempt)));
    }
  }
  if (!response) throw fetchError;
  if (!response.ok) throw new Error(`${source.id}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  validateSnapshotFormat(source, bytes, contentType);
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

export function parseCsvRecords(body: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (quoted) {
      if (character === '"' && body[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"' && field === "") quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (quoted) throw new Error("CSV Source format changed: unterminated quoted field");
  row.push(field.replace(/\r$/, ""));
  if (row.some((value) => value !== "")) rows.push(row);
  const headers = rows.shift()?.map((value) => value.replace(/^\uFEFF/, "").trim()) ?? [];
  if (headers.length === 0 || headers.some((header) => !header) || new Set(headers).size !== headers.length) throw new Error("CSV Source format changed: invalid header");
  return rows.map((values, index) => {
    if (values.length !== headers.length) throw new Error(`CSV Source format changed: row ${index} has ${values.length} fields, expected ${headers.length}`);
    return Object.fromEntries(headers.map((header, valueIndex) => [header, values[valueIndex]]));
  });
}

const newTaipeiFields = new Set(["name", "service_desc", "cont1", "cont2", "cont3", "cont4", "cont5", "cont6", "cont7", "date_created", "last_updated", "c", "curl", "id"]);

export function extractNewTaipeiRows(body: string): DraftSourceItem[] {
  return parseCsvRecords(body).map((row, index) => {
    if (!row.name) throw new Error(`新北 row ${index} 缺少 name`);
    const opaqueSections = Object.fromEntries(["cont1", "cont2", "cont3", "cont4", "cont5", "cont6", "cont7"]
      .map((key) => [key, cleanText(row[key] ?? "")])
      .filter(([, value]) => value));
    return {
      externalId: row.id || row.curl || `${index}:${row.name}`,
      title: cleanText(row.name),
      raw: row,
      canonicalDraft: {
        title: cleanText(row.name),
        summary: cleanText(row.service_desc ?? ""),
        opaqueSections,
        applicationUrl: cleanText(row.curl ?? "") || null,
        createdAt: row.date_created || null,
        resourceModifiedAt: row.last_updated || null,
      },
      unknownFields: Object.fromEntries(Object.entries(row).filter(([key]) => !newTaipeiFields.has(key))),
      reviewStatus: "pending",
      warnings: ["opaque_cont_fields_require_review", "draft_never_auto_publish"],
    };
  });
}

const taipeiFields = new Set(["序號", "補助名稱", "補助對象年齡下限", "補助對象年齡上限", "設籍條件", "居住日數是否需大於規定日數", "身份", "收入條件每人每月上限金額", "動產條件每人上限", "其他條件", "應備文件", "收件洽辦單位", "聯繫方式", "詳細資訊網址"]);

export function extractTaipeiRows(body: string): DraftSourceItem[] {
  return parseCsvRecords(body).map((row, index) => {
    if (!row["補助名稱"]) throw new Error(`臺北 row ${index} 缺少補助名稱`);
    const values = Object.values(row).join(" ");
    return {
      externalId: row["序號"] || `${index}:${row["補助名稱"]}`,
      title: cleanText(row["補助名稱"]),
      raw: row,
      canonicalDraft: {
        title: cleanText(row["補助名稱"]),
        ageLowerText: cleanText(row["補助對象年齡下限"] ?? ""),
        ageUpperText: cleanText(row["補助對象年齡上限"] ?? ""),
        householdCondition: cleanText(row["設籍條件"] ?? ""),
        residenceDaysText: cleanText(row["居住日數是否需大於規定日數"] ?? ""),
        identityText: cleanText(row["身份"] ?? ""),
        incomeLimitText: cleanText(row["收入條件每人每月上限金額"] ?? ""),
        assetLimitText: cleanText(row["動產條件每人上限"] ?? ""),
        otherEligibilityText: cleanText(row["其他條件"] ?? ""),
        documentsText: cleanText(row["應備文件"] ?? ""),
        authority: cleanText(row["收件洽辦單位"] ?? ""),
        contactText: cleanText(row["聯繫方式"] ?? ""),
        applicationUrl: cleanText(row["詳細資訊網址"] ?? "") || null,
      },
      unknownFields: Object.fromEntries(Object.entries(row).filter(([key]) => !taipeiFields.has(key))),
      reviewStatus: "pending",
      warnings: [...(values.includes("109年") ? ["stale_109_year_text_detected"] : []), "field_semantics_require_review", "draft_never_auto_publish"],
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

class NewTaipeiCsvAdapter implements SourceAdapter {
  fetch = fetchSnapshot;
  async extract(snapshot: RawSnapshot) { return extractNewTaipeiRows(snapshot.body); }
}

class TaipeiCsvAdapter implements SourceAdapter {
  fetch = fetchSnapshot;
  async extract(snapshot: RawSnapshot) { return extractTaipeiRows(snapshot.body); }
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
    case "new_taipei_welfare_csv": return new NewTaipeiCsvAdapter();
    case "taipei_social_aid_csv": return new TaipeiCsvAdapter();
    case "myegov_html": return new MyEGovHtmlAdapter();
    case "official_page": return new OfficialPageAdapter();
    case "document_monitor": return new DocumentMonitorAdapter();
    case "manual": return new ManualAdapter();
  }
}
