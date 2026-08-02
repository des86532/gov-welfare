import type { DraftSourceItem, RawSnapshot, SourceConfig } from "@/lib/domain";
import { supabaseRest, type SupabaseConfig } from "@/lib/supabase-rest";
import { newTaipeiSourceClassifications } from "@/data/new-taipei-source-items";
import { taipeiSourceClassifications } from "@/data/taipei-source-items";
import { taichungSourceClassifications } from "@/data/taichung-source-items";
import { taoyuanSourceClassifications } from "@/data/taoyuan-source-items";

const classificationsBySource = new Map([
  ["taoyuan-welfare-open-data", new Map(taoyuanSourceClassifications.map((item) => [item.title, item]))],
  ["new-taipei-welfare-open-data", new Map(newTaipeiSourceClassifications.map((item) => [item.title, item]))],
  ["taipei-social-aid-open-data", new Map(taipeiSourceClassifications.map((item) => [item.title, item]))],
  ["taichung-social-aid-open-data", new Map(taichungSourceClassifications.map((item) => [item.title, item]))],
]);

export type PersistResult = {
  changed: boolean;
  snapshotId?: string;
  persistedItems: number;
};

export function isSourceDue(source: SourceConfig, lastCheckedAt: string | null, now = new Date(), lastCheckFailed = false): boolean {
  if (!source.checkEveryHours) return false;
  if (lastCheckFailed) return true;
  if (!lastCheckedAt) return true;
  const checkedAt = Date.parse(lastCheckedAt);
  return !Number.isFinite(checkedAt) || now.getTime() - checkedAt >= source.checkEveryHours * 60 * 60 * 1_000;
}

export async function syncSourceRegistry(config: SupabaseConfig, sourceConfigs: SourceConfig[]) {
  await supabaseRest(config, "sources?on_conflict=id", {
    method: "POST",
    body: JSON.stringify(sourceConfigs.map((source) => ({
      id: source.id,
      name: source.name,
      authority: source.authority,
      jurisdiction: source.jurisdiction,
      official_url: source.publicUrl ?? source.url,
      format: source.format,
      roles: source.roles,
      automation_level: source.automation,
      adapter_key: source.adapterKey,
      check_every_hours: source.checkEveryHours,
      catalog_modified_at: source.catalogModifiedAt ?? null,
      resource_modified_at: source.resourceModifiedAt ?? null,
      last_verified_at: source.lastVerifiedAt,
      crawler_required: source.crawlerRequired,
      status: source.status,
      blocked_reason: source.status === "blocked" ? source.note ?? "Source blocked" : null,
      config: { fetchUrl: source.url, publicUrl: source.publicUrl, hashIgnoreSelectors: source.hashIgnoreSelectors, note: source.note },
    }))),
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
  });
}

function persistedItem(source: SourceConfig, snapshotId: string, item: DraftSourceItem) {
  const curated = classificationsBySource.get(source.id)?.get(item.title);
  const isStructuredApi = source.automation === "structured_extract";
  return {
    source_id: source.id,
    snapshot_id: snapshotId,
    external_id: item.externalId,
    title: item.title,
    raw_data: item.raw,
    canonical_draft: { ...item.canonicalDraft, extractionWarnings: item.warnings },
    unknown_fields: item.unknownFields,
    classification: curated?.classification ?? (isStructuredApi ? "descriptive_only" : null),
    classification_rationale: curated?.rationale ?? (isStructuredApi ? "Structured government API passthrough；保留官方連結，不自動建立資格 Rule。" : null),
    review_status: isStructuredApi ? "published" : "draft",
  };
}

export async function persistSuccessfulCheck(
  config: SupabaseConfig,
  source: SourceConfig,
  snapshot: RawSnapshot,
  items: DraftSourceItem[],
): Promise<PersistResult> {
  const hash = encodeURIComponent(snapshot.contentHash);
  const existing = await supabaseRest<Array<{ id: string }>>(
    config,
    `source_snapshots?select=id&source_id=eq.${encodeURIComponent(source.id)}&content_hash=eq.${hash}&limit=1`,
  );
  let snapshotId = existing[0]?.id;
  if (!snapshotId) {
    const [created] = await supabaseRest<Array<{ id: string }>>(config, "source_snapshots", {
      method: "POST",
      body: JSON.stringify({
        source_id: source.id,
        observed_at: snapshot.observedAt,
        http_status: snapshot.status,
        content_type: snapshot.contentType,
        etag: snapshot.etag ?? null,
        last_modified: snapshot.lastModified ?? null,
        content_hash: snapshot.contentHash,
        raw_body: snapshot.body,
      }),
      headers: { Prefer: "return=representation" },
    });
    snapshotId = created?.id;
  }
  if (!snapshotId) throw new Error(`${source.id}: snapshot insert returned no row`);
  if (items.length > 0) {
    await supabaseRest(config, "source_items?on_conflict=snapshot_id,external_id", {
      method: "POST",
      body: JSON.stringify(items.map((item) => persistedItem(source, snapshotId, item))),
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    });
  }
  await supabaseRest(config, `sources?id=eq.${encodeURIComponent(source.id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      last_checked_at: snapshot.observedAt,
      last_successful_fetch_at: snapshot.observedAt,
      last_check_error: null,
    }),
    headers: { Prefer: "return=minimal" },
  });
  return { changed: !existing[0], snapshotId, persistedItems: existing[0] ? 0 : items.length };
}

export async function persistFailedCheck(
  config: SupabaseConfig,
  source: SourceConfig,
  observedAt: string,
  error: string,
): Promise<void> {
  await Promise.all([
    supabaseRest(config, "source_snapshots", {
      method: "POST",
      body: JSON.stringify({
        source_id: source.id,
        observed_at: observedAt,
        http_status: 0,
        content_hash: null,
        fetch_error: { message: error },
      }),
      headers: { Prefer: "return=minimal" },
    }),
    supabaseRest(config, `sources?id=eq.${encodeURIComponent(source.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        last_checked_at: observedAt,
        last_check_error: { message: error },
      }),
      headers: { Prefer: "return=minimal" },
    }),
  ]);
}
