import { METADATA_KEYS } from "../shared/constants";
import type {
  ArmyState,
  BarrierState,
  ItemUpdate,
  SceneItemRecord,
  SceneState,
  ValidationResult
} from "../shared/types";
import { migrateArmyState, migrateBarrierState, migrateSceneState } from "./migrations";

export interface MetadataPort {
  getSceneMetadata(): Promise<Record<string, unknown>>;
  patchSceneMetadata(update: Record<string, unknown>): Promise<void>;
  getSceneItems(): Promise<SceneItemRecord[]>;
  updateSceneItem(id: string, update: ItemUpdate): Promise<void>;
}

export class RevisionConflict extends Error {
  constructor(
    readonly expectedRevision: number,
    readonly actualRevision: number
  ) {
    super(`Revision conflict: expected ${expectedRevision}, got ${actualRevision}`);
    this.name = "RevisionConflict";
  }
}

export class FutureSchemaError extends Error {
  constructor(readonly version: number) {
    super(`Future metadata schema version ${version}`);
    this.name = "FutureSchemaError";
  }
}

export class InvalidMetadataError extends Error {
  constructor(readonly path: string) {
    super(`Invalid metadata at ${path}`);
    this.name = "InvalidMetadataError";
  }
}

function requireValid<T>(result: ValidationResult<T>, path: string): T {
  if (result.ok) return result.value;
  if (result.issue.code === "FUTURE_VERSION") {
    throw new FutureSchemaError(result.issue.version ?? -1);
  }
  throw new InvalidMetadataError(result.issue.path ?? path);
}

function assertRevision(actual: number, expected: number): void {
  if (actual !== expected) throw new RevisionConflict(expected, actual);
}

export interface ArmyRecord {
  item: SceneItemRecord;
  state: ArmyState;
}

export interface BarrierRecord {
  item: SceneItemRecord;
  state: BarrierState;
}

export class MetadataRepository {
  constructor(private readonly port: MetadataPort) {}

  async readScene(): Promise<SceneState> {
    const metadata = await this.port.getSceneMetadata();
    const raw = metadata[METADATA_KEYS.scene] ?? { version: 2 };
    return requireValid(migrateSceneState(raw), METADATA_KEYS.scene);
  }

  async writeScene(state: SceneState, expectedRevision: number): Promise<void> {
    const metadata = await this.port.getSceneMetadata();
    const raw = metadata[METADATA_KEYS.scene] ?? { version: 2 };
    const current = requireValid(migrateSceneState(raw), METADATA_KEYS.scene);
    assertRevision(current.revision, expectedRevision);
    await this.port.patchSceneMetadata({ [METADATA_KEYS.scene]: state });
  }

  async readArmies(): Promise<ArmyRecord[]> {
    const items = await this.port.getSceneItems();
    const records: ArmyRecord[] = [];
    for (const item of items) {
      const raw = item.metadata[METADATA_KEYS.army];
      if (raw === undefined) continue;
      const result = migrateArmyState(raw);
      if (result.ok) records.push({ item, state: result.value });
    }
    return records;
  }

  async writeArmy(itemId: string, state: ArmyState, expectedRevision: number): Promise<void> {
    const item = await this.findItem(itemId);
    const raw = item.metadata[METADATA_KEYS.army];
    const actualRevision =
      raw === undefined ? 0 : requireValid(migrateArmyState(raw), METADATA_KEYS.army).revision;
    assertRevision(actualRevision, expectedRevision);
    await this.port.updateSceneItem(itemId, {
      metadata: { ...item.metadata, [METADATA_KEYS.army]: state }
    });
  }

  async clearArmy(itemId: string): Promise<void> {
    const item = await this.findItem(itemId);
    const metadata = Object.fromEntries(
      Object.entries(item.metadata).filter(([key]) => key !== METADATA_KEYS.army)
    );
    await this.port.updateSceneItem(itemId, { metadata, visible: true });
  }

  async readBarriers(): Promise<BarrierRecord[]> {
    const items = await this.port.getSceneItems();
    const records: BarrierRecord[] = [];
    for (const item of items) {
      const raw = item.metadata[METADATA_KEYS.barrier];
      if (raw === undefined) continue;
      const result = migrateBarrierState(raw);
      if (result.ok) records.push({ item, state: result.value });
    }
    return records;
  }

  private async findItem(itemId: string): Promise<SceneItemRecord> {
    const item = (await this.port.getSceneItems()).find((candidate) => candidate.id === itemId);
    if (!item) throw new InvalidMetadataError(`item:${itemId}`);
    return item;
  }
}
