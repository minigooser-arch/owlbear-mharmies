import { expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../shared/constants";
import { migrateArmyState, migrateSceneState } from "./migrations";

function v5SceneFixture(movementCostUnits = 2) {
  return {
    version: 5, revision: 7, settings: DEFAULT_SETTINGS,
    sides: [{ id: "red", name: "Красные", color: "#f00", playerIds: [], leaderPlayerIds: [], stateId: null }],
    states: [], relations: {}, battleGroups: [],
    terrain: { defaultTerrainId: "plain", types: { plain: { id: "plain", name: "Равнина", movementCostUnits, enabled: true } } },
    gridMap: { version: 1, cells: {}, revision: 0 }, wars: [],
    turn: { turnNumber: 4, autoTurnsPaused: false, deferredUntil: null, lastCompletedAt: null, lastCompletedBy: null, lastProcessedBoundaryId: null }
  };
}

function v3ArmyFixture() {
  return {
    version: 3, registered: true, sideId: "red", status: "READY", overrides: {}, route: [],
    plannedRoute: { startCell: { x: 0, y: 0 }, executeOnTurn: 0, cells: [], totalCostUnits: 0, validatedRevision: 0, requiresReplan: false },
    movement: { maxUnits: 10, remainingUnits: 10, enteredRouteCellCount: 0 }, health: { hp: 50, maxHp: 50 },
    supply: { supplied: true, checkedOnTurn: 0 }, disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
    currentWaypointIndex: 0, segmentProgressCells: 0, ignoresMovementBarriers: false, ignoresVisionBarriers: false, revision: 2
  };
}

it("migrates v5 scenes into naval-safe v6 defaults", () => {
  const migrated = migrateSceneState(v5SceneFixture());
  expect(migrated.ok).toBe(true); if (!migrated.ok) return;
  expect(migrated.value.version).toBe(6);
  expect(migrated.value.turn.phase).toBe("MOVEMENT");
  expect(migrated.value.ships).toEqual({});
  expect(migrated.value.navalBattleRequests).toEqual([]);
  expect(migrated.value.activeNavalBattle).toBeNull();
  expect(migrated.value.navalBattleHistory).toEqual([]);
  expect(migrated.value.navalRevealUntilTurn).toEqual({});
});

it("migrates legacy terrain to land domain without changing movement cost", () => {
  const migrated = migrateSceneState(v5SceneFixture(3));
  expect(migrated.ok).toBe(true); if (!migrated.ok) return;
  const terrain = migrated.value.terrain.types.plain;
  expect(terrain).toBeDefined();
  if (!terrain) return;
  expect(terrain.movementDomains).toEqual(["LAND"]);
  expect(terrain.blocksNavalLos).toBe(true);
  expect(terrain.movementCostUnits).toBe(3);
});

it("migrates v3 armies with no embarked transport", () => {
  const migrated = migrateArmyState(v3ArmyFixture());
  expect(migrated.ok).toBe(true); if (!migrated.ok) return;
  expect(migrated.value.version).toBe(4);
  expect(migrated.value.embarkedOnShipId).toBeNull();
});
