import assert from "node:assert/strict";
import test from "node:test";
import { contentHashFor, decodeSourceText, extractMyEGovHtml, extractNewTaipeiRows, extractOfficialPage, extractOpportunityDetail, extractOpportunityListing, extractSpnpActivityRows, extractTaichungRows, extractTaipeiRows, extractTaoyuanRows, parseCsvRecords, validateSnapshotFormat } from "../lib/adapters";
import type { SourceConfig } from "../lib/domain";

const monitoredPdf: SourceConfig = {
  id: "test-pdf",
  name: "測試 PDF",
  authority: "測試機關",
  jurisdiction: "中央",
  url: "https://example.gov.tw/guide.pdf",
  format: "pdf",
  roles: ["legal_basis"],
  automation: "change_detection_only",
  adapterKey: "document_monitor",
  checkEveryHours: 168,
  crawlerRequired: false,
  status: "active",
  lastVerifiedAt: "2026-07-27",
};

test("PDF Source 用 magic bytes 阻擋偽裝成下載檔的 HTML", () => {
  assert.doesNotThrow(() => validateSnapshotFormat(monitoredPdf, Buffer.from("%PDF-1.7"), "application/pdf"));
  assert.throws(
    () => validateSnapshotFormat(monitoredPdf, Buffer.from("<html>redirect</html>"), "application/pdf"),
    /expected PDF/,
  );
});

test("Text Source decode 移除 PostgreSQL JSONB 不支援的 NUL", () => {
  assert.equal(decodeSourceText(Buffer.from("資格\u0000內容", "utf8")), "資格內容");
});

test("桃園 JSON 保留未知欄位且不採用 raw Category", () => {
  const items = extractTaoyuanRows(JSON.stringify([{ policyName: "測試福利", policyCategory: "錯誤分類", sourceUrl: "https://example.gov.tw/a", futureField: "保留我" }]));
  assert.equal(items.length, 1);
  assert.equal(items[0].canonicalDraft.rawCategory, "錯誤分類");
  assert.equal(items[0].unknownFields.futureField, "保留我");
  assert.equal(items[0].reviewStatus, "pending");
  assert.ok(items[0].warnings.includes("rawCategory_not_trusted"));
});

test("桃園格式改變時直接失敗而非靜默發布", () => {
  assert.throws(() => extractTaoyuanRows('{"items":[]}'), /format changed/);
  assert.throws(() => extractTaoyuanRows("[{}]"), /policyName/);
});

test("CSV parser 支援 BOM、引號、逗號與欄位內換行", () => {
  const rows = parseCsvRecords('\uFEFFname,description,id\r\n"福利 ""A""","第一行,內容\n第二行",7\r\n');
  assert.deepEqual(rows, [{ name: '福利 "A"', description: "第一行,內容\n第二行", id: "7" }]);
  assert.throws(() => parseCsvRecords('name,description\n"未結束,內容'), /unterminated/);
});

test("新北 CSV 保留 cont1–cont7 不透明欄位且不產生 Rules", () => {
  const csv = "name,service_desc,cont1,cont2,cont3,cont4,cont5,cont6,cont7,date_created,last_updated,c,curl,id\n測試福利,補助說明,聯絡資訊,文件,,,,,免費服務,2026-01-01,2026-02-01,0,https://example.gov.tw/app,99";
  const item = extractNewTaipeiRows(csv)[0];
  assert.equal(item.canonicalDraft.title, "測試福利");
  assert.deepEqual(item.canonicalDraft.opaqueSections, { cont1: "聯絡資訊", cont2: "文件", cont7: "免費服務" });
  assert.equal("rule" in item.canonicalDraft, false);
  assert.ok(item.warnings.includes("opaque_cont_fields_require_review"));
});

test("臺北 CSV 將舊年度文字標成 Review warning", () => {
  const headers = ["序號", "補助名稱", "補助對象年齡下限", "補助對象年齡上限", "設籍條件", "居住日數是否需大於規定日數", "身份", "收入條件每人每月上限金額", "動產條件每人上限", "其他條件", "應備文件", "收件洽辦單位", "聯繫方式", "詳細資訊網址"];
  const values = ["1", "生活扶助", "109年標準表", "109年標準表", "台北市", "183日", "低收入戶", "17005", "15萬", "不動產上限", "申請表", "區公所", "電話", "https://example.gov.tw/detail"];
  const item = extractTaipeiRows(`${headers.join(",")}\n${values.join(",")}`)[0];
  assert.equal(item.canonicalDraft.identityText, "低收入戶");
  assert.equal(item.canonicalDraft.applicationUrl, "https://example.gov.tw/detail");
  assert.ok(item.warnings.includes("stale_109_year_text_detected"));
  assert.equal(item.reviewStatus, "pending");
});

test("臺中 JSON 保留未知欄位且長文字不自動產生 Rules", () => {
  const item = extractTaichungRows(JSON.stringify([{
    編號: "1",
    補助名稱: "市急難救助",
    補助序號: "最高 2 萬元",
    身份1: "六類急難事由",
    相關資訊連結: "https://example.taichung.gov.tw/1",
    futureField: "保留我",
  }]))[0];
  assert.equal(item.title, "市急難救助");
  assert.equal(item.canonicalDraft.eligibilityText, "六類急難事由");
  assert.equal(item.unknownFields.futureField, "保留我");
  assert.equal("rule" in item.canonicalDraft, false);
  assert.ok(item.warnings.includes("long_text_eligibility_requires_review"));
});

test("MyEGov 重複申辦段落去重", () => {
  const html = '<main><h1>育兒津貼</h1><h2>申辦方式</h2><p>臨櫃申辦</p><p>臨櫃申辦</p><h2>資格</h2><p>未滿二歲</p></main>';
  const item = extractMyEGovHtml(html, "myegov")[0];
  assert.deepEqual(item.canonicalDraft.sections, { 申辦方式: ["臨櫃申辦"], 資格: ["未滿二歲"] });
  assert.deepEqual(item.canonicalDraft.paragraphs, ["臨櫃申辦", "未滿二歲"]);
});

test("MyEGov 解析 css-tr 服務欄位並跨申辦方式去重", () => {
  const row = '<div class="css-tr"><div class="css-th">申辦資格</div><div class="css-td"><div class="indent">未滿2歲</div></div></div>';
  const item = extractMyEGovHtml(`<meta property="og:title" content="育兒津貼"><div id="CCMS_Content">${row}${row}</div>`, "myegov")[0];
  assert.equal(item.title, "育兒津貼");
  assert.deepEqual(item.canonicalDraft.sections, { 申辦資格: ["未滿2歲"] });
  assert.equal(item.warnings.includes("content_extraction_empty"), false);
});

test("Official page 只抽文字 Draft，不產生 Rule", () => {
  const item = extractOfficialPage('<html><title>公告</title><main><p>年滿 20 歲</p></main></html>', "official")[0];
  assert.equal(item.canonicalDraft.bodyText, "年滿 20 歲");
  assert.equal("rule" in item.canonicalDraft, false);
  assert.ok(item.warnings.includes("no_automatic_rule_generation"));
});

test("青年發展署活動列表轉成多筆 Opportunity Draft", () => {
  const html = `
    <div class="all-event"><div class="event-box">
      <a class="title" href="eventDoc.aspx?uid=102&pid=56&eid=116">115年青年體驗營</a>
      <small class="date">活動日期：<br>115-07-01~115-08-31</small>
      <div class="tag-box"><a class="tag">壯遊體驗</a></div>
      <span class="status">報名中</span>
    </div></div>`;
  const item = extractOpportunityListing(html, "yda-activity-listing")[0];
  assert.equal(item.externalId, "https://www.yda.gov.tw/eventDoc.aspx?uid=102&pid=56&eid=116");
  assert.equal(item.canonicalDraft.entityType, "opportunity");
  assert.equal(item.canonicalDraft.dateText, "115-07-01~115-08-31");
  assert.equal(item.canonicalDraft.statusText, "報名中");
  assert.equal(item.canonicalDraft.organizerType, "government");
  assert.equal("rule" in item.canonicalDraft, false);
  assert.ok(item.warnings.includes("dates_and_eligibility_require_review"));
});

test("NGO 工作假期保留非政府主辦與待查證補助狀態", () => {
  const html = `
    <div class="view-display-id-page_1"><div class="views-row">
      <div class="views-field-title"><a href="/civicrm/event/info?id=391&reset=1">已額滿【手作步道】工作假期</a></div>
      <div class="views-field-end-date">2026/04/17 - 11:00～2026/04/19 - 14:30</div>
    </div></div>`;
  const item = extractOpportunityListing(html, "tmitrail-work-holiday-listing")[0];
  assert.equal(item.canonicalDraft.organizerType, "nonprofit");
  assert.equal(item.canonicalDraft.governmentSupportStatus, "claimed_pending_evidence");
  assert.equal(item.canonicalDraft.statusText, "已額滿");
  assert.equal(item.canonicalDraft.category, "工作假期");
});

test("活動 Detail 使用 Source-specific selector 且不自動產生 Eligibility Rule", () => {
  const item = extractOpportunityDetail('<html><h1>網站名稱</h1><h2 class="title">南沙研習營</h2><div id="content"><p>本活動採限額甄選，詳細資格、報名期間與應備文件請查看當年度官方簡章。</p></div></html>', "mnd-nansha-study-camp-115")[0];
  assert.equal(item.title, "南沙研習營");
  assert.equal(item.canonicalDraft.bodyText, "本活動採限額甄選，詳細資格、報名期間與應備文件請查看當年度官方簡章。");
  assert.equal(item.canonicalDraft.entityType, "opportunity");
  assert.equal(item.canonicalDraft.opportunityType, "study_camp");
  assert.equal(item.canonicalDraft.organizerType, "government");
  assert.equal("rule" in item.canonicalDraft, false);
  assert.ok(item.warnings.includes("dates_fees_capacity_and_eligibility_require_review"));
});

test("雪霸 JSON 僅擷取資料中的最新年度活動", () => {
  const body = JSON.stringify([
    { id: 1, title: "2025 舊活動", event_start: "2025-07-01T00:00:00.000Z", event_end: "2025-07-02T00:00:00.000Z" },
    { id: 2, title: "第18屆 Youth Camp", event_start: "2026-08-04T00:20:00.000Z", event_end: "2026-08-06T09:00:00.000Z", content: "<p>高中及大專院校學生，清寒學員得減收部分費用。</p>" },
  ]);
  const items = extractSpnpActivityRows(body);
  assert.equal(items.length, 1);
  assert.equal(items[0].externalId, "2");
  assert.equal(items[0].canonicalDraft.entityType, "opportunity");
  assert.match(String(items[0].canonicalDraft.applicationWindowText), /清寒學員/);
});

test("未登錄的活動 Source mapping 直接失敗", () => {
  assert.throws(() => extractOpportunityListing("<main>活動</main>", "unknown-listing"), /missing opportunity listing mapping/);
  assert.throws(() => extractOpportunityDetail("<main>活動</main>", "unknown-detail"), /missing opportunity detail mapping/);
});

test("HTML Content hash 忽略版頭動態內容但保留正文與申請連結變動", () => {
  const first = contentHashFor(Buffer.from("<body><header>線上人數 1<a href='/daily?token=1'>導覽</a></header><main><p>資格 A</p><p>瀏覽人次：1,234 人</p><a href='/apply?id=1'>申請</a></main><script>token=1</script></body>"), "html");
  const same = contentHashFor(Buffer.from("<body><header>線上人數 9<a href='/daily?token=2'>導覽</a></header><main><p>資格 A</p><p>瀏覽人次：1,235 人</p><a href='/apply?id=1'>申請</a></main><script>token=2</script></body>"), "html");
  const changed = contentHashFor(Buffer.from("<body><main><p>資格 B</p><a href='/apply?id=1'>申請</a></main></body>"), "html");
  const changedLink = contentHashFor(Buffer.from("<body><main><p>資格 A</p><a href='/apply?id=2'>申請</a></main></body>"), "html");
  assert.equal(first, same);
  assert.notEqual(first, changed);
  assert.notEqual(first, changedLink);
});

test("HTML Content hash 支援 Source-specific 動態區塊排除", () => {
  const first = contentHashFor(Buffer.from("<main><p>資格 A</p><select id='locations'><option>甲</option><option>乙</option></select><div id='mapdesc'>甲地址</div></main>"), "html", ["#locations", "#mapdesc"]);
  const same = contentHashFor(Buffer.from("<main><p>資格 A</p><select id='locations'><option>乙</option><option>甲</option></select><div id='mapdesc'>乙地址</div></main>"), "html", ["#locations", "#mapdesc"]);
  assert.equal(first, same);
});
