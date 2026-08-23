import { createAdapter } from "../lib/adapters";
import { sources } from "../data/sources";
import { mapWithConcurrency } from "../lib/concurrency";
import { isSourceDue, persistFailedCheck, persistSuccessfulCheck, syncSourceRegistry } from "../lib/ingestion";
import { supabaseConfig, supabaseRest } from "../lib/supabase-rest";

type CheckResult = {
  sourceId: string;
  ok: boolean;
  observedAt: string;
  contentHash?: string;
  etag?: string;
  lastModified?: string;
  draftItems?: number;
  changed?: boolean;
  persistedItems?: number;
  warnings?: string[];
  error?: string;
};

const args = process.argv.slice(2);
const jsonOutput = args.includes("--json");
const persist = args.includes("--persist");
const store = persist ? supabaseConfig(true) : null;
const sourceFlag = args.indexOf("--source");
const requestedId = sourceFlag >= 0 ? args[sourceFlag + 1] : undefined;
const force = args.includes("--force");
const SOURCE_CHECK_CONCURRENCY = 5;
const activeSources = sources.filter((source) => source.status === "active" && (!requestedId || source.id === requestedId));

if (requestedId && activeSources.length === 0) {
  console.error(`Unknown active source: ${requestedId}`);
  process.exit(2);
}
if (persist && !store) {
  console.error("--persist requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}

async function checkSource(sourceId: string): Promise<CheckResult> {
  const source = sources.find((item) => item.id === sourceId);
  if (!source) throw new Error(`Unknown source: ${sourceId}`);
  try {
    const adapter = createAdapter(source);
    const snapshot = await adapter.fetch(source);
    const items = await adapter.extract(snapshot);
    const persisted = store
      ? await persistSuccessfulCheck(store, source, snapshot, items)
      : undefined;
    return {
      sourceId,
      ok: true,
      observedAt: snapshot.observedAt,
      contentHash: snapshot.contentHash,
      etag: snapshot.etag,
      lastModified: snapshot.lastModified,
      draftItems: items.length,
      changed: persisted?.changed,
      persistedItems: persisted?.persistedItems,
      warnings: [...new Set(items.flatMap((item) => item.warnings))],
    };
  } catch (error) {
    const cause = error instanceof Error && "cause" in error ? error.cause : undefined;
    const causeCode = cause && typeof cause === "object" && "code" in cause ? String(cause.code) : undefined;
    const result = {
      sourceId,
      ok: false,
      observedAt: new Date().toISOString(),
      error: `${error instanceof Error ? error.message : String(error)}${causeCode ? ` (${causeCode})` : ""}`,
    };
    if (store) await persistFailedCheck(store, source, result.observedAt, result.error);
    return result;
  }
}

async function main() {
  if (store) await syncSourceRegistry(store, sources);
  let selected = activeSources;
  if (store && !requestedId && !force) {
    const states = await supabaseRest<Array<{ id: string; last_checked_at: string | null; last_check_error: unknown }>>(
      store,
      "sources?select=id,last_checked_at,last_check_error",
    );
    const stateById = new Map(states.map((source) => [source.id, source]));
    selected = selected.filter((source) => {
      const state = stateById.get(source.id);
      return isSourceDue(source, state?.last_checked_at ?? null, new Date(), state?.last_check_error != null);
    });
  }
  const results = await mapWithConcurrency(
    selected,
    SOURCE_CHECK_CONCURRENCY,
    (source) => checkSource(source.id),
  );
  if (jsonOutput) {
    console.log(JSON.stringify({ checkedAt: new Date().toISOString(), dryRun: !persist, results }, null, 2));
  } else {
    for (const result of results) {
      const status = result.ok ? "OK" : "ERROR";
      const persistence = persist ? (result.changed ? ` · saved ${result.persistedItems}` : " · unchanged") : "";
      console.log(`${status.padEnd(5)} ${result.sourceId} ${result.draftItems ?? 0} items ${result.contentHash?.slice(0, 12) ?? "-"}${persistence}`);
      if (result.error) console.log(`      ${result.error}`);
    }
    console.log(persist
      ? "Checks persisted as immutable Snapshots and Source items; Program publishing is handled by the auto-sync step."
      : "Dry run only: no Snapshot or Source item was persisted.");
  }
  if (results.some((result) => !result.ok)) process.exitCode = 1;
}

void main();
