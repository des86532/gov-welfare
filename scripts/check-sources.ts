import { createAdapter } from "../lib/adapters";
import { sources } from "../data/sources";

type CheckResult = {
  sourceId: string;
  ok: boolean;
  observedAt: string;
  contentHash?: string;
  etag?: string;
  lastModified?: string;
  draftItems?: number;
  warnings?: string[];
  error?: string;
};

const args = process.argv.slice(2);
const jsonOutput = args.includes("--json");
const sourceFlag = args.indexOf("--source");
const requestedId = sourceFlag >= 0 ? args[sourceFlag + 1] : undefined;
const selected = sources.filter((source) => source.status === "active" && (!requestedId || source.id === requestedId));

if (requestedId && selected.length === 0) {
  console.error(`Unknown active source: ${requestedId}`);
  process.exit(2);
}

async function checkSource(sourceId: string): Promise<CheckResult> {
  const source = sources.find((item) => item.id === sourceId);
  if (!source) throw new Error(`Unknown source: ${sourceId}`);
  try {
    const adapter = createAdapter(source);
    const snapshot = await adapter.fetch(source);
    const items = await adapter.extract(snapshot);
    return {
      sourceId,
      ok: true,
      observedAt: snapshot.observedAt,
      contentHash: snapshot.contentHash,
      etag: snapshot.etag,
      lastModified: snapshot.lastModified,
      draftItems: items.length,
      warnings: [...new Set(items.flatMap((item) => item.warnings))],
    };
  } catch (error) {
    const cause = error instanceof Error && "cause" in error ? error.cause : undefined;
    const causeCode = cause && typeof cause === "object" && "code" in cause ? String(cause.code) : undefined;
    return {
      sourceId,
      ok: false,
      observedAt: new Date().toISOString(),
      error: `${error instanceof Error ? error.message : String(error)}${causeCode ? ` (${causeCode})` : ""}`,
    };
  }
}

async function main() {
  const results = await Promise.all(selected.map((source) => checkSource(source.id)));
  if (jsonOutput) {
    console.log(JSON.stringify({ checkedAt: new Date().toISOString(), dryRun: true, results }, null, 2));
  } else {
    for (const result of results) {
      const status = result.ok ? "OK" : "ERROR";
      console.log(`${status.padEnd(5)} ${result.sourceId} ${result.draftItems ?? 0} drafts ${result.contentHash?.slice(0, 12) ?? "-"}`);
      if (result.error) console.log(`      ${result.error}`);
    }
    console.log("Dry run only: no Draft was persisted and no Published version was changed.");
  }
  if (results.some((result) => !result.ok)) process.exitCode = 1;
}

void main();
