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
import { GridChunkDecodeCache, GridChunkRepository, readGridManifest, type StagedGrid } from "./gridChunkRepository";
import { GridStorageError, utf8Size } from "./gridChunkCodec";
import { compactDefaultTerrain } from "../terrain/gridMap";
import { sendBatches } from "../owlbear/boundedBatches";
import { LRLedgerRepository, readLRLedgerManifest } from "./lrLedgerRepository";
import { DemographyAuditRepository, readDemographyAuditManifest } from "./demographyAuditRepository";
import { mergeSheetWritebackQueue, readSheetWritebackQueue, type SheetWritebackEvent } from "../sheets/writeback";

export interface MetadataPort {
  getSceneMetadata(): Promise<Record<string, unknown>>;
  patchSceneMetadata(update: Record<string, unknown>): Promise<void>;
  getSceneItems(): Promise<SceneItemRecord[]>;
  getSceneItem?(id: string): Promise<SceneItemRecord | undefined>;
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

/**
 * Ignore only a renewal of epoch/expiry by the same coordinator when
 * validating READ-ONLY grid/item snapshots. A new lease owner, lease loss,
 * gameplay changes and manifest changes must still restart the read.
 *
 * Mutation paths keep strict heartbeat comparison and authority fencing.
 */
function sameSceneAndManifest(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
  ignoreSameOwnerHeartbeat = false
): boolean {
  const leftScene = left[METADATA_KEYS.scene];
  const rightScene = right[METADATA_KEYS.scene];
  const leaseOwner = (scene: unknown): string | undefined => {
    if (typeof scene !== "object" || scene === null || Array.isArray(scene)) return undefined;
    const lease = (scene as Record<string, unknown>).coordinatorLease;
    if (typeof lease !== "object" || lease === null || Array.isArray(lease)) return undefined;
    const owner = (lease as Record<string, unknown>).connectionId;
    return typeof owner === "string" && owner.length > 0 ? owner : undefined;
  };
  const owner = leaseOwner(leftScene);
  const canIgnoreHeartbeat = ignoreSameOwnerHeartbeat && owner !== undefined &&
    owner === leaseOwner(rightScene);
  const normalizeScene = (scene: unknown): unknown => {
    if (!canIgnoreHeartbeat || typeof scene !== "object" || scene === null || Array.isArray(scene)) {
      return scene;
    }
    const record = scene as Record<string, unknown>;
    const lease = record.coordinatorLease as Record<string, unknown>;
    const { epoch: _epoch, expiresAt: _expiry, ...stableLease } = lease;
    void _epoch;
    void _expiry;
    return { ...record, coordinatorLease: stableLease };
  };
  return JSON.stringify([
    normalizeScene(leftScene),
    left[METADATA_KEYS.gridManifest],
    left[METADATA_KEYS.lrLedgerManifest],
    left[METADATA_KEYS.demographyAuditManifest]
  ]) === JSON.stringify([
    normalizeScene(rightScene),
    right[METADATA_KEYS.gridManifest],
    right[METADATA_KEYS.lrLedgerManifest],
    right[METADATA_KEYS.demographyAuditManifest]
  ]);
}

/** Carry the most recent validated lease without mixing in newer game state. */
function withLatestCoordinatorLease(scene: SceneState, metadata: Record<string, unknown>): SceneState {
  const latest = requireValid(
    migrateSceneState(metadata[METADATA_KEYS.scene] ?? { version: 5 }),
    METADATA_KEYS.scene
  );
  const { coordinatorLease: _oldLease, ...rest } = scene;
  void _oldLease;
  return {
    ...rest,
    ...(latest.coordinatorLease ? { coordinatorLease: latest.coordinatorLease } : {})
  };
}

export class MetadataRepository {
  private readonly gridDecodeCache = new GridChunkDecodeCache();
  constructor(private readonly port: MetadataPort) {}

  clearReadCaches(): void {
    this.gridDecodeCache.clear();
  }

  /** Read scene revision without hydrating any grid, ledger, or audit item. */
  async readSceneRevision(): Promise<number> {
    const metadata = await this.port.getSceneMetadata();
    return requireValid(
      migrateSceneState(metadata[METADATA_KEYS.scene] ?? { version: 5 }),
      METADATA_KEYS.scene
    ).revision;
  }

  async readScene(): Promise<SceneState> {
    return (await this.readSnapshot(true)).state;
  }

  async readCoordinatorLease(): Promise<SceneState["coordinatorLease"]> {
    const metadata = await this.port.getSceneMetadata();
    return requireValid(
      migrateSceneState(metadata[METADATA_KEYS.scene] ?? { version: 5 }),
      METADATA_KEYS.scene
    ).coordinatorLease;
  }

  /**
   * Persist a coordinator heartbeat without loading grid, ledger or audit items.
   * Re-read metadata to reject a known-stale scene or a competing live lease.
   * Owlbear metadata has no atomic compare-and-swap: the final narrow race
   * remains subject to the same fencing limitations as writeScene().
   */
  async writeCoordinatorLease(
    heartbeat: NonNullable<SceneState["coordinatorLease"]>,
    now: number,
    canCommit: () => boolean
  ): Promise<void> {
    const read = async () => {
      const metadata = await this.port.getSceneMetadata();
      const raw = metadata[METADATA_KEYS.scene] ?? { version: 5 };
      const state = requireValid(migrateSceneState(raw), METADATA_KEYS.scene);
      return { raw, state };
    };
    const claimable = (lease: SceneState["coordinatorLease"]) =>
      lease === undefined ||
      lease.connectionId === heartbeat.connectionId ||
      lease.expiresAt <= now;
    const withoutLease = (raw: unknown) => {
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return raw;
      const { coordinatorLease: _ignored, ...gameState } = raw as Record<string, unknown>;
      void _ignored;
      return gameState;
    };

    if (!canCommit()) return;
    const first = await read();
    if (!canCommit()) return;
    if (!claimable(first.state.coordinatorLease)) {
      throw new Error("Coordinator lease is held by another live connection");
    }

    const latest = await read();
    if (!canCommit()) return;
    assertRevision(latest.state.revision, first.state.revision);
    if (JSON.stringify(withoutLease(first.raw)) !== JSON.stringify(withoutLease(latest.raw))) {
      throw new CommitPreconditionFailed();
    }
    if (!claimable(latest.state.coordinatorLease)) {
      throw new Error("Coordinator lease is held by another live connection");
    }

    // Preserve exactly the current stored state; never re-encode the grid
    // manifest or normalize unrelated gameplay fields for a mere heartbeat.
    const stored = typeof latest.raw === "object" && latest.raw !== null && !Array.isArray(latest.raw)
      ? latest.raw as Record<string, unknown>
      : latest.state;
    const update = {
      [METADATA_KEYS.scene]: { ...stored, coordinatorLease: heartbeat }
    };
    if (utf8Size(update) > 48 * 1024) throw new GridStorageError("GRID_METADATA_TOO_LARGE");
    if (!canCommit()) return;
    await this.port.patchSceneMetadata(update);
  }

  private async readSnapshot(ignoreSameOwnerHeartbeat = false): Promise<{ state: SceneState; metadata: Record<string, unknown> }> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const metadata = await this.port.getSceneMetadata();
      const baseState = requireValid(
        migrateSceneState(metadata[METADATA_KEYS.scene] ?? { version: 5 }),
        METADATA_KEYS.scene
      );
      const ledgerManifest = readLRLedgerManifest(metadata);
      const auditManifest = readDemographyAuditManifest(metadata);
      const needsItems = readGridManifest(metadata) !== undefined || (ledgerManifest?.partCount ?? 0) > 0 ||
        (auditManifest?.partCount ?? 0) > 0;
      if (!needsItems) return { state: baseState, metadata };
      const sceneItems = await this.port.getSceneItems();
      let grid: SceneState["gridMap"] | undefined;
      let failure: unknown;
      let lrTransactions: SceneState["lrTransactions"] | undefined;
      let demographyAudit: SceneState["demographyAudit"] | undefined;
      try {
        grid = await new GridChunkRepository(this.port, this.gridDecodeCache).read(metadata, sceneItems);
        lrTransactions = await new LRLedgerRepository(this.port).read(metadata, sceneItems);
        demographyAudit = await new DemographyAuditRepository(this.port).read(metadata, sceneItems);
      } catch (error) { failure = error; }
      const latest = await this.port.getSceneMetadata();
      if (!sameSceneAndManifest(metadata, latest, ignoreSameOwnerHeartbeat)) continue;
      if (failure) throw failure;
      if (readGridManifest(metadata) && (!grid || grid.revision !== baseState.gridMap.revision)) {
        throw new GridStorageError("GRID_CHUNK_INVALID");
      }
      const hydrated = {
        ...baseState,
        ...(grid ? { gridMap: grid } : {}),
        ...(lrTransactions !== undefined ? { lrTransactions } : {}),
        ...(demographyAudit !== undefined ? { demographyAudit } : {})
      };
      return {
        state: ignoreSameOwnerHeartbeat ? withLatestCoordinatorLease(hydrated, latest) : hydrated,
        metadata: ignoreSameOwnerHeartbeat ? latest : metadata
      };
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
      if (!sameSceneAndManifest(sceneMetadata, latest, true)) continue;

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
      const lrTransactions = await new LRLedgerRepository(this.port).read(sceneMetadata, items);
      const demographyAudit = await new DemographyAuditRepository(this.port).read(sceneMetadata, items);
      return {
        items,
        armies,
        ships,
        barriers,
        sceneMetadata: latest,
        baseScene: withLatestCoordinatorLease({
          ...baseScene,
          ...(lrTransactions !== undefined ? { lrTransactions } : {}),
          ...(demographyAudit !== undefined ? { demographyAudit } : {})
        }, latest)
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
        grid = await new GridChunkRepository(this.port, this.gridDecodeCache).read(
          items.sceneMetadata as Record<string, unknown>, items.items
        );
      } catch (error) { failure = error; }
      const latest = await this.port.getSceneMetadata();
      if (!sameSceneAndManifest(items.sceneMetadata as Record<string, unknown>, latest, true)) {
        items = undefined;
        continue;
      }
      if (failure) throw failure;
      if (readGridManifest(items.sceneMetadata as Record<string, unknown>) &&
        (!grid || grid.revision !== items.baseScene.gridMap.revision)) {
        throw new GridStorageError("GRID_CHUNK_INVALID");
      }
      // readItemFrame() has already decoded the LR and demography data from
      // this very item snapshot. The metadata stability check above covers
      // their manifests; decoding them again only duplicates CPU work.
      return {
        items,
        scene: withLatestCoordinatorLease(
          grid ? { ...items.baseScene, gridMap: grid } : items.baseScene,
          latest
        )
      };
    }
    throw new GridStorageError("GRID_CHUNK_MISSING");
  }

  async writeScene(
    state: SceneState,
    expectedRevision: number,
    canCommit: (current: SceneState) => boolean = () => true,
    sheetWritebackEvent?: SheetWritebackEvent
  ): Promise<void> {
    const { state: current, metadata } = await this.readSnapshot();
    assertRevision(current.revision, expectedRevision);
    if (!canCommit(current)) throw new CommitPreconditionFailed();
    const gridWasRequestedUnchanged = JSON.stringify(current.gridMap) === JSON.stringify(state.gridMap);
    const next = {
      ...state,
      terrain: { ...state.terrain, defaultTerrainId: "sea" },
      gridMap: gridWasRequestedUnchanged ? current.gridMap : compactDefaultTerrain(state.gridMap, "sea")
    };
    if (!this.port.addSceneItems || !this.port.deleteSceneItems) {
      // Legacy embedding ports may still write small scenes, but never destroy an existing manifest.
      if (readGridManifest(metadata)) throw new GridStorageError("GRID_CHUNK_WRITE_FAILED");
      const existingQueue = readSheetWritebackQueue(metadata, METADATA_KEYS.sheetWritebackQueue);
      const writebackQueue = sheetWritebackEvent
        ? mergeSheetWritebackQueue(existingQueue, sheetWritebackEvent)
        : existingQueue;
      const update = {
        [METADATA_KEYS.scene]: next,
        ...(writebackQueue ? { [METADATA_KEYS.sheetWritebackQueue]: writebackQueue } : {})
      };
      if (utf8Size(update) > 48 * 1024) throw new GridStorageError("GRID_METADATA_TOO_LARGE");
      await this.port.patchSceneMetadata(update);
      return;
    }
    const previousGridManifest = readGridManifest(metadata);
    const previousLedgerManifest = readLRLedgerManifest(metadata);
    const previousAuditManifest = readDemographyAuditManifest(metadata);
    // Demography, faction influence and sheet writeback updates do not change
    // the grid. Reusing its existing manifest avoids rewriting legacy/corrupt
    // grid chunks during an otherwise unrelated metadata update.

    const sceneItems = previousGridManifest?.version === 2 || (previousLedgerManifest?.partCount ?? 0) > 0 ||
      (previousAuditManifest?.partCount ?? 0) > 0
      ? await this.port.getSceneItems()
      : undefined;
    const chunks = new GridChunkRepository(this.port);
    const ledger = new LRLedgerRepository(this.port);
    const audit = new DemographyAuditRepository(this.port);
    const addSceneItems = this.port.addSceneItems.bind(this.port);
    const staged: StagedGrid = gridWasRequestedUnchanged && previousGridManifest?.version === 2
      ? { manifest: previousGridManifest, additions: [], superseded: [], supersededManifestParts: [] }
      : await chunks.stage(current.gridMap, next.gridMap, previousGridManifest, sceneItems);
    const stagedLedger = await ledger.stage(
      current.lrTransactions ?? [],
      next.lrTransactions ?? [],
      previousLedgerManifest,
      sceneItems,
      next.revision
    );
    const stagedAudit = await audit.stage(
      current.demographyAudit ?? [],
      next.demographyAudit ?? [],
      previousAuditManifest,
      sceneItems,
      next.revision
    );
    const persistedScene = {
      ...next,
      lrTransactions: [],
      demographyAudit: [],
      gridMap: { ...next.gridMap, cells: {} }
    };
    const existingWritebackQueue = readSheetWritebackQueue(metadata, METADATA_KEYS.sheetWritebackQueue);
    const writebackQueue = sheetWritebackEvent
      ? mergeSheetWritebackQueue(existingWritebackQueue, sheetWritebackEvent)
      : existingWritebackQueue;
    const update = {
      [METADATA_KEYS.scene]: persistedScene,
      [METADATA_KEYS.gridManifest]: staged.manifest,
      [METADATA_KEYS.lrLedgerManifest]: stagedLedger.manifest,
      [METADATA_KEYS.demographyAuditManifest]: stagedAudit.manifest,
      ...(writebackQueue ? { [METADATA_KEYS.sheetWritebackQueue]: writebackQueue } : {})
    };
    if (utf8Size(update) > 48 * 1024) throw new GridStorageError("GRID_METADATA_TOO_LARGE");
    try {
      try {
        await sendBatches([...staged.additions, ...stagedLedger.additions, ...stagedAudit.additions], addSceneItems);
      } catch (cause) { throw new GridStorageError("GRID_CHUNK_WRITE_FAILED", { cause }); }
      const latest = await this.readScene();
      assertRevision(latest.revision, expectedRevision);
      if (!canCommit(latest)) throw new CommitPreconditionFailed();
      try { await this.port.patchSceneMetadata(update); }
      catch (cause) { throw new GridStorageError("GRID_MANIFEST_WRITE_FAILED", { cause }); }
    } catch (error) {
      const stagedIds = [...staged.additions, ...stagedLedger.additions, ...stagedAudit.additions].map((item) => item.id);
      await chunks.cleanup(stagedIds);
      await ledger.cleanup(stagedIds);
      await audit.cleanup(stagedIds);
      throw error;
    }
    await chunks.cleanup([...staged.superseded, ...staged.supersededManifestParts]);
    await ledger.cleanup(stagedLedger.superseded);
    await audit.cleanup(stagedAudit.superseded);
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
    const item = this.port.getSceneItem
      ? await this.port.getSceneItem(itemId)
      : (await this.port.getSceneItems()).find((candidate) => candidate.id === itemId);
    if (!item) throw new InvalidMetadataError(`item:${itemId}`);
    return item;
  }
}

