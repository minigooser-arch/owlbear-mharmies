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
    version: 3,
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
    currentWaypointIndex: 0,
    segmentProgressCells: 0,
    ignoresMovementBarriers: false,
    ignoresVisionBarriers: false,
    revision
  };
}

function scene(revision: number): SceneState {
  return {
    version: 5,
    revision,
    settings: { ...DEFAULT_SETTINGS },
    sides: [],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: structuredClone(DEFAULT_TURN_STATE)
  };
}

describe("MetadataRepository", () => {
  it("creates schema v5 defaults for a new scene", async () => {
    const repository = new MetadataRepository(new MemoryPort());

    await expect(repository.readScene()).resolves.toMatchObject({
      version: 5,
      sides: [],
      states: [],
      gridMap: { version: 1, revision: 0, cells: {} },
      wars: []
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
