import { expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE, METADATA_KEYS } from "../shared/constants";
import type { ArmyState, SceneItemRecord, SceneState } from "../shared/types";
import type { OwlbearPort } from "../owlbear/sdkAdapter";
import { ProductionEngine, SceneWorkTracker } from "./application";

function validArmy(status: ArmyState["status"] = "READY"): ArmyState {
  return {
    version: 3,
    registered: true,
    sideId: "red",
    status,
    overrides: {},
    route: [],
    plannedRoute: {
      startCell: { x: 0, y: 0 },
      executeOnTurn: 0,
      cells: [],
      totalCostUnits: 0,
      validatedRevision: 2,
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
    revision: 1
  };
}

function failingGridPort(items: SceneItemRecord[] = []): OwlbearPort {
  const scene: SceneState = {
    version: 5,
    revision: 2,
    settings: { ...DEFAULT_SETTINGS },
    sides: [],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: structuredClone(DEFAULT_TURN_STATE),
    coordinatorLease: { connectionId: "coordinator", epoch: 1, expiresAt: Date.now() + 10_000 }
  };

  return {
    getSceneMetadata: async () => ({ [METADATA_KEYS.scene]: structuredClone(scene) }),
    patchSceneMetadata: async () => undefined,
    getSceneItems: async () => structuredClone(items),
    updateSceneItem: async () => undefined,
    patchSceneItemMetadata: async () => undefined,
    getLocalItems: async () => [],
    addLocalItem: async () => undefined,
    updateLocalItem: async () => undefined,
    deleteLocalItems: async () => undefined,
    createClone: () => { throw new Error("not used"); },
    send: async () => undefined,
    on: () => () => undefined,
    getGridDistance: async () => 0,
    getGridDpi: async () => { throw new Error("grid unavailable"); },
    snapGridCenter: async (position) => ({ ...position }),
    onGridChange: () => () => undefined,
    show: async () => undefined,
    getRole: async () => "GM" as const,
    getItem: async () => undefined,
    getSceneState: async () => scene,
    updateItem: async () => undefined,
    deleteLocalItemsForSource: async () => undefined
  } as unknown as OwlbearPort;
}

it("reports rejected tracked scene work while still allowing drain to finish", async () => {
  const report = vi.fn();
  const tracker = new SceneWorkTracker(report);
  const failure = new Error("overlay failed");

  tracker.track(Promise.reject(failure));
  await tracker.drain();

  expect(report).toHaveBeenCalledWith(failure, "scene-work");
});

it("reports a grid failure that prevents a scheduled turn tick", async () => {
  const report = vi.fn();
  const engine = new ProductionEngine(
    failingGridPort(),
    () => new Date("2026-09-02T12:00:01.000Z"),
    report
  );
  engine.setCoordinator(true, "coordinator");

  await engine.turnTick();

  expect(report).toHaveBeenCalledWith(expect.any(Error), "turn-grid-unavailable");
});

it("reports a grid failure that prevents movement processing", async () => {
  const report = vi.fn();
  const movingArmy = validArmy("MOVING");
  const engine = new ProductionEngine(
    failingGridPort([{
      id: "army",
      type: "IMAGE",
      position: { x: 0, y: 0 },
      metadata: { [METADATA_KEYS.army]: movingArmy }
    }]),
    () => new Date(),
    report
  );
  engine.setCoordinator(true, "coordinator");

  await engine.movementTick();

  expect(report).toHaveBeenCalledWith(expect.any(Error), "movement-grid-unavailable");
});
