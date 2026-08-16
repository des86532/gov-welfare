# 福利指南 Taiwan Welfare Navigator

台灣政府福利的 Source-first MVP。公開端以 Dynamic questionnaire 和三值邏輯做資格初篩；資料端以 Source registry、Source-specific Adapter、immutable snapshots 與人工 Review 隔離不一致的政府資料。

目前實際 Architecture、cron job、Database Data structure、Production 狀態與缺口，請見 [Architecture 與 Production Gap](docs/ARCHITECTURE.md)。

## 已實作

- Next.js App Router 公開網站：首頁、Category catalog、Dynamic questionnaire、Results 與 Program detail。
- Production 方案由 Supabase Published versions 與受控 Seed fallback 合併；即時數量與 Review 狀態以 `/api/programs` 及 `npm run data:audit` 為準，避免文件硬編碼後產生 drift。
- 桃園 Open Data 26 筆 Source items 的完整 `matchable`／`descriptive_only`／`excluded` 分類。
- 桃園共 5 個 `matchable`、17 個 `descriptive_only` 福利進入公開 Catalog；自然語言資格尚未結構化前不參與 Matching。
- 戶籍與居住地可選擇臺灣全部 22 縣市，為後續地方 Coverage 保留一致 Fact values。
- 全部方案可依申請對象區分一般民眾、準備創業者與已設立企業；新增「企業升級與研發」Category，第一批 8 個中央企業方案全部以 `descriptive_only` 顯示並連回官方入口。
- `all`、`any`、比較、日期間隔與 `true`／`false`／`unknown` Rule engine。
- 桃園 JSON、新北／臺北 CSV、MyEGov HTML、Official page、Document monitor 與 Manual adapters。
- 新北 151 筆已全數分類為 6 筆 `matchable`、140 筆 `descriptive_only`、5 筆 `excluded`；8 個 Programs 已補 Authority page，其中 6 個可執行 Rules。
- 臺北 10 筆已逐項用現行 Authority page 與 115 年公告複核，全部建立人工驗證 Rules；Dataset 內 109 年舊門檻只保留作 Discovery evidence。
- 臺中 10 筆急難、災害與食物銀行項目已逐項核對社會局現行頁面，全部建立人工驗證 Rules；專業訪查型方案只顯示可申請門檻。
- 臺南政府 API 47 筆以 `descriptive_only` passthrough 自動公開；保留政府原文、受理單位與電話，不使用已失效的舊 Detail URL，也不產生 Eligibility Rules。
- Dry-run／persistent ingestion CLI、GitHub Actions Scheduled source checks。
- Supabase PostgreSQL migration：Sources、Snapshots、Source items、Programs、Versions、Evidence、Reviews、Relationships 與 RLS。
- Basic Auth 保護的 `/admin`：`needs_review` Queue 只處理 Authority page／PDF 的資格、金額或期限異動；Structured government API 採 descriptive passthrough 並附官方連結。Source history、Rollback 與 Audit trail 收進進階管理。
- 活動使用平台維護的 Activity data 與官方連結直接公開，不要求逐筆 Snapshot Review；Detail page 提供匿名錯誤回報，Admin 只處理使用者回報。
- GitHub Actions 每小時檢查未處理的活動回報，只以 GitHub Issue 通知數量；使用者填寫內容不會複製到 GitHub。
- 公開 Profile 僅存在同一分頁的 `sessionStorage`，關閉分頁後即消失；沒有帳號、MyData 或 `POST /api/match`。

## 本機執行

需要 Node.js 22，不需要 Docker、VM、Redis 或其他本機服務。

```bash
npm install
npm run dev
```

開啟 `http://localhost:3000`。沒有 Supabase credentials 時仍可操作 Repository reviewed Seed Programs；Production 由 Supabase Published versions 與受控 Seed fallback 合併提供。

## 驗證

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

檢查單一官方 Source（只輸出 Draft report，不寫入或 Publish）：

```bash
npm run sources:check -- --source taoyuan-welfare-open-data
```

全部 Source 的 machine-readable report：

```bash
npm run sources:check -- --json
```

有設定 Service Role 時，可保存 immutable Snapshot 與 Draft items；這個指令仍不會 Publish Program：

```bash
npm run sources:persist -- --json
```

核對 Production data coverage、桃園 26/26、新北、臺北 10/10、臺中 10/10、臺南 structured passthrough，以及 Published Authority evidence 是否仍為最新 Snapshot：

```bash
npm run data:audit
```

Repository-reviewed Rules 只有在 GitHub Actions 的 `Scheduled source checks` 手動執行並勾選 `publish_reviewed_programs` 後才會發布；每日 Schedule 會自動發布 `structured_extract` 的 descriptive passthrough，但不能產生或修改 Eligibility Rules。單一 Source 失敗不會阻止其他已審核、Evidence Source 正常的 Program 發布，但 workflow 最後仍會保留失敗狀態供追蹤。

Schedule 會依每個 Source 的 `checkEveryHours` 判斷是否到期；手動執行預設強制檢查全部 active Sources。若只要恢復暫時失敗的 Source，可勾選 `retry_failed_only`，只重試失敗或已到期項目。失敗時會建立或更新 GitHub Issue，恢復後自動關閉。

## Supabase

1. 建立 Supabase project。
2. 執行 `supabase db push`，依序套用 `supabase/migrations/`。
3. 將管理員的 `app_metadata.role` 設為 `admin`。
4. 複製 `.env.example` 為 `.env.local` 並填入 credentials。
5. 所有環境都必須設定 `ADMIN_PASSWORD` 才能進入 `/admin`；未設定時會回應 503，錯誤密碼回應 401。

`SUPABASE_SERVICE_ROLE_KEY` 只供 Server-side ingestion 與 Admin 使用，不得放進 Client component 或公開輸出。

CLI 以 Service Role 寫入 immutable `source_snapshots`；只有 Structured government API、已人工分類的地方 Dataset，或已被 Repository-reviewed Program 引用的 Source 才會另外寫入 `source_items`。未經 curation 的 HTML 僅保留 Snapshot 作技術監測，不建立 Classification 待辦，也不可能公開。Structured government API item 可由 `--publish-structured-passthrough` 自動發布 descriptive Programs；既有 Published Program 的 HTML／PDF Authority Source 發生實質文字異動時才建立人工 Review 工作。初始 reviewed Programs 可由 `npm run data:seed -- --apply --publish-initial` 匯入。公開網站優先讀取 Supabase Published versions，Database 無法使用時才回到 Repository 中的 reviewed Seed。

## 資料與安全邊界

- Structured Open Data 可直接更新 descriptive content，但不能自動產生 `matchable` Rule；顯示時必須附官方連結。
- Authority page／PDF 的 Content hash 改變才建立 Review alert；上一個 Published version 保留。
- `matchable` 的每個 Atomic rule 都必須有 `sourceId`、`snapshotId`、`locator` 和 Review 時間。
- Competitive selection、Loan、專業評估與官方紀錄查核不會顯示「核准」。
- 企業補助不進入自然人 Dynamic questionnaire；申請期限明確的 Authority page 每 24 小時檢查，但內容異動只建立 Draft，不能自動改寫補助金額或資格。
- Coverage 僅承諾中央 Seed programs、桃園、新北、臺北與臺中 Pilot，以及臺南 structured API descriptive passthrough，不宣稱完整涵蓋全臺。
- 主管機關保有最終資格、甄選、授信及核定權。

## Repository map

```text
app/                         Public pages, API, Admin dashboard
components/                  UI and client-side questionnaire
data/                        Reviewed Programs, Facts, Sources, local Source manifests
lib/domain.ts                Canonical domain contract
lib/rules.ts                 Three-valued eligibility engine
lib/adapters.ts              SourceAdapter implementations
scripts/check-sources.ts     Dry-run scheduled source checker
scripts/seed-reviewed-programs.ts  Explicit reviewed Program importer
supabase/migrations/         PostgreSQL schema and RLS
tests/                       Rule, Adapter, and data acceptance tests
```
