import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { supabaseConfig } from "../lib/supabase-rest";

const TABLES = [
  "sources",
  "source_snapshots",
  "source_items",
  "programs",
  "program_versions",
  "field_evidence",
  "reviews",
  "program_relationships",
  "activity_reports",
] as const;

type TableName = (typeof TABLES)[number];
type Row = Record<string, unknown>;
type BackupArtifact = {
  format: "gov-welfare-logical-backup-v1";
  createdAt: string;
  sourceHost: string;
  tables: Record<TableName, Row[]>;
};

const source = supabaseConfig(true);
if (!source) throw new Error("Restore drill requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");

const targetDatabaseUrl = process.env.RESTORE_DRILL_DATABASE_URL;
const backupPath = process.env.RESTORE_DRILL_BACKUP_PATH;
if (!targetDatabaseUrl || !backupPath) {
  throw new Error("Restore drill requires RESTORE_DRILL_DATABASE_URL and RESTORE_DRILL_BACKUP_PATH");
}

const target = new URL(targetDatabaseUrl);
if (!new Set(["localhost", "127.0.0.1", "[::1]", "::1"]).has(target.hostname)) {
  throw new Error("Restore drill target must be a local PostgreSQL instance; Production and hosted targets are blocked");
}

async function exportTable(table: TableName): Promise<Row[]> {
  const rows: Row[] = [];
  const pageSize = 25;
  let total: number | null = null;

  while (total === null || rows.length < total) {
    const response = await fetch(`${source!.url}/rest/v1/${table}?select=*`, {
      headers: {
        apikey: source!.key,
        Authorization: `Bearer ${source!.key}`,
        Prefer: "count=exact",
        Range: `${rows.length}-${rows.length + pageSize - 1}`,
        "Range-Unit": "items",
      },
    });
    if (!response.ok) throw new Error(`Backup export ${table} failed: ${response.status} ${(await response.text()).slice(0, 300)}`);
    const contentRange = response.headers.get("content-range");
    const match = contentRange?.match(/\/(\d+)$/);
    if (!match) throw new Error(`Backup export ${table} did not return an exact row count`);
    total = Number(match[1]);
    const page = await response.json() as Row[];
    rows.push(...page);
    if (page.length === 0 && rows.length < total) throw new Error(`Backup export ${table} stopped before ${total} rows`);
  }

  assert.equal(rows.length, total, `${table} export row count`);
  return rows;
}

function runPsql(sql: string) {
  const result = spawnSync(process.env.PSQL_BIN ?? "psql", [
    "--dbname", targetDatabaseUrl!,
    "--no-psqlrc",
    "--set", "ON_ERROR_STOP=1",
    "--quiet",
    "--tuples-only",
    "--no-align",
  ], { input: sql, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`Local restore failed: ${(result.stderr || result.stdout).slice(0, 1_000)}`);
  return result.stdout.trim();
}

function sqlJson(rows: Row[]) {
  const value = JSON.stringify(rows);
  if (value.includes("$gov_welfare_backup$")) throw new Error("Backup payload contains the SQL delimiter");
  return `$gov_welfare_backup$${value}$gov_welfare_backup$`;
}

async function main() {
  const exported: Row[][] = [];
  for (const table of TABLES) exported.push(await exportTable(table));
  const artifact: BackupArtifact = {
    format: "gov-welfare-logical-backup-v1",
    createdAt: new Date().toISOString(),
    sourceHost: new URL(source!.url).hostname,
    tables: Object.fromEntries(TABLES.map((table, index) => [table, exported[index]])) as BackupArtifact["tables"],
  };
  writeFileSync(backupPath!, JSON.stringify(artifact), { encoding: "utf8", mode: 0o600 });

  const backup = JSON.parse(readFileSync(backupPath!, "utf8")) as BackupArtifact;
  assert.equal(backup.format, "gov-welfare-logical-backup-v1");
  const targetRows = Number(runPsql(`select ${TABLES.map((table) => `(select count(*) from public.${table})`).join(" + ")};`));
  if (targetRows !== 0) throw new Error("Restore drill target is not empty");

  const reviewerIds = new Set<string>();
  for (const row of backup.tables.program_versions) if (typeof row.created_by === "string") reviewerIds.add(row.created_by);
  for (const row of backup.tables.reviews) if (typeof row.reviewer_id === "string") reviewerIds.add(row.reviewer_id);

  const statements = ["begin;", "set session_replication_role = replica;"];
  if (reviewerIds.size > 0) {
    statements.push(`insert into auth.users(id) values ${[...reviewerIds].map((id) => `('${id}'::uuid)`).join(",")} on conflict (id) do nothing;`);
  }
  for (const table of TABLES) {
    const rows = backup.tables[table];
    if (rows.length > 0) statements.push(`insert into public.${table} select * from json_populate_recordset(null::public.${table}, ${sqlJson(rows)});`);
  }
  statements.push("commit;");
  runPsql(statements.join("\n"));

  const restoredCounts = Object.fromEntries(TABLES.map((table) => [
    table,
    Number(runPsql(`select count(*) from public.${table};`)),
  ])) as Record<TableName, number>;
  for (const table of TABLES) assert.equal(restoredCounts[table], backup.tables[table].length, `${table} restored row count`);

  console.log(JSON.stringify({ ok: true, createdAt: backup.createdAt, restoredCounts }, null, 2));
}

void main();
