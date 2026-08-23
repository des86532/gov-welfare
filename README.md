# 福利指南 Taiwan Welfare Navigator

台灣政府福利的 Source-first MVP。公開端以 Dynamic questionnaire 和三值邏輯做資格初篩；資料端使用 Source registry、Source-specific Adapter、immutable snapshots 與 Auto sync 處理不一致的政府資料。

完整架構、cron job、Database Data structure 與安全邊界請見 [Architecture](docs/ARCHITECTURE.md)。

## 主要功能

- Next.js App Router：首頁、Category catalog、Dynamic questionnaire、Results、Program detail 與活動頁。
- 方案可依申請對象、Category、縣市、Benefit、申請狀態、關鍵字與資料狀態篩選。
- 選擇縣市時顯示中央方案加上該縣市方案。
- Supabase 保存 Source registry、immutable snapshots、Source items、Program versions 與使用者回報。
- GitHub Actions 每天執行 Source check，成功擷取後自動發布最新官方資料。
- `/admin` 只顯示 Source 狀態與使用者回報；沒有人工 Review Queue、Publish、Reject 或 Rationale。
- 每筆方案附主管機關官方連結；使用者應以官方網站即時內容為準。
- Public Profile 只存在同一分頁的 `sessionStorage`，不送到 Server 或 Database。

## Auto sync 原則

- Structured API、HTML 與可解析頁面會保存最新 Source item，並標記為 Published descriptive data。
- 既有 Program 成功取得新 Snapshot 後，自動建立並發布新 Version。
- Adapter 擷取到的官方正文會以 `sourceExcerpt` 顯示於 Program detail。
- Auto sync 不從自然語言自行猜測年齡、所得、國籍或家戶 Rules；沒有 Structured Rules 的方案只顯示官方說明。
- PDF／Document monitor 若沒有可靠文字解析，只更新 Snapshot、狀態與官方連結，不虛構內容。
- Timeout、404、Encoding 或格式錯誤不會清空公開資料；系統保留上一個 Published version 並發出 GitHub Issue。

## 本機執行與驗證

需要 Node.js 22，不需要 Docker、Redis 或其他本機服務。

```bash
npm install
npm run dev

npm test
npm run typecheck
npm run lint
npm run build
```

Source 指令：

```bash
# Dry-run，不寫 Database
npm run sources:check -- --json

# 保存到 Supabase；此 CLI 單獨執行時不發布 Program
npm run sources:persist -- --json

# 將最新 Source snapshots 自動同步到 Published Programs
npm run data:seed -- --apply --publish-updates

# Production data acceptance
npm run data:audit
```

Scheduled workflow 會依序執行 `sources:persist`、`data:seed -- --apply --publish-updates` 與 `data:audit`。

## Environment

複製 `.env.example` 為 `.env.local` 並設定：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`：只允許 Server 與 GitHub Actions 使用。
- `ADMIN_PASSWORD`：保護 `/admin`；未設定時 fail closed。

## 安全與正確性邊界

- 每筆公開資料必須有 HTTPS 官方連結。
- `matchable` Rules 只來自 Repository 中明確定義的 Rule tree；Crawler 不自行生成或修改 Rules。
- Competitive selection、Loan、Professional assessment 與 Official record check 不會顯示「已核准」。
- 主管機關保有最終資格、甄選、授信與核定權。
- Historical `reviews` table 與舊 Draft records 為非破壞性歷史資料，目前不再作為發布 Gate。

## Repository map

```text
app/                         Public pages, API, Admin monitoring
components/                  UI and client-side questionnaire
data/                        Programs, Facts, Sources, Source manifests
lib/domain.ts                Canonical domain contract
lib/rules.ts                 Three-valued eligibility engine
lib/adapters.ts              SourceAdapter implementations
scripts/check-sources.ts     Scheduled Source checker
scripts/seed-reviewed-programs.ts  Auto-sync Program publisher（legacy filename）
supabase/migrations/         PostgreSQL schema and RLS history
tests/                       Rule, Adapter, auth and data tests
```
