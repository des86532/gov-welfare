# 福利指南 Taiwan Welfare Navigator

台灣政府福利的 Source-first MVP。公開端以 Dynamic questionnaire 和三值邏輯做資格初篩；資料端以 Source registry、Source-specific Adapter、immutable snapshots 與人工 Review 隔離不一致的政府資料。

## 已實作

- Next.js App Router 公開網站：首頁、Category catalog、Dynamic questionnaire、Results、Program detail、資料方法頁。
- 15 個中央／桃園 reviewed Seed Programs；其中可執行 Rules 與 `descriptive_only` 方案可以共存。
- 桃園 Open Data 26 筆 Source items 的完整 `matchable`／`descriptive_only`／`excluded` 分類。
- `all`、`any`、比較、日期間隔與 `true`／`false`／`unknown` Rule engine。
- 桃園 JSON、MyEGov HTML、Official page、Document monitor 與 Manual adapters。
- Dry-run ingestion CLI、GitHub Actions Scheduled source checks。
- Supabase PostgreSQL migration：Sources、Snapshots、Source items、Programs、Versions、Evidence、Reviews、Relationships 與 RLS。
- Basic Auth 保護的 `/admin` Read-only Review dashboard。
- 公開 Profile 僅存在 Browser memory；沒有帳號、MyData 或 `POST /api/match`。

## 本機執行

需要 Node.js 22，不需要 Docker、VM、Redis 或其他本機服務。

```bash
npm install
npm run dev
```

開啟 `http://localhost:3000`。公開 MVP 會直接讀取人工 Review 的 Seed data，因此沒有 Supabase credentials 也能完整操作。

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

## Supabase

1. 建立 Supabase project。
2. 套用 `supabase/migrations/0001_initial.sql`。
3. 將管理員的 `app_metadata.role` 設為 `admin`。
4. 複製 `.env.example` 為 `.env.local` 並填入 credentials。
5. Production 必須設定 `ADMIN_PASSWORD`；未設定時 `/admin` 會回應 503。

目前 Repository 刻意不包含自動 Publish job。下一步接上 Supabase 時，CLI 應以 Service Role 寫入 immutable `source_snapshots` 與 Draft `source_items`，再由已驗證的 Admin Server Action 執行 Review／Publish。這個邊界避免任何政府來源異動直接改變公開資格結果。

## 資料與安全邊界

- Open Data 只能建立 Draft，不能直接視為法律或資格依據。
- Content hash 改變只建立 Review alert；上一個 Published version 保留。
- `matchable` 的每個 Atomic rule 都必須有 `sourceId`、`snapshotId`、`locator` 和 Review 時間。
- Competitive selection、Loan、專業評估與官方紀錄查核不會顯示「核准」。
- Coverage 僅承諾中央 Seed programs 與桃園 Pilot，不宣稱完整涵蓋全臺。
- 主管機關保有最終資格、甄選、授信及核定權。

## Repository map

```text
app/                         Public pages, API, Admin dashboard
components/                  UI and client-side questionnaire
data/                        Reviewed Programs, Facts, Sources, Taoyuan audit
lib/domain.ts                Canonical domain contract
lib/rules.ts                 Three-valued eligibility engine
lib/adapters.ts              SourceAdapter implementations
scripts/check-sources.ts     Dry-run scheduled source checker
supabase/migrations/         PostgreSQL schema and RLS
tests/                       Rule, Adapter, and data acceptance tests
```
