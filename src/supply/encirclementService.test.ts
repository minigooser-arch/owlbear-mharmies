import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import type { ArmyState, SceneState } from "../shared/types";
import { roomArmy } from "../tests/helpers/factories";
import { applyEncirclementCheckpoint } from "./encirclementService";

function scene(): SceneState {
  return {
    version: 7,
    revision: 1,
    settings: structuredClone(DEFAULT_SETTINGS),
    sides: [],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, cells: {}, revision: 0 },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 1 },
    stateRelations: {},
    forcedExitStates: [],
    strategicCities: [],
    territorialScores: [],
    rebellions: [],
    turnCheckpoint: {
      turnNumber: 2,
      forcedExitDone: true,
      supplyDone: true,
      encirclementDone: false,
      territorialScoreDone: false
    }
  };
}

function army(id: string, supplied: boolean, hp = 50, maxHp = 50): ArmyState {
  const result = roomArmy(id, "red", id, 0).state;
  result.health = { hp, maxHp };
  result.supply = { supplied, checkedOnTurn: 2 };
  return result;
}

describe("applyEncirclementCheckpoint", () => {
  it("damages each unsupplied army by ceil ten percent of max HP and leaves supplied armies alone", () => {
    const current = scene();
    const result = applyEncirclementCheckpoint({
      scene: current,
      armies: {
        cut: army("cut", false, 51, 51),
        supplied: army("supplied", true, 51, 51)
      }
    }, 2);

    expect(result.armies.cut?.health.hp).toBe(45);
    expect(result.armies.supplied?.health.hp).toBe(51);
    expect(result.scene.turnCheckpoint?.encirclementDone).toBe(true);
  });

  it("is idempotent for the same turn checkpoint", () => {
    const first = applyEncirclementCheckpoint({
      scene: scene(),
      armies: { a: army("a", false, 50, 50) }
    }, 2);
    const second = applyEncirclementCheckpoint(first, 2);

    expect(first.armies.a?.health.hp).toBe(45);
    expect(second.armies.a?.health.hp).toBe(45);
  });

  it("uses the normal army destruction lifecycle when encirclement damage reaches zero HP", () => {
    const current = scene();
    current.battleGroups = [{
      battleId: "battle",
      name: "Battle",
      participantIds: ["doomed", "survivor"],
      revision: 1
    }];
    const doomed = army("doomed", false, 5, 50);
    doomed.status = "IN_BATTLE";
    doomed.battleGroupId = "battle";
    const survivor = army("survivor", true, 50, 50);
    survivor.status = "IN_BATTLE";
    survivor.battleGroupId = "battle";

    const result = applyEncirclementCheckpoint({
      scene: current,
      armies: { doomed, survivor }
    }, 2);

    expect(result.armies.doomed).toBeUndefined();
    expect(result.scene.battleGroups).toEqual([]);
    expect(result.armies.survivor?.status).toBe("PAUSED");
    expect(result.armies.survivor?.battleGroupId).toBeUndefined();
  });

  it("does not block movement or rewrite routes for surviving encircled armies", () => {
    const moving = army("moving", false, 50, 50);
    moving.status = "MOVING";
    moving.route = [{ x: 50, y: 50 }, { x: 150, y: 50 }];
    moving.plannedRoute.cells = [{ x: 1, y: 0 }];
    moving.movement = { maxUnits: 10, remainingUnits: 6, enteredRouteCellCount: 0 };

    const result = applyEncirclementCheckpoint({
      scene: scene(),
      armies: { moving }
    }, 2);
    const next = result.armies.moving;

    expect(next?.status).toBe("MOVING");
    expect(next?.route).toEqual(moving.route);
    expect(next?.plannedRoute).toEqual(moving.plannedRoute);
    expect(next?.movement).toEqual(moving.movement);
  });

  it("does not run before the supply checkpoint for that turn is complete", () => {
    const current = scene();
    if (current.turnCheckpoint) current.turnCheckpoint.supplyDone = false;

    const result = applyEncirclementCheckpoint({
      scene: current,
      armies: { a: army("a", false, 50, 50) }
    }, 2);

    expect(result.armies.a?.health.hp).toBe(50);
    expect(result.scene.turnCheckpoint?.encirclementDone).toBe(false);
  });
});
