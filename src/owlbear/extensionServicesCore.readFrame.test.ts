import { expect, it, vi } from "vitest";
import { METADATA_KEYS } from "../shared/constants";
import { GridStoragePort } from "../tests/helpers/gridStoragePort";
import { DEFAULT_CELL_STATE } from "../terrain/gridMap";
import { MetadataRepository } from "../storage/metadataRepository";
import { buildRoleSafeSnapshotFromItemFrame, readCoreSnapshotItemFrame } from "./extensionServicesCore";

it("loads army and ship UI snapshot records from one indexed item frame", async () => {
  const port = new GridStoragePort();
  const repository = new MetadataRepository(port);
  const scene = await repository.readScene();
  scene.revision = 1;
  scene.gridMap.cells = { "0,0": { ...DEFAULT_CELL_STATE, terrainId: "plain" } };
  scene.gridMap.revision = 1;
  port.metadata[METADATA_KEYS.scene] = structuredClone(scene);
  await repository.writeScene({ ...scene, revision: 2 }, 1);
  port.items.push(
    { id: "army", type: "IMAGE", position: { x: 0, y: 0 }, metadata: { [METADATA_KEYS.army]: {
      version: 4, registered: true, sideId: "red", status: "READY", overrides: {}, route: [],
      plannedRoute: { startCell: { x: 0, y: 0 }, executeOnTurn: 1, cells: [], totalCostUnits: 0,
        validatedRevision: 1, requiresReplan: false },
      movement: { maxUnits: 10, remainingUnits: 10, enteredRouteCellCount: 0 }, health: { hp: 40, maxHp: 40 },
      supply: { supplied: true, checkedOnTurn: 1 }, disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
      embarkedOnShipId: null, currentWaypointIndex: 0, segmentProgressCells: 0,
      ignoresMovementBarriers: false, ignoresVisionBarriers: false, revision: 1
    } } },
    { id: "ship", type: "IMAGE", position: { x: 0, y: 0 }, metadata: { [METADATA_KEYS.ship]: {
      version: 1, registered: true, sideId: "red", classId: "CRUISER", status: "READY", hp: 25,
      temporaryHp: 0, facing: "NORTH", plannedRoute: [], plannedFacing: null,
      globalMovementRemaining: 3, movementSpentThisTurn: false, battleId: null,
      detectionOverride: null, embarkedArmyId: null, shoreBombardmentUsedOnTurn: null,
      logisticsActionUsedOnTurn: null, revision: 1
    } } }
  );
  const getSceneItems = vi.spyOn(port, "getSceneItems");
  const frame = await readCoreSnapshotItemFrame(repository);
  expect(getSceneItems).toHaveBeenCalledTimes(1);
  expect(frame.armies.map((record) => record.item.id)).toEqual(["army"]);
  expect(frame.ships.map((record) => record.item.id)).toEqual(["ship"]);
});

it("builds authorization from the scene captured with the item frame", async () => {
  const port = new GridStoragePort();
  const repository = new MetadataRepository(port);
  const staleScene = await repository.readScene();
  staleScene.sides = [];
  port.metadata[METADATA_KEYS.scene] = structuredClone(staleScene);
  const currentScene = { ...structuredClone(staleScene), revision: staleScene.revision + 1 };
  currentScene.sides = [{
    id: "red", name: "Red", color: "#f00", stateId: null, playerIds: ["player"], leaderPlayerIds: []
  }];
  port.metadata[METADATA_KEYS.scene] = structuredClone(currentScene);
  port.items.push({
    id: "army", type: "IMAGE", position: { x: 0, y: 0 }, metadata: { [METADATA_KEYS.army]: {
      version: 4, registered: true, sideId: "red", status: "READY", overrides: {}, route: [],
      plannedRoute: null, movement: { maxUnits: 10, remainingUnits: 10, enteredRouteCellCount: 0 },
      health: { hp: 40, maxHp: 40 }, supply: { supplied: true, checkedOnTurn: 1 },
      disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
      embarkedOnShipId: null, currentWaypointIndex: 0, segmentProgressCells: 0,
      ignoresMovementBarriers: false, ignoresVisionBarriers: false, revision: 1
    } }
  });

  const frame = await readCoreSnapshotItemFrame(repository);
  const snapshot = buildRoleSafeSnapshotFromItemFrame({
    role: "PLAYER", playerId: "player", players: [], mapVisibleSourceIds: new Set()
  }, frame);

  expect(snapshot.memberSideIds).toEqual(new Set(["red"]));
  expect(snapshot.armies.map((army) => army.id)).toEqual(["army"]);
});
