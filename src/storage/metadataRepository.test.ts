import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE, METADATA_KEYS } from "../shared/constants";
import type { ArmyState, ItemUpdate, SceneItemRecord, SceneState } from "../shared/types";
import {
  CommitPreconditionFailed,
  FutureSchemaError,
  MetadataRepository,
  RevisionConflict,
  type MetadataPort
} from "./metadataRepository";
import { GridStoragePort } from "../tests/helpers/gridStoragePort";
import { DEFAULT_CELL_STATE } from "../terrain/gridMap";

class MemoryPort implements MetadataPort {
  sceneMetadata: Record<string, unknown> = {};
  items: SceneItemRecord[] = [];

  async getSceneMetadata(): Promise<Record<string, unknown>> {
    return structuredClone(this.sceneMetadata);
  }

  async patchSceneMetadata(update: Record<string, unknown>): Promise<void> {
    this.sceneMetadata = { ...this.sceneMetadata, ...structuredClone(update) };
  }

  async getSceneItems(): Promise<SceneItemRecord[]> {
    return structuredClone(this.items);
  }

  async updateSceneItem(id: string, update: ItemUpdate): Promise<void> {
    const item = this.items.find((candidate) => candidate.id === id);
    if (!item) throw new Error(`Missing item ${id}`);
    Object.assign(item, structuredClone(update));
  }
}

function army(revision: number): ArmyState {
  return {
    version: 4,
    registered: true,
    sideId: "red",
    status: "READY",
    overrides: {},
    route: [],
    plannedRoute: {
      startCell: { x: 0, y: 0 },
      executeOnTurn: 1,
      cells: [],
      totalCostUnits: 0,
      validatedRevision: revision,
      requiresReplan: false
    },
    movement: { maxUnits: 10, remainingUnits: 10, enteredRouteCellCount: 0 },
    health: { hp: 50, maxHp: 50 },
    supply: { supplied: true, checkedOnTurn: 1 },
    disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
    embarkedOnShipId: null,
    currentWaypointIndex: 0,
    segmentProgressCells: 0,
    ignoresMovementBarriers: false,
    ignoresVisionBarriers: false,
    revision
  };
}

function scene(revision: number): SceneState {
  return {
    version: 6,
    revision,
    settings: { ...DEFAULT_SETTINGS },
    sides: [],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: structuredClone(DEFAULT_TURN_STATE),
    ships: {},
    navalBattleRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
}

describe("MetadataRepository", () => {
  it("reads one stable item frame and hydrates a grid from the same scene item list", async () => {
    const port = new GridStoragePort();
    const repository = new MetadataRepository(port);
    const initial = await repository.readScene();
    initial.gridMap.cells = { "0,0": { ...DEFAULT_CELL_STATE, terrainId: "plain" } };
    initial.gridMap.revision = 1;
    initial.revision = 1;
    port.metadata[METADATA_KEYS.scene] = structuredClone(initial);
    await repository.writeScene({ ...initial, revision: 2 }, 1);
    port.items.push(
      { id: "army", type: "IMAGE", position: { x: 0, y: 0 }, metadata: { [METADATA_KEYS.army]: army(1) } },
      { id: "ship", type: "IMAGE", position: { x: 0, y: 0 }, metadata: { [METADATA_KEYS.ship]: {
        version: 1, registered: true, sideId: "red", classId: "CRUISER", status: "READY", hp: 25,
        temporaryHp: 0, facing: "NORTH", plannedRoute: [], plannedFacing: null,
        globalMovementRemaining: 3, movementSpentThisTurn: false, battleId: null,
        detectionOverride: null, embarkedArmyId: null, shoreBombardmentUsedOnTurn: null,
        logisticsActionUsedOnTurn: null, revision: 1
      } } },
      { id: "barrier", type: "CURVE", position: { x: 0, y: 0 }, metadata: { [METADATA_KEYS.barrier]: {
        version: 1, revision: 1, blocksMovement: true, blocksVision: true,
        visibility: "GM_ONLY", color: "#f00"
      } } }
    );

    let itemReads = 0;
    const readItems = port.getSceneItems.bind(port);
    port.getSceneItems = async () => { itemReads += 1; return readItems(); };
    const itemFrame = await repository.readItemFrame();
    expect(itemReads).toBe(1);
    expect(itemFrame.items).toHaveLength(4);
    expect(itemFrame.armies.map((record) => record.item.id)).toEqual(["army"]);
    expect(itemFrame.ships.map((record) => record.item.id)).toEqual(["ship"]);
    expect(itemFrame.barriers.map((record) => record.item.id)).toEqual(["barrier"]);
    expect(itemFrame.sceneMetadata[METADATA_KEYS.gridManifest]).toEqual(port.metadata[METADATA_KEYS.gridManifest]);

    itemReads = 0;
    const frame = await repository.readFrame(itemFrame);
    expect(itemReads).toBe(0);
    expect(frame.scene.gridMap.cells).toEqual(initial.gridMap.cells);
    expect(frame.items.items).toEqual(itemFrame.items);

    itemReads = 0;
    await repository.readFrame();
    expect(itemReads).toBe(1);
  });

  it("retries an item frame when the grid manifest changes during its item read", async () => {
    const port = new GridStoragePort();
    const repository = new MetadataRepository(port);
    const initial = await repository.readScene();
    initial.gridMap.cells = { "0,0": { ...DEFAULT_CELL_STATE, terrainId: "plain" } };
    initial.gridMap.revision = 1;
    initial.revision = 1;
    port.metadata[METADATA_KEYS.scene] = structuredClone(initial);
    await repository.writeScene({ ...initial, revision: 2 }, 1);
    const oldItems = structuredClone(port.items);
    const next = await repository.readScene();
    next.gridMap.cells["0,0"] = { ...DEFAULT_CELL_STATE, terrainId: "forest" };
    next.gridMap.revision += 1;
    next.revision += 1;
    await repository.writeScene(next, 2);
    const latestMetadata = structuredClone(port.metadata);
    const latestItems = structuredClone(port.items);
    port.metadata = { ...latestMetadata, [METADATA_KEYS.scene]: { ...initial, revision: 2, gridMap: { ...initial.gridMap, cells: {} } } };
    port.items = oldItems;
    let reads = 0;
    const readItems = port.getSceneItems.bind(port);
    port.getSceneItems = async () => { reads += 1; return readItems(); };
    port.afterItemsRead = () => { port.metadata = latestMetadata; port.items = latestItems; };

    const frame = await repository.readFrame();
    expect(reads).toBe(2);
    expect(frame.scene.gridMap.cells["0,0"]?.terrainId).toBe("forest");
  });

  it("creates schema v7 defaults for a new scene", async () => {
    const repository = new MetadataRepository(new MemoryPort());

    await expect(repository.readScene()).resolves.toMatchObject({
      version: 7,
      sides: [],
      states: [],
      gridMap: { version: 1, revision: 0, cells: {} },
      wars: [],
      turn: { phase: "MOVEMENT" },
      ships: {},
      navalBattleRequests: [],
      activeNavalBattle: null,
      navalBattleHistory: [],
      navalRevealUntilTurn: {},
      stateRelations: {},
            forcedExitStates: [],
      strategicCities: [],
      territorialScores: [],
      rebellions: [],
      turnCheckpoint: null
    });
  });

  it("rejects a stale scene write", async () => {
    const port = new MemoryPort();
    port.sceneMetadata[METADATA_KEYS.scene] = scene(3);
    const repository = new MetadataRepository(port);

    await expect(repository.writeScene(scene(3), 2)).rejects.toBeInstanceOf(RevisionConflict);
  });

  it("checks a scene commit precondition after reading the current revision", async () => {
    const port = new MemoryPort();
    port.sceneMetadata[METADATA_KEYS.scene] = scene(3);
    const repository = new MetadataRepository(port);

    await expect(repository.writeScene(scene(4), 3, () => false)).rejects.toBeInstanceOf(
      CommitPreconditionFailed
    );
    expect(port.sceneMetadata[METADATA_KEYS.scene]).toEqual(scene(3));
  });

  it("never overwrites an unknown future army schema", async () => {
    const port = new MemoryPort();
    port.items.push({
      id: "army-a",
      type: "IMAGE",
      position: { x: 0, y: 0 },
      metadata: { [METADATA_KEYS.army]: { version: 99, revision: 7 } }
    });
    const repository = new MetadataRepository(port);

    await expect(repository.writeArmy("army-a", army(8), 7)).rejects.toBeInstanceOf(
      FutureSchemaError
    );
    expect(port.items[0]?.metadata[METADATA_KEYS.army]).toEqual({ version: 99, revision: 7 });
  });

  it("clears only extension army metadata and restores source visibility", async () => {
    const port = new MemoryPort();
    port.items.push({
      id: "army-a",
      type: "IMAGE",
      position: { x: 0, y: 0 },
      visible: false,
      metadata: { [METADATA_KEYS.army]: army(1), "another/extension": { keep: true } }
    });
    const repository = new MetadataRepository(port);

    await repository.clearArmy("army-a");

    expect(port.items[0]?.visible).toBe(true);
    expect(port.items[0]?.metadata).toEqual({ "another/extension": { keep: true } });
  });
});
