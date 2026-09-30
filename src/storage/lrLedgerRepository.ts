import { METADATA_KEYS } from "../shared/constants";
import type { LRTransaction, SceneItemRecord } from "../shared/types";
import type { MetadataPort } from "./metadataRepository";
import { utf8Size } from "./gridChunkCodec";

export interface LRLedgerManifest {
  version: 1;
  revision: number;
  partCount: number;
}

export interface LRLedgerPart {
  version: 1;
  revision: number;
  index: number;
  transactions: LRTransaction[];
}

export const LR_LEDGER_PART_DEFAULT_BUDGET = 24 * 1024;

export class LRLedgerStorageError extends Error {
  constructor(readonly code: "LR_LEDGER_INVALID" | "LR_LEDGER_MISSING" | "LR_LEDGER_PART_TOO_LARGE" | "LR_LEDGER_WRITE_FAILED", options?: ErrorOptions) {
    super(code, options);
    this.name = "LRLedgerStorageError";
  }
}

export function readLRLedgerManifest(metadata: Record<string, unknown>): LRLedgerManifest | undefined {
  const raw = metadata[METADATA_KEYS.lrLedgerManifest];
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new LRLedgerStorageError("LR_LEDGER_INVALID");
  const manifest = raw as Record<string, unknown>;
  if (manifest.version !== 1 || !Number.isSafeInteger(manifest.revision) || (manifest.revision as number) < 0 ||
      !Number.isSafeInteger(manifest.partCount) || (manifest.partCount as number) < 0) {
    throw new LRLedgerStorageError("LR_LEDGER_INVALID");
  }
  return {
    version: 1,
    revision: manifest.revision as number,
    partCount: manifest.partCount as number
  };
}

export function lrLedgerPartId(revision: number, index: number): string {
  return `letopis-lr-ledger-${revision}-${index}`;
}

function validTransaction(value: unknown): value is LRTransaction {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<LRTransaction>;
  return typeof candidate.id === "string" && candidate.id.length > 0 &&
    typeof candidate.requestId === "string" && candidate.requestId.length > 0 &&
    typeof candidate.createdAt === "string" && typeof candidate.turnNumber === "number" &&
    typeof candidate.actorPlayerId === "string" && typeof candidate.sideId === "string" &&
    typeof candidate.sideName === "string" && typeof candidate.armyId === "string" &&
    typeof candidate.armyName === "string" && typeof candidate.kind === "string" &&
    typeof candidate.hp === "number" && typeof candidate.ratePerHp === "number" &&
    typeof candidate.amount === "number" && (candidate.status === "PENDING" || candidate.status === "RECORDED");
}

function validatePart(part: unknown, manifest: LRLedgerManifest, index: number): LRTransaction[] {
  if (!part || typeof part !== "object" || Array.isArray(part)) throw new LRLedgerStorageError("LR_LEDGER_INVALID");
  const candidate = part as Record<string, unknown>;
  if (candidate.version !== 1 || candidate.revision !== manifest.revision || candidate.index !== index ||
      !Array.isArray(candidate.transactions) || candidate.transactions.some((entry) => !validTransaction(entry))) {
    throw new LRLedgerStorageError("LR_LEDGER_INVALID");
  }
  return candidate.transactions.map((entry) => structuredClone(entry as LRTransaction));
}

export function splitLRLedgerParts(
  transactions: readonly LRTransaction[],
  revision: number,
  maxBytes = LR_LEDGER_PART_DEFAULT_BUDGET
): LRLedgerPart[] {
  if (!Number.isSafeInteger(revision) || revision < 0 || !Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new LRLedgerStorageError("LR_LEDGER_PART_TOO_LARGE");
  }
  const parts: LRLedgerPart[] = [];
  let current: LRTransaction[] = [];
  const flush = () => {
    if (!current.length) return;
    const part: LRLedgerPart = { version: 1, revision, index: parts.length, transactions: current };
    if (utf8Size(part) > maxBytes) throw new LRLedgerStorageError("LR_LEDGER_PART_TOO_LARGE");
    parts.push(part);
    current = [];
  };
  for (const transaction of transactions) {
    const candidate: LRLedgerPart = {
      version: 1,
      revision,
      index: parts.length,
      transactions: [...current, structuredClone(transaction)]
    };
    if (utf8Size(candidate) > maxBytes && current.length) {
      flush();
      current = [structuredClone(transaction)];
      if (utf8Size({ version: 1, revision, index: parts.length, transactions: current }) > maxBytes) {
        throw new LRLedgerStorageError("LR_LEDGER_PART_TOO_LARGE");
      }
    } else {
      current = candidate.transactions;
    }
  }
  flush();
  return parts;
}

export interface StagedLRLedger {
  manifest: LRLedgerManifest;
  additions: SceneItemRecord[];
  superseded: string[];
}

function partRecord(part: LRLedgerPart): SceneItemRecord {
  return {
    id: lrLedgerPartId(part.revision, part.index),
    type: "LABEL",
    name: `Letopis LR ledger ${part.revision}/${part.index}`,
    text: "",
    position: { x: 0, y: 0 },
    visible: false,
    locked: true,
    disableHit: true,
    layer: "FOG",
    metadata: { [METADATA_KEYS.lrLedgerPart]: part }
  };
}

export class LRLedgerRepository {
  constructor(private readonly port: MetadataPort) {}

  async read(metadata: Record<string, unknown>, sceneItems?: readonly SceneItemRecord[]): Promise<LRTransaction[] | undefined> {
    const manifest = readLRLedgerManifest(metadata);
    if (!manifest) return undefined;
    if (manifest.partCount === 0) return [];
    const items = sceneItems ?? await this.port.getSceneItems();
    const byId = new Map(items.map((item) => [item.id, item]));
    const transactions: LRTransaction[] = [];
    for (let index = 0; index < manifest.partCount; index++) {
      const item = byId.get(lrLedgerPartId(manifest.revision, index));
      if (!item) throw new LRLedgerStorageError("LR_LEDGER_MISSING");
      const part = item.metadata[METADATA_KEYS.lrLedgerPart];
      transactions.push(...validatePart(part, manifest, index));
    }
    return transactions;
  }

  async stage(
    current: readonly LRTransaction[],
    next: readonly LRTransaction[],
    previous: LRLedgerManifest | undefined,
    sceneItems?: readonly SceneItemRecord[],
    sceneRevision = 0
  ): Promise<StagedLRLedger> {
    const same = JSON.stringify(current) === JSON.stringify(next);
    if (same && previous) return { manifest: previous, additions: [], superseded: [] };
    const sourceItems = sceneItems ?? (previous ? await this.port.getSceneItems() : []);
    const revision = previous ? Math.max(previous.revision + 1, sceneRevision) : Math.max(0, sceneRevision);
    const parts = splitLRLedgerParts(next, revision);
    const additions: SceneItemRecord[] = [];
    const sourceById = new Map(sourceItems.map((item) => [item.id, item]));
    for (const part of parts) {
      const id = lrLedgerPartId(part.revision, part.index);
      const existing = sourceById.get(id);
      if (!existing) additions.push(partRecord(part));
      else if (JSON.stringify(existing.metadata[METADATA_KEYS.lrLedgerPart]) !== JSON.stringify(part)) {
        throw new LRLedgerStorageError("LR_LEDGER_INVALID");
      }
    }
    const superseded = previous
      ? Array.from({ length: previous.partCount }, (_, index) => lrLedgerPartId(previous.revision, index))
      : [];
    return { manifest: { version: 1, revision, partCount: parts.length }, additions, superseded };
  }

  async cleanup(ids: readonly string[]): Promise<void> {
    if (!ids.length || !this.port.deleteSceneItems) return;
    try {
      const metadata = await this.port.getSceneMetadata();
      const manifest = readLRLedgerManifest(metadata);
      const active = new Set<string>();
      if (manifest) {
        for (let index = 0; index < manifest.partCount; index++) active.add(lrLedgerPartId(manifest.revision, index));
      }
      const removable = ids.filter((id) => !active.has(id));
      if (removable.length) await this.port.deleteSceneItems(removable);
    } catch (error) {
      console.warn("LR_LEDGER_CLEANUP_FAILED", error);
    }
  }
}

