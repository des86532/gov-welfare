import assert from "node:assert/strict";
import test from "node:test";
import { contentHashFor, extractMyEGovHtml, extractOfficialPage, extractTaoyuanRows } from "../lib/adapters";

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

test("HTML Content hash 忽略 Script 變動但保留正文變動", () => {
  const first = contentHashFor(Buffer.from("<body><p>資格 A</p><p>列印時間：115/07/27 01:47</p><p>累計瀏覽人次：88,964,783 今日瀏覽人次：3,956</p><p>您來自：36.225.136.78</p><script>token=1</script></body>"), "html");
  const same = contentHashFor(Buffer.from("<body><p>資格 A</p><p>列印時間：115/07/27 01:48</p><p>累計瀏覽人次：88,964,799 今日瀏覽人次：3,972</p><p>您來自：172.182.243.50</p><script>token=2</script></body>"), "html");
  const changed = contentHashFor(Buffer.from("<body><p>資格 B</p><script>token=2</script></body>"), "html");
  assert.equal(first, same);
  assert.notEqual(first, changed);
});
