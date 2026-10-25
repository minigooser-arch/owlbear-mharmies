import { METADATA_KEYS } from "../shared/constants";

/**
 * Metadata events include coordinator heartbeats, which do not affect the UI.
 * Compare the full relevant payload instead of relying only on scene.revision:
 * legacy updates and independent manifests may change without incrementing it.
 * Ignore only the coordinator lease and the writeback transport queue.
 */
export function uiMetadataSignature(metadata: Readonly<Record<string, unknown>>): string {
  const raw = metadata[METADATA_KEYS.scene];
  const scene = raw !== null && typeof raw === "object" && !Array.isArray(raw)
    ? Object.fromEntries(
        Object.entries(raw).filter(([key]) => key !== "coordinatorLease")
      )
    : raw;
  return JSON.stringify([
    scene,
    metadata[METADATA_KEYS.gridManifest],
    metadata[METADATA_KEYS.lrLedgerManifest],
    metadata[METADATA_KEYS.demographyAuditManifest]
  ]);
}
