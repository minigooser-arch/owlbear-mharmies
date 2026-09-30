import { METADATA_KEYS } from "../shared/constants";
import type { DemographyAuditEntry, SceneItemRecord } from "../shared/types";
import type { MetadataPort } from "./metadataRepository";
import { utf8Size } from "./gridChunkCodec";

export interface DemographyAuditManifest {
  version: 1;
  revision: number;
  partCount: number;
}

export interface DemographyAuditPart {
  version: 1;
  revision: number;
  index: number;
  entries: DemographyAuditEntry[];
}

export const DEMOGRAPHY_AUDIT_PART_DEFAULT_BUDGET = 24 * 1024;

export class DemographyAuditStorageError extends Error {
  constructor(
    readonly code: "DEMOGRAPHY_AUDIT_INVALID" | "DEMOGRAPHY_AUDIT_MISSING" | "DEMOGRAPHY_AUDIT_PART_TOO_LARGE" | "DEMOGRAPHY_AUDIT_WRITE_FAILED",
    options?: ErrorOptions
  ) {
    super(code, options);
    this.name = "DemographyAuditStorageError";
  }
}

export function readDemographyAuditManifest(metadata: Record<string, unknown>): DemographyAuditManifest | undefined {
  const raw = metadata[METADATA_KEYS.demographyAuditManifest];
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new DemographyAuditStorageError("DEMOGRAPHY_AUDIT_INVALID");
  const manifest = raw as Record<string, unknown>;
  if (manifest.version !== 1 || !Number.isSafeInteger(manifest.revision) || (manifest.revision as number) < 0 ||
      !Number.isSafeInteger(manifest.partCount) || (manifest.partCount as number) < 0) {
    throw new DemographyAuditStorageError("DEMOGRAPHY_AUDIT_INVALID");
  }
  return { version: 1, revision: manifest.revision as number, partCount: manifest.partCount as number };
}

export function demographyAuditPartId(revision: number, index: number): string {
  return `letopis-demography-audit-${revision}-${index}`;
}

function validEntry(value: unknown): value is DemographyAuditEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<DemographyAuditEntry>;
  if (typeof candidate.id !== "string" || !candidate.id || typeof candidate.stateId !== "string" || !candidate.stateId ||
      typeof candidate.actorPlayerId !== "string" || typeof candidate.reason !== "string" || !candidate.reason ||
      typeof candidate.createdAt !== "string" || !candidate.createdAt || !candidate.changes ||
      typeof candidate.changes !== "object" || Array.isArray(candidate.changes)) return false;
  return Object.values(candidate.changes).every((change) => {
    if (!change || typeof change !== "object" || Array.isArray(change)) return false;
    const before = (change as { before?: unknown }).before;
    const after = (change as { after?: unknown }).after;
    return ((typeof before === "number" && Number.isFinite(before)) || typeof before === "string") &&
      ((typeof after === "number" && Number.isFinite(after)) || typeof after === "string");
  });
}

function validatePart(part: unknown, manifest: DemographyAuditManifest, index: number): DemographyAuditEntry[] {
  if (!part || typeof part !== "object" || Array.isArray(part)) throw new DemographyAuditStorageError("DEMOGRAPHY_AUDIT_INVALID");
  const candidate = part as Record<string, unknown>;
  if (candidate.version !== 1 || candidate.revision !== manifest.revision || candidate.index !== index ||
      !Array.isArray(candidate.entries) || candidate.entries.some((entry) => !validEntry(entry))) {
    throw new DemographyAuditStorageError("DEMOGRAPHY_AUDIT_INVALID");
  }
  return candidate.entries.map((entry) => structuredClone(entry as DemographyAuditEntry));
}

export function splitDemographyAuditParts(
  entries: readonly DemographyAuditEntry[],
  revision: number,
  maxBytes = DEMOGRAPHY_AUDIT_PART_DEFAULT_BUDGET
): DemographyAuditPart[] {
  if (!Number.isSafeInteger(revision) || revision < 0 || !Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new DemographyAuditStorageError("DEMOGRAPHY_AUDIT_PART_TOO_LARGE");
  }
  const parts: DemographyAuditPart[] = [];
  let current: DemographyAuditEntry[] = [];
  const flush = () => {
    if (!current.length) return;
    const part: DemographyAuditPart = { version: 1, revision, index: parts.length, entries: current };
    if (utf8Size(part) > maxBytes) throw new DemographyAuditStorageError("DEMOGRAPHY_AUDIT_PART_TOO_LARGE");
    parts.push(part);
    current = [];
  };
  for (const entry of entries) {
    const candidate: DemographyAuditPart = {
      version: 1,
      revision,
      index: parts.length,
      entries: [...current, structuredClone(entry)]
    };
    if (utf8Size(candidate) > maxBytes && current.length) {
      flush();
      current = [structuredClone(entry)];
      if (utf8Size({ version: 1, revision, index: parts.length, entries: current }) > maxBytes) {
        throw new DemographyAuditStorageError("DEMOGRAPHY_AUDIT_PART_TOO_LARGE");
      }
    } else {
      current = candidate.entries;
    }
  }
  flush();
  return parts;
}

export interface StagedDemographyAudit {
  manifest: DemographyAuditManifest;
  additions: SceneItemRecord[];
  superseded: string[];
}

function partRecord(part: DemographyAuditPart): SceneItemRecord {
  return {
    id: demographyAuditPartId(part.revision, part.index),
    type: "LABEL",
    name: `Letopis demography audit ${part.revision}/${part.index}`,
    text: "",
    position: { x: 0, y: 0 },
    visible: false,
    locked: true,
    disableHit: true,
    layer: "FOG",
    metadata: { [METADATA_KEYS.demographyAuditPart]: part }
  };
}

export class DemographyAuditRepository {
  constructor(private readonly port: MetadataPort) {}

  async read(metadata: Record<string, unknown>, sceneItems?: readonly SceneItemRecord[]): Promise<DemographyAuditEntry[] | undefined> {
    const manifest = readDemographyAuditManifest(metadata);
    if (!manifest) return undefined;
    if (manifest.partCount === 0) return [];
    const items = sceneItems ?? await this.port.getSceneItems();
    const byId = new Map(items.map((item) => [item.id, item]));
    const entries: DemographyAuditEntry[] = [];
    for (let index = 0; index < manifest.partCount; index++) {
      const item = byId.get(demographyAuditPartId(manifest.revision, index));
      if (!item) throw new DemographyAuditStorageError("DEMOGRAPHY_AUDIT_MISSING");
      entries.push(...validatePart(item.metadata[METADATA_KEYS.demographyAuditPart], manifest, index));
    }
    return entries;
  }

  async stage(
    current: readonly DemographyAuditEntry[],
    next: readonly DemographyAuditEntry[],
    previous: DemographyAuditManifest | undefined,
    sceneItems?: readonly SceneItemRecord[],
    sceneRevision = 0
  ): Promise<StagedDemographyAudit> {
    if (JSON.stringify(current) === JSON.stringify(next) && previous) {
      return { manifest: previous, additions: [], superseded: [] };
    }
    const sourceItems = sceneItems ?? (previous ? await this.port.getSceneItems() : []);
    const revision = previous ? Math.max(previous.revision + 1, sceneRevision) : Math.max(0, sceneRevision);
    const parts = splitDemographyAuditParts(next, revision);
    const additions: SceneItemRecord[] = [];
    const sourceById = new Map(sourceItems.map((item) => [item.id, item]));
    for (const part of parts) {
      const id = demographyAuditPartId(part.revision, part.index);
      const existing = sourceById.get(id);
      if (!existing) additions.push(partRecord(part));
      else if (JSON.stringify(existing.metadata[METADATA_KEYS.demographyAuditPart]) !== JSON.stringify(part)) {
        throw new DemographyAuditStorageError("DEMOGRAPHY_AUDIT_INVALID");
      }
    }
    const superseded = previous
      ? Array.from({ length: previous.partCount }, (_, index) => demographyAuditPartId(previous.revision, index))
      : [];
    return { manifest: { version: 1, revision, partCount: parts.length }, additions, superseded };
  }

  async cleanup(ids: readonly string[]): Promise<void> {
    if (!ids.length || !this.port.deleteSceneItems) return;
    try {
      const metadata = await this.port.getSceneMetadata();
      const manifest = readDemographyAuditManifest(metadata);
      const active = new Set<string>();
      if (manifest) {
        for (let index = 0; index < manifest.partCount; index++) active.add(demographyAuditPartId(manifest.revision, index));
      }
      const removable = ids.filter((id) => !active.has(id));
      if (removable.length) await this.port.deleteSceneItems(removable);
    } catch (error) {
      console.warn("DEMOGRAPHY_AUDIT_CLEANUP_FAILED", error);
    }
  }
}

