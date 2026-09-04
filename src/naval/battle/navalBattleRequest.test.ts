import { expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../../shared/constants";
import type { NavalSceneState } from "../../shared/types";
import { createRegisteredShip } from "../ships/shipLifecycle";
import { createNavalBattleRequest, validateNavalBattleRequest } from "./navalBattleRequest";

function sceneFixture(): NavalSceneState {
  return {
    version: 6,
    revision: 1,
    settings: { ...DEFAULT_SETTINGS },
    sides: [],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 7, phase: "MOVEMENT" },
    ships: {
      red: createRegisteredShip("red-side", "CRUISER", "EAST"),
      blue: createRegisteredShip("blue-side", "BATTLESHIP", "WEST")
    },
    navalBattleRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
}

it("creates a pending request for a currently detected living target without starting battle", () => {
  const scene = sceneFixture();
  const result = createNavalBattleRequest({
    scene,
    requestId: "req-1",
    initiatingShipId: "red",
    targetShipId: "blue",
    detectedTargetShipIds: new Set(["blue"])
  });

  expect(result).toEqual({
    ok: true,
    request: {
      id: "req-1",
      initiatingShipId: "red",
      targetShipId: "blue",
      createdOnTurn: 7
    }
  });
  expect(scene.activeNavalBattle).toBeNull();
  expect(scene.turn.phase).toBe("MOVEMENT");
});

it("rejects a target that is no longer detected", () => {
  const result = createNavalBattleRequest({
    scene: sceneFixture(),
    requestId: "req-1",
    initiatingShipId: "red",
    targetShipId: "blue",
    detectedTargetShipIds: new Set()
  });

  expect(result).toEqual({ ok: false, reason: "TARGET_NOT_DETECTED" });
});

it("rejects a destroyed initiating ship", () => {
  const scene = sceneFixture();
  scene.ships.red!.hp = 0;

  const result = createNavalBattleRequest({
    scene,
    requestId: "req-1",
    initiatingShipId: "red",
    targetShipId: "blue",
    detectedTargetShipIds: new Set(["blue"])
  });

  expect(result).toEqual({ ok: false, reason: "INITIATING_SHIP_DESTROYED" });
});

it("revalidates target existence, hp and detection before a pending request is used", () => {
  const scene = sceneFixture();
  const request = {
    id: "req-1",
    initiatingShipId: "red",
    targetShipId: "blue",
    createdOnTurn: 7
  };

  scene.ships.blue!.hp = 0;
  expect(validateNavalBattleRequest({
    scene,
    request,
    detectedTargetShipIds: new Set(["blue"])
  })).toEqual({ ok: false, reason: "TARGET_SHIP_DESTROYED" });

  scene.ships.blue!.hp = 1;
  expect(validateNavalBattleRequest({
    scene,
    request,
    detectedTargetShipIds: new Set()
  })).toEqual({ ok: false, reason: "TARGET_NOT_DETECTED" });
});
