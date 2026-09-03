import { expect, it } from "vitest";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { SHIP_CLASSES } from "../naval/ships/shipClasses";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import type { SceneState } from "../shared/types";
import { completeTurn } from "./turnService";

it("restores each ship's class movement budget at the global turn boundary without changing its strategic order", () => {
  const ship = {
    ...createRegisteredShip("red", "CRUISER", "EAST"),
    globalMovementRemaining: 0,
    movementSpentThisTurn: true,
    plannedRoute: [{ x: 1, y: 0 }, { x: 2, y: 0 }]
  };
  const scene: SceneState = {
    version: 6,
    revision: 4,
    settings: { ...DEFAULT_SETTINGS },
    sides: [{ id: "red", name: "Красные", color: "#f00", playerIds: [], leaderPlayerIds: [], stateId: null }],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: structuredClone(DEFAULT_TURN_STATE),
    ships: { ship },
    navalBattleRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };

  const result = completeTurn(scene, {}, {
    source: "MANUAL",
    completedAt: new Date("2026-09-03T12:00:00.000Z"),
    armyCells: {}
  });

  expect(result.changed).toBe(true);
  if (!result.changed) return;
  expect(result.scene.ships?.ship).toMatchObject({
    globalMovementRemaining: SHIP_CLASSES.CRUISER.movement,
    movementSpentThisTurn: false,
    facing: "EAST",
    plannedRoute: [{ x: 1, y: 0 }, { x: 2, y: 0 }],
    revision: ship.revision + 1
  });
});
