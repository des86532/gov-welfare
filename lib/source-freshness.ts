export type FreshnessSource = {
  automation_level: string;
  last_check_error: unknown;
};

export function evidenceNeedsReview(
  source: FreshnessSource | undefined,
  evidenceSnapshotId: string,
  latestSnapshotId: string | undefined,
): boolean {
  if (source?.automation_level === "structured_extract") return false;
  return !source || source.last_check_error != null || !latestSnapshotId || latestSnapshotId !== evidenceSnapshotId;
}
