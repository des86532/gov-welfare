# Supabase Backup／Restore Runbook

> 最後演練：2026-08-13（Asia/Taipei）

## 目標與界線

- Recovery Point Objective（RPO）：24 小時。
- Recovery Time Objective（RTO）：4 小時內恢復 Public catalog、Source history 與使用者回報。
- Production restore 一律先還原到新 Supabase Project 或本機隔離 PostgreSQL；未完成驗證前不得覆寫原 Project。
- Repository migrations 與 Source manifests 是 Schema／Published content 的另一份可重建來源，但不能取代 Database backup 中的 Snapshots、歷史 Versions 與使用者回報。

Supabase Managed Database backup 不包含 Storage objects，只保存 Storage metadata。本專案目前 Raw snapshots 仍在 `source_snapshots.raw_body`，因此 Application restore drill 會涵蓋；未來搬到 Storage 後，必須另做 Bucket object backup。

## Backup policy

1. 每週及每次大量 Publish 前確認 Supabase Dashboard 的 **Database > Backups** 有可用 Restore point。
2. Pro／Team／Enterprise 使用 Supabase daily physical backup；Free plan 另做 Supabase CLI logical dump。
3. Retention 至少 30 天；保留檔須加密並存放在 Repository 與 Supabase 以外的位置。
4. 不把 Database password、Service Role、dump 或使用者回報內容提交到 Git。

官方 logical backup：

```bash
supabase db dump --db-url "$SOURCE_DATABASE_URL" -f roles.sql --role-only
supabase db dump --db-url "$SOURCE_DATABASE_URL" -f schema.sql
supabase db dump --db-url "$SOURCE_DATABASE_URL" -f data.sql --use-copy --data-only \
  -x "storage.buckets_vectors" -x "storage.vector_indexes"
```

參考：[Supabase Database Backups](https://supabase.com/docs/guides/platform/backups)、[Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)。

## 每月安全 Restore drill

本機需有 PostgreSQL 17、Supabase CLI、`jq`，並已完成 `supabase link`。指令只允許還原到 loopback PostgreSQL；`scripts/restore-drill.ts` 會拒絕 Supabase 或其他遠端 hostname。

```bash
npm run restore:drill:local
```

流程會：

1. 建立本機臨時 PostgreSQL 17。
2. 套用所有 Repository migrations。
3. 使用 linked Supabase Project 的 Service Role read-only 匯出 Application Tables，每批 25 筆，避免大型 `raw_body` 查詢 timeout。
4. 從實際 backup artifact 還原資料。
5. 比對所有核心 Table row counts。
6. 停止臨時 PostgreSQL，清空 Secret、backup artifact 與 Database directory。

這是 Application-level drill，不包含 `auth` 使用者完整內容、Storage objects、Vault key、Database roles password 或 Supabase platform settings；正式 Disaster Recovery 必須使用 Supabase Managed restore 或官方 roles／schema／data logical dump。

## 正式 Disaster Recovery

1. 停止 Publish 與 Scheduled Source workflow，記錄事故時間及預期 Restore point。
2. 優先在新 Supabase Project 使用 Managed backup／PITR 或官方 logical dump 還原。
3. 若使用 logical dump，依序還原 `roles.sql`、`schema.sql`、`data.sql`；Vault／column encryption 另依官方文件複製原 Project root key。
4. 重新設定 RLS、Realtime publication、Vercel Environment Variables 與 GitHub Secrets。
5. 在新 Project 執行：

```bash
npm run data:audit
npm test
curl -fsS https://<candidate-domain>/api/health
```

6. 抽查一筆 `matchable`、一筆 `descriptive_only`、一筆 Program Evidence 與一筆 Source snapshot history。
7. 驗證完成後才切換 Vercel Environment Variables／Domain；保留舊 Project 至事故結案。

## 2026-08-13 drill record

- 結果：Passed。
- Backup artifact：80,253,021 bytes，演練後已清除。
- Restore target：本機臨時 PostgreSQL 17，未連接或寫入 Production。
- Row count：Sources 80、Snapshots 549、Source items 2,996、Programs 88、Program versions 383、Field evidence 2,080、Reviews 915、Relationships 0、Activity reports 0。
- 發現並修正：大型 `source_snapshots.raw_body` 不適合與其他 Tables 平行匯出；改為 sequential、每批 25 筆。
