import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import type { DraftSourceItem, RawSnapshot, SourceConfig } from "@/lib/domain";
import { normalizeNonSubstantiveSourceText } from "@/lib/source-text-normalization";

export interface SourceAdapter {
  fetch(source: SourceConfig): Promise<RawSnapshot>;
  extract(snapshot: RawSnapshot): Promise<DraftSourceItem[]>;
}

function cleanText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

export function decodeSourceText(bytes: Buffer): string {
  return bytes.toString("utf8").replace(/\u0000/g, "");
}

export function contentHashFor(bytes: Buffer, format: SourceConfig["format"], ignoreSelectors: string[] = []): string {
  if (format !== "html") return createHash("sha256").update(bytes).digest("hex");
  const $ = cheerio.load(bytes.toString("utf8"));
  $("script, style, noscript, svg, iframe, nav, header, footer").remove();
  for (const selector of ignoreSelectors) $(selector).remove();
  const content = $("main, article, #content, .content").first();
  const root = content.length ? content : $("body");
  const text = normalizeNonSubstantiveSourceText(cleanText(root.text()));
  const links = [...new Set(root.find("a[href]").map((_, element) => cleanText($(element).attr("href") ?? "")).get()
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
  const textBody = isText ? decodeSourceText(bytes) : "";
  if (/The requested URL was rejected|Access Denied/i.test(textBody) && textBody.length < 10_000) {
    throw new Error(`${source.id}: Source blocked this runner`);
  }
  return {
    sourceId: source.id,
    observedAt: new Date().toISOString(),
    contentType,
    etag: response.headers.get("etag") ?? undefined,
    lastModified: response.headers.get("last-modified") ?? undefined,
    contentHash: contentHashFor(bytes, source.format, source.hashIgnoreSelectors),
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

const taichungFields = new Set(["編號", "補助名稱", "補助序號", "設籍條件", "居住日數是否需大於183日", "身份1", "其他條件", "應備文件", "收件洽辦單位", "聯繫電話", "分機", "相關資訊連結", "縣市別代碼", "機關代碼"]);

export function extractTaichungRows(body: string): DraftSourceItem[] {
  const parsed: unknown = JSON.parse(body.replace(/^\uFEFF/, ""));
  if (!Array.isArray(parsed)) throw new Error("臺中 Source format changed: expected a JSON array");
  return parsed.map((value, index) => {
    const row = objectRecord(value);
    if (!row || typeof row["補助名稱"] !== "string") throw new Error(`臺中 row ${index} 缺少補助名稱`);
    const title = cleanText(row["補助名稱"]);
    return {
      externalId: typeof row["編號"] === "string" ? row["編號"] : `${index}:${title}`,
      title,
      raw: row,
      canonicalDraft: {
        title,
        benefitText: typeof row["補助序號"] === "string" ? cleanText(row["補助序號"]) : null,
        householdCondition: typeof row["設籍條件"] === "string" ? cleanText(row["設籍條件"]) : null,
        residenceDaysText: typeof row["居住日數是否需大於183日"] === "string" ? cleanText(row["居住日數是否需大於183日"]) : null,
        eligibilityText: typeof row["身份1"] === "string" ? cleanText(row["身份1"]) : null,
        otherEligibilityText: typeof row["其他條件"] === "string" ? cleanText(row["其他條件"]) : null,
        documentsText: typeof row["應備文件"] === "string" ? cleanText(row["應備文件"]) : null,
        authority: typeof row["收件洽辦單位"] === "string" ? cleanText(row["收件洽辦單位"]) : null,
        contactText: [row["聯繫電話"], row["分機"]].filter((item) => typeof item === "string" && item).join("#") || null,
        applicationUrl: typeof row["相關資訊連結"] === "string" ? cleanText(row["相關資訊連結"]) : null,
      },
      unknownFields: Object.fromEntries(Object.entries(row).filter(([key]) => !taichungFields.has(key))),
      reviewStatus: "pending",
      warnings: ["long_text_eligibility_requires_review", "draft_never_auto_publish"],
    };
  });
}

const tainanFields = new Set([
  "補助流水號",
  "補助名稱",
  "補助對象年齡下限",
  "補助對象年齡上限",
  "設籍條件",
  "居住日數是否需大於183日",
  "身份1",
  "身份2",
  "收入條件每人每月上限",
  "動產條件每人上限",
  "不動產條件每戶上限",
  "其他條件",
  "應備文件",
  "收件洽辦單位",
  "聯絡電話",
  "分機",
  "詳細資訊[連結]",
]);

export function extractTainanRows(body: string): DraftSourceItem[] {
  const normalized = body.replace(/^\uFEFF+/, "");
  let values: unknown[];
  if (normalized.trimStart().startsWith("{")) {
    const envelope = objectRecord(JSON.parse(normalized));
    if (!envelope || !Array.isArray(envelope.data)) throw new Error("臺南 Source format changed: expected an object with data array");
    values = envelope.data;
  } else {
    values = parseCsvRecords(normalized);
  }
  if (values.length === 0) throw new Error("臺南 Source format changed: no welfare rows");
  return values.map((value, index) => {
    const row = objectRecord(value);
    if (!row || typeof row["補助名稱"] !== "string" || typeof row["補助流水號"] !== "string") {
      throw new Error(`臺南 row ${index} 缺少補助流水號或補助名稱`);
    }
    const title = cleanText(row["補助名稱"]);
    const text = (key: string) => typeof row[key] === "string" ? cleanText(row[key]) : "";
    return {
      externalId: text("補助流水號"),
      title,
      raw: row,
      canonicalDraft: {
        title,
        ageLowerText: text("補助對象年齡下限") || null,
        ageUpperText: text("補助對象年齡上限") || null,
        householdCondition: text("設籍條件") || null,
        residenceDaysText: text("居住日數是否需大於183日") || null,
        identityText: [text("身份1"), text("身份2")].filter(Boolean).join("、") || null,
        incomeLimitText: text("收入條件每人每月上限") || null,
        assetLimitText: text("動產條件每人上限") || null,
        realEstateLimitText: text("不動產條件每戶上限") || null,
        otherEligibilityText: text("其他條件") || null,
        documentsText: text("應備文件") || null,
        authority: text("收件洽辦單位") || null,
        contactText: [text("聯絡電話"), text("分機")].filter(Boolean).join("#") || null,
        legacyDetailUrl: text("詳細資訊[連結]") || null,
      },
      unknownFields: Object.fromEntries(Object.entries(row).filter(([key]) => !tainanFields.has(key))),
      reviewStatus: "pending",
      warnings: ["government_api_passthrough", "legacy_detail_url_not_used", "no_automatic_rule_generation"],
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
  const title = cleanText($("main h1, article h1, #content h1, .content h1").first().text())
    || cleanText($("title").first().text())
    || cleanText($("h1").first().text())
    || sourceId;
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

type OpportunitySourceKind = "government" | "foundation" | "nonprofit";

type OpportunityListingDefinition = {
  baseUrl: string;
  itemSelector: string;
  titleSelector: string;
  linkSelector: string;
  dateSelector: string;
  statusSelector?: string;
  categorySelector?: string;
  fixedCategory?: string;
  organizer: string;
  organizerType: OpportunitySourceKind;
  governmentSupportStatus: "official" | "not_applicable" | "claimed_pending_evidence";
};

const opportunityListings: Record<string, OpportunityListingDefinition> = {
  "yda-activity-listing": {
    baseUrl: "https://www.yda.gov.tw/",
    itemSelector: ".all-event .event-box",
    titleSelector: "a.title",
    linkSelector: "a.title",
    dateSelector: "small.date",
    statusSelector: ".status",
    categorySelector: ".tag-box .tag",
    organizer: "教育部青年發展署",
    organizerType: "government",
    governmentSupportStatus: "official",
  },
  "tmitrail-work-holiday-listing": {
    baseUrl: "https://www.tmitrail.org.tw/",
    itemSelector: ".view-display-id-page_1 .views-row",
    titleSelector: ".views-field-title a",
    linkSelector: ".views-field-title a",
    dateSelector: ".views-field-end-date",
    fixedCategory: "工作假期",
    organizer: "台灣千里步道協會",
    organizerType: "nonprofit",
    governmentSupportStatus: "claimed_pending_evidence",
  },
};

const opportunityDetails: Record<string, {
  organizer: string;
  organizerType: OpportunitySourceKind;
  opportunityType: string;
  governmentSupportStatus: "official" | "not_applicable" | "claimed_pending_evidence";
  titleSelector: string;
  contentSelector: string;
}> = {
  "cga-marine-student-camp-115": {
    organizer: "海洋委員會海巡署",
    organizerType: "government",
    opportunityType: "experience_camp",
    governmentSupportStatus: "official",
    titleSelector: ".page-title h3",
    contentSelector: ".page-title, .info, .download",
  },
  "mnd-nansha-study-camp-115": {
    organizer: "國防部",
    organizerType: "government",
    opportunityType: "study_camp",
    governmentSupportStatus: "official",
    titleSelector: "h2.title",
    contentSelector: "#content",
  },
  "cadf-summer-air-camp-2026": {
    organizer: "財團法人中華航空事業發展基金會",
    organizerType: "foundation",
    opportunityType: "experience_camp",
    governmentSupportStatus: "not_applicable",
    titleSelector: "#page-title",
    contentSelector: ".field-name-body .field-item",
  },
};

function absoluteUrl(href: string, baseUrl: string): string | null {
  if (!href || href.startsWith("javascript:") || href.startsWith("#")) return null;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

export function extractOpportunityListing(body: string, sourceId: string): DraftSourceItem[] {
  const definition = opportunityListings[sourceId];
  if (!definition) throw new Error(`${sourceId}: missing opportunity listing mapping`);
  const $ = cheerio.load(body);
  const items = new Map<string, DraftSourceItem>();
  $(definition.itemSelector).each((index, element) => {
    const row = $(element);
    const title = cleanText(row.find(definition.titleSelector).first().text());
    const detailUrl = absoluteUrl(row.find(definition.linkSelector).first().attr("href") ?? "", definition.baseUrl);
    if (!title || !detailUrl) return;
    const dateText = cleanText(row.find(definition.dateSelector).first().text()).replace(/^活動日期：?\s*/, "");
    const explicitStatus = definition.statusSelector ? cleanText(row.find(definition.statusSelector).first().text()) : "";
    const statusText = explicitStatus || (/已額滿/.test(title) ? "已額滿" : "待確認");
    const category = (definition.fixedCategory
      ?? (definition.categorySelector ? cleanText(row.find(definition.categorySelector).first().text()) : ""))
      || null;
    const externalId = detailUrl;
    items.set(externalId, {
      externalId,
      title,
      raw: { sourceId, rowIndex: index, rowText: cleanText(row.text()), detailUrl },
      canonicalDraft: {
        entityType: "opportunity",
        title,
        detailUrl,
        dateText: dateText || null,
        statusText,
        category,
        organizer: definition.organizer,
        organizerType: definition.organizerType,
        governmentSupportStatus: definition.governmentSupportStatus,
      },
      unknownFields: {},
      reviewStatus: "pending",
      warnings: ["opportunity_requires_review", "dates_and_eligibility_require_review", "draft_never_auto_publish"],
    });
  });
  if (items.size === 0) throw new Error(`${sourceId}: activity listing format changed or returned no items`);
  return [...items.values()];
}

export function extractOpportunityDetail(body: string, sourceId: string): DraftSourceItem[] {
  const metadata = opportunityDetails[sourceId];
  if (!metadata) throw new Error(`${sourceId}: missing opportunity detail mapping`);
  const { titleSelector, contentSelector, ...canonicalMetadata } = metadata;
  const $ = cheerio.load(body);
  const title = cleanText($(titleSelector).first().text());
  const bodyText = cleanText($(contentSelector).map((_, element) => $(element).text()).get().join(" "));
  if (!title || bodyText.length < 30) throw new Error(`${sourceId}: opportunity detail content extraction empty`);
  return extractOfficialPage(body, sourceId).map((item) => ({
    ...item,
    title,
    canonicalDraft: {
      entityType: "opportunity",
      ...item.canonicalDraft,
      title,
      bodyText,
      ...canonicalMetadata,
    },
    warnings: ["opportunity_requires_review", "dates_fees_capacity_and_eligibility_require_review", ...item.warnings],
  }));
}

export function extractSpnpActivityRows(body: string): DraftSourceItem[] {
  const parsed: unknown = JSON.parse(body.replace(/^\uFEFF/, ""));
  if (!Array.isArray(parsed)) throw new Error("雪霸活動 Source format changed: expected a JSON array");
  const rows = parsed.map((value, index) => {
    const row = objectRecord(value);
    if (!row || typeof row.id !== "number" || typeof row.title !== "string") {
      throw new Error(`雪霸活動 row ${index} 缺少 id 或 title`);
    }
    return row;
  });
  const years = rows
    .map((row) => typeof row.event_start === "string" ? Number(row.event_start.slice(0, 4)) : NaN)
    .filter(Number.isFinite);
  const latestYear = Math.max(...years);
  if (!Number.isFinite(latestYear)) throw new Error("雪霸活動 Source 缺少有效 event_start");
  return rows
    .filter((row) => typeof row.event_start === "string" && row.event_start.startsWith(`${latestYear}-`))
    .map((row) => {
      const title = String(row.title);
      const detailUrl = `https://www.spnp.gov.tw/ch/titlelist/events-calendar/${row.id}`;
      const contentHtml = typeof row.content === "string" ? row.content : "";
      const contentText = cleanText(cheerio.load(contentHtml).text());
      return {
        externalId: String(row.id),
        title,
        raw: row,
        canonicalDraft: {
          entityType: "opportunity",
          title,
          detailUrl,
          eventStart: typeof row.event_start === "string" ? row.event_start : null,
          eventEnd: typeof row.event_end === "string" ? row.event_end : null,
          applicationWindowText: contentText || null,
          locationText: typeof row.event_area === "string" ? cleanText(row.event_area) || null : null,
          category: "國家公園活動",
          organizer: "內政部國家公園署雪霸國家公園管理處",
          organizerType: "government",
          governmentSupportStatus: "official",
        },
        unknownFields: {},
        reviewStatus: "pending" as const,
        warnings: ["opportunity_requires_review", "dates_fees_capacity_and_eligibility_require_review", "draft_never_auto_publish"],
      };
    });
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

class TaichungJsonAdapter implements SourceAdapter {
  fetch = fetchSnapshot;
  async extract(snapshot: RawSnapshot) { return extractTaichungRows(snapshot.body); }
}

class TainanJsonAdapter implements SourceAdapter {
  fetch = fetchSnapshot;
  async extract(snapshot: RawSnapshot) { return extractTainanRows(snapshot.body); }
}

class MyEGovHtmlAdapter implements SourceAdapter {
  fetch = fetchSnapshot;
  async extract(snapshot: RawSnapshot) { return extractMyEGovHtml(snapshot.body, snapshot.sourceId); }
}

class OfficialPageAdapter implements SourceAdapter {
  fetch = fetchSnapshot;
  async extract(snapshot: RawSnapshot) { return extractOfficialPage(snapshot.body, snapshot.sourceId); }
}

class ActivityListingHtmlAdapter implements SourceAdapter {
  fetch = fetchSnapshot;
  async extract(snapshot: RawSnapshot) { return extractOpportunityListing(snapshot.body, snapshot.sourceId); }
}

class OpportunityDetailAdapter implements SourceAdapter {
  fetch = fetchSnapshot;
  async extract(snapshot: RawSnapshot) { return extractOpportunityDetail(snapshot.body, snapshot.sourceId); }
}

class SpnpActivityJsonAdapter implements SourceAdapter {
  fetch = fetchSnapshot;
  async extract(snapshot: RawSnapshot) { return extractSpnpActivityRows(snapshot.body); }
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
    case "taichung_social_aid_json": return new TaichungJsonAdapter();
    case "tainan_social_welfare_json": return new TainanJsonAdapter();
    case "myegov_html": return new MyEGovHtmlAdapter();
    case "official_page": return new OfficialPageAdapter();
    case "activity_listing_html": return new ActivityListingHtmlAdapter();
    case "opportunity_detail": return new OpportunityDetailAdapter();
    case "spnp_activity_json": return new SpnpActivityJsonAdapter();
    case "document_monitor": return new DocumentMonitorAdapter();
    case "manual": return new ManualAdapter();
  }
}
