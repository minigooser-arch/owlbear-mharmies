import { expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import type { ArmyState, SceneState } from "../shared/types";
import { completeTurn, deferTurn, pauseAutoTurns, resumeAutoTurns } from "./turnService";

function scene(): SceneState {
  return {
    version:5, revision:4, settings:{...DEFAULT_SETTINGS},
    sides:[{id:"red",name:"Red",color:"#f00",playerIds:[],leaderPlayerIds:[],stateId:"red-state"}],
    states:[{id:"red-state",name:"Red State",rulingFactionId:"red",active:true}],
    relations:{}, battleGroups:[], terrain:structuredClone(DEFAULT_TERRAIN),
    gridMap:{version:1,revision:0,cells:{
      "0,0":{terrainId:null,impassable:false,factionTerritoryIds:["red"],recognizedStateId:"red-state",deFactoStateId:"red-state"},
      "1,0":{terrainId:null,impassable:false,factionTerritoryIds:["red"],recognizedStateId:"red-state",deFactoStateId:"red-state"}
    }},
    wars:[], turn:structuredClone(DEFAULT_TURN_STATE)
  };
}
function army(remaining: number, executeOnTurn = 0): ArmyState {
  return {
    version:3, registered:true, sideId:"red", status:"READY", overrides:{}, route: executeOnTurn ? [{x:100,y:0}] : [],
    plannedRoute:{startCell:{x:0,y:0},executeOnTurn,cells:executeOnTurn?[{x:1,y:0}]:[],totalCostUnits:2,validatedRevision:4,requiresReplan:false},
    movement:{maxUnits:20,remainingUnits:remaining,enteredRouteCellCount:2},
    health:{hp:50,maxHp:50}, supply:{supplied:true,checkedOnTurn:0}, disband:{pending:false,requestedOnTurn:null,requestedByPlayerId:null},
    currentWaypointIndex:0,segmentProgressCells:0,ignoresMovementBarriers:false,ignoresVisionBarriers:false,revision:2
  };
}

it("starts a new turn with exactly five OP and starts only routes due on that turn", () => {
  const result = completeTurn(scene(), { a: army(17, 2) }, {
    source:"SCHEDULE", completedAt:new Date("2026-09-06T12:00:00.000Z"), boundaryId:"STANDARD:2026-09-06T15:00:00+03:00",
    armyCells:{a:{x:0,y:0}}
  });
  expect(result.changed).toBe(true); if (!result.changed) return;
  expect(result.scene.turn.turnNumber).toBe(2);
  expect(result.armies.a?.movement).toEqual({ maxUnits:10, remainingUnits:10, enteredRouteCellCount:0 });
  expect(result.armies.a?.status).toBe("MOVING");
});

it("disbands pending armies before the new turn", () => {
  const pending = army(3); pending.disband = { pending:true, requestedOnTurn:1, requestedByPlayerId:"member" };
  const result = completeTurn(scene(), { a: pending }, { source:"MANUAL", completedAt:new Date("2026-09-02T10:00:00Z"), armyCells:{a:{x:0,y:0}} });
  expect(result.changed).toBe(true); if (!result.changed) return;
  expect(result.armies.a).toBeUndefined();
});

it("checks supply and applies ten percent max HP damage before movement", () => {
  const current = scene();
  current.gridMap.cells["0,0"] = {terrainId:null,impassable:false,factionTerritoryIds:[],recognizedStateId:"blue",deFactoStateId:"red-state"};
  const result = completeTurn(current, { a: army(3) }, { source:"MANUAL", completedAt:new Date("2026-09-02T10:00:00Z"), armyCells:{a:{x:0,y:0}} });
  expect(result.changed).toBe(true); if (!result.changed) return;
  expect(result.armies.a?.supply).toEqual({ supplied:false, checkedOnTurn:2 });
  expect(result.armies.a?.health.hp).toBe(45);
});

it("does not process the same scheduled boundary twice", () => {
  const current = scene(); current.turn.lastProcessedBoundaryId = "STANDARD:2026-09-06T15:00:00+03:00";
  expect(completeTurn(current, {}, { source:"SCHEDULE", completedAt:new Date("2026-09-06T12:00:01.000Z"), boundaryId:"STANDARD:2026-09-06T15:00:00+03:00", armyCells:{} })).toMatchObject({ changed:false, reason:"ALREADY_PROCESSED" });
});

it("pause clears deferral and resume suppresses missed boundaries", () => {
  const deferred = deferTurn(scene().turn, new Date("2026-09-03T15:00:00.000Z"), new Date("2026-09-01T10:00:00.000Z"));
  expect(deferred.ok).toBe(true); if (!deferred.ok) return;
  const paused = pauseAutoTurns(deferred.turn);
  expect(paused.deferredUntil).toBeNull();
  const resumed = resumeAutoTurns(paused, new Date("2026-09-03T10:00:00.000Z"));
  expect(resumed.autoTurnsPaused).toBe(false);
  expect(resumed.lastProcessedBoundaryId).toBe("STANDARD:2026-09-02T15:00:00+03:00");
});

it("does not catch up a suppressed standard boundary after a deferred completion", () => {
  const current = scene();
  const deferred = deferTurn(current.turn,new Date("2026-09-03T15:00:00.000Z"),new Date("2026-09-01T10:00:00.000Z"));
  expect(deferred.ok).toBe(true); if (!deferred.ok) return;
  current.turn = deferred.turn;
  const completed = completeTurn(current, {}, {source:"SCHEDULE",completedAt:new Date("2026-09-03T15:00:01.000Z"),boundaryId:"DEFERRED:2026-09-03T15:00:00.000Z",armyCells:{}});
  expect(completed.changed).toBe(true); if (!completed.changed) return;
  expect(completed.scene.turn.lastProcessedBoundaryId).toBe("STANDARD:2026-09-02T15:00:00+03:00");
});

it("revalidates a due route at turn transition and does not start it when the map changed", () => {
  const current = scene();
  current.gridMap.cells["1,0"] = {
    terrainId: null,
    impassable: true,
    factionTerritoryIds: ["red"],
    recognizedStateId: "red-state",
    deFactoStateId: "red-state"
  };
  const result = completeTurn(current, { a: army(0, 2) }, {
    source: "MANUAL",
    completedAt: new Date("2026-09-02T10:00:00Z"),
    armyCells: { a: { x: 0, y: 0 } }
  });
  expect(result.changed).toBe(true); if (!result.changed) return;
  expect(result.armies.a?.status).toBe("READY");
  expect(result.armies.a?.plannedRoute.invalidReason).toBe("IMPASSABLE");
  expect(result.armies.a?.movement.remainingUnits).toBe(10);
});
