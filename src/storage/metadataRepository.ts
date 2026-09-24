import { METADATA_KEYS } from "../shared/constants";
import type {
  ArmyState,
  BarrierState,
  ItemUpdate,
  SceneItemRecord,
  SceneState,
  ShipState,
  ValidationResult
} from "../shared/types";
import { migrateArmyState, migrateBarrierState, migrateSceneState, migrateShipState } from "./migrations";
import { GridChunkRepository, readGridManifest } from "./gridChunkRepository";
import { GridStorageError, utf8Size } from "./gridChunkCodec";
import { compactDefaultTerrain } from "../terrain/gridMap";
import { sendBatches } from "../owlbear/boundedBatches";

export interface MetadataPort {
  getSceneMetadata(): Promise<Record<string, unknown>>;
  patchSceneMetadata(update: Record<string, unknown>): Promise<void>;
  getSceneItems(): Promise<SceneItemRecord[]>;
  addSceneItems?(items: readonly SceneItemRecord[]): Promise<void>;
  deleteSceneItems?(ids: readonly string[]): Promise<void>;
  updateSceneItem(id: string, update: ItemUpdate): Promise<void>;
  patchSceneItemMetadata?(
    id: string,
    key: string,
    value: unknown | undefined,
    update?: ItemUpdate,
    expectedRevision?: number | null
  ): Promise<void>;
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

export class CommitPreconditionFailed extends Error {
  constructor() {
    super("Scene write precondition failed");
    this.name = "CommitPreconditionFailed";
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

export interface ShipRecord {
  item: SceneItemRecord;
  state: ShipState;
}

export interface BarrierRecord {
  item: SceneItemRecord;
  state: BarrierState;
}

export interface MetadataItemFrame {
  readonly items: readonly SceneItemRecord[];
  readonly armies: readonly ArmyRecord[];
  readonly ships: readonly ShipRecord[];
  readonly barriers: readonly BarrierRecord[];
  readonly sceneMetadata: Readonly<Record<string, unknown>>;
  readonly baseScene: SceneState;
}

export interface MetadataReadFrame {
  readonly items: MetadataItemFrame;
  readonly scene: SceneState;
}

function sameSceneAndManifest(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  return JSON.stringify([left[METADATA_KEYS.scene], left[METADATA_KEYS.gridManifest]]) ===
    JSON.stringify([right[METADATA_KEYS.scene], right[METADATA_KEYS.gridManifest]]);
}

export class MetadataRepository {
  constructor(private readonly port: MetadataPort) {}

  async readScene(): Promise<SceneState> {
    return (await this.readSnapshot()).state;
  }

  async readCoordinatorLease(): Promise<SceneState["coordinatorLease"]> {
    const metadata = await this.port.getSceneMetadata();
    return requireValid(
      migrateSceneState(metadata[METADATA_KEYS.scene] ?? { version: 5 }),
      METADATA_KEYS.scene
    ).coordinatorLease;
  }

  private async readSnapshot(): Promise<{ state: SceneState; metadata: Record<string, unknown> }> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const metadata = await this.port.getSceneMetadata();
      const state = requireValid(
        migrateSceneState(metadata[METADATA_KEYS.scene] ?? { version: 5 }),
        METADATA_KEYS.scene
      );
      if (!readGridManifest(metadata)) return { state, metadata };
      let grid: SceneState["gridMap"] | undefined;
      let failure: unknown;
      try { grid = await new GridChunkRepository(this.port).read(metadata); } catch (error) { failure = error; }
      const latest = await this.port.getSceneMetadata();
      if (!sameSceneAndManifest(metadata, latest)) continue;
      if (failure) throw failure;
      if (!grid || grid.revision !== state.gridMap.revision) throw new GridStorageError("GRID_CHUNK_INVALID");
      return { state: { ...state, gridMap: grid }, metadata };
    }
    throw new GridStorageError("GRID_CHUNK_MISSING");
  }

  async readItemFrame(): Promise<MetadataItemFrame> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const sceneMetadata = await this.port.getSceneMetadata();
      const baseScene = requireValid(
        migrateSceneState(sceneMetadata[METADATA_KEYS.scene] ?? { version: 5 }),
        METADATA_KEYS.scene
      );
      const items = await this.port.getSceneItems();
      const latest = await this.port.getSceneMetadata();
      if (!sameSceneAndManifest(sceneMetadata, latest)) continue;

      const armies: ArmyRecord[] = [];
      const ships: ShipRecord[] = [];
      const barriers: BarrierRecord[] = [];
      for (const item of items) {
        const rawArmy = item.metadata[METADATA_KEYS.army];
        if (rawArmy !== undefined) {
          const result = migrateArmyState(rawArmy);
          if (result.ok) armies.push({ item, state: result.value });
        }
        const rawShip = item.metadata[METADATA_KEYS.ship];
        if (rawShip !== undefined) {
          const result = migrateShipState(rawShip);
          if (result.ok) ships.push({ item, state: result.value });
        }
        const rawBarrier = item.metadata[METADATA_KEYS.barrier];
        if (rawBarrier !== undefined) {
          const result = migrateBarrierState(rawBarrier);
          if (result.ok) barriers.push({ item, state: result.value });
        }
      }
      return {
        items,
        armies,
        ships,
        barriers,
        sceneMetadata,
        baseScene
      };
    }
    throw new GridStorageError("GRID_CHUNK_MISSING");
  }

  async readFrame(frame?: MetadataItemFrame): Promise<MetadataReadFrame> {
    let items = frame;
    for (let attempt = 0; attempt < 3; attempt++) {
      items ??= await this.readItemFrame();
      let grid: SceneState["gridMap"] | undefined;
      let failure: unknown;
      try {
        grid = await new GridChunkRepository(this.port).read(
          items.sceneMetadata as Record<string, unknown>, items.items
        );
      } catch (error) { failure = error; }
      const latest = await this.port.getSceneMetadata();
      if (!sameSceneAndManifest(items.sceneMetadata as Record<string, unknown>, latest)) {
        items = undefined;
        continue;
      }
      if (failure) throw failure;
      if (readGridManifest(items.sceneMetadata as Record<string, unknown>) &&
        (!grid || grid.revision !== items.baseScene.gridMap.revision)) {
        throw new GridStorageError("GRID_CHUNK_INVALID");
      }
      return {
        items,
        scene: grid ? { ...items.baseScene, gridMap: grid } : items.baseScene
      };
    }
    throw new GridStorageError("GRID_CHUNK_MISSING");
  }

  async writeScene(
    state: SceneState,
    expectedRevision: number,
    canCommit: (current: SceneState) => boolean = () => true
  ): Promise<void> {
    const { state: current, metadata } = await this.readSnapshot();
    assertRevision(current.revision, expectedRevision);
    if (!canCommit(current)) throw new CommitPreconditionFailed();
    const next = { ...state, terrain: { ...state.terrain, defaultTerrainId: "sea" }, gridMap: compactDefaultTerrain(state.gridMap, "sea") };
    if (!this.port.addSceneItems || !this.port.deleteSceneItems) {
      // Legacy embedding ports may still write small scenes, but never destroy an existing manifest.
      if (readGridManifest(metadata)) throw new GridStorageError("GRID_CHUNK_WRITE_FAILED");
      const update = { [METADATA_KEYS.scene]: next };
      if (utf8Size(update) > 48 * 1024) throw new GridStorageError("GRID_METADATA_TOO_LARGE");
      await this.port.patchSceneMetadata(update);
      return;
    }
    const chunks = new GridChunkRepository(this.port);
    const addSceneItems = this.port.addSceneItems.bind(this.port);
    const staged = chunks.stage(current.gridMap, next.gridMap, readGridManifest(metadata));
    const update = { [METADATA_KEYS.scene]: { ...next, gridMap: { ...next.gridMap, cells: {} } }, [METADATA_KEYS.gridManifest]: staged.manifest };
    if (utf8Size(update) > 48 * 1024) throw new GridStorageError("GRID_METADATA_TOO_LARGE");
    try {
      try {
        await sendBatches(staged.additions, addSceneItems);
      } catch (cause) { throw new GridStorageError("GRID_CHUNK_WRITE_FAILED", { cause }); }
      const latest = await this.readScene();
      assertRevision(latest.revision, expectedRevision);
      if (!canCommit(latest)) throw new CommitPreconditionFailed();
      try { await this.port.patchSceneMetadata(update); }
      catch (cause) { throw new GridStorageError("GRID_MANIFEST_WRITE_FAILED", { cause }); }
    } catch (error) {
      await chunks.cleanup(staged.additions.map(item => item.id));
      throw error;
    }
    await chunks.cleanup(staged.superseded);
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
    if (this.port.patchSceneItemMetadata) {
      await this.port.patchSceneItemMetadata(
        itemId,
        METADATA_KEYS.army,
        state,
        {},
        raw === undefined ? null : expectedRevision
      );
      return;
    }
    await this.port.updateSceneItem(itemId, {
      metadata: { ...item.metadata, [METADATA_KEYS.army]: state }
    });
  }

  async clearArmy(itemId: string): Promise<void> {
    const item = await this.findItem(itemId);
    if (this.port.patchSceneItemMetadata) {
      const raw = item.metadata[METADATA_KEYS.army];
      const expectedRevision = raw === undefined
        ? null
        : requireValid(migrateArmyState(raw), METADATA_KEYS.army).revision;
      await this.port.patchSceneItemMetadata(itemId, METADATA_KEYS.army, undefined, {
        visible: true
      }, expectedRevision);
      return;
    }
    const metadata = Object.fromEntries(
      Object.entries(item.metadata).filter(([key]) => key !== METADATA_KEYS.army)
    );
    await this.port.updateSceneItem(itemId, { metadata, visible: true });
  }

  async readShips(): Promise<ShipRecord[]> {
    const items = await this.port.getSceneItems();
    const records: ShipRecord[] = [];
    for (const item of items) {
      const raw = item.metadata[METADATA_KEYS.ship];
      if (raw === undefined) continue;
      const result = migrateShipState(raw);
      if (result.ok) records.push({ item, state: result.value });
    }
    return records;
  }

  async writeShip(itemId: string, state: ShipState, expectedRevision: number): Promise<void> {
    const item = await this.findItem(itemId);
    const raw = item.metadata[METADATA_KEYS.ship];
    const actualRevision =
      raw === undefined ? 0 : requireValid(migrateShipState(raw), METADATA_KEYS.ship).revision;
    assertRevision(actualRevision, expectedRevision);
    if (this.port.patchSceneItemMetadata) {
      await this.port.patchSceneItemMetadata(
        itemId,
        METADATA_KEYS.ship,
        state,
        {},
        raw === undefined ? null : expectedRevision
      );
      return;
    }
    await this.port.updateSceneItem(itemId, {
      metadata: { ...item.metadata, [METADATA_KEYS.ship]: state }
    });
  }

  async clearShip(itemId: string): Promise<void> {
    const item = await this.findItem(itemId);
    if (this.port.patchSceneItemMetadata) {
      const raw = item.metadata[METADATA_KEYS.ship];
      const expectedRevision = raw === undefined
        ? null
        : requireValid(migrateShipState(raw), METADATA_KEYS.ship).revision;
      await this.port.patchSceneItemMetadata(itemId, METADATA_KEYS.ship, undefined, {
        visible: true
      }, expectedRevision);
      return;
    }
    const metadata = Object.fromEntries(
      Object.entries(item.metadata).filter(([key]) => key !== METADATA_KEYS.ship)
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
