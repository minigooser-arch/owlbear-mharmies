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
      "0,0":{terrainId:"plain",impassable:false,factionTerritoryIds:["red"],recognizedStateId:"red-state",deFactoStateId:"red-state"},
      "1,0":{terrainId:"plain",impassable:false,factionTerritoryIds:["red"],recognizedStateId:"red-state",deFactoStateId:"red-state"}
    }},
    wars:[], turn:{...structuredClone(DEFAULT_TURN_STATE),phase:"POST_MOVEMENT"}
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

it("applies a treatment request at the start of the next global turn", () => {
  const damaged = {
    ...army(17),
    health: { hp: 30, maxHp: 50 },
    healing: { pending: true, requestedOnTurn: 1, requestedByPlayerId: "leader", hpHealedThisTurn: 0, checkedOnTurn: 1, hospitalCityId: null }
  };
  const result = completeTurn(scene(), { a: damaged }, {
    source: "MANUAL",
    completedAt: new Date("2026-09-06T12:00:00.000Z"),
    armyCells: { a: { x: 0, y: 0 } }
  });
  expect(result.changed).toBe(true);
  if (!result.changed) return;
  expect(result.scene.turn.turnNumber).toBe(2);
  expect(result.armies.a?.health.hp).toBe(40);
  expect(result.armies.a?.healing?.pending).toBe(false);
});

it("automatically completes one formation stage after a global turn", () => {
  const current = scene();
  current.demographics = [{
    stateId: "red-state", population: 46_084, populationGrowthFactor: 1.003,
    humanResource: 584, conscriptionLawId: "URGENT_CONSCRIPTION", conscriptionRate: 0.04,
    humanResourceCapacity: 1_843.36, lastPopulationCalculationDate: "2026-09-29"
  }];
  const forming: ArmyState = {
    ...army(0),
    health: { hp: 0, maxHp: 40 },
    formation: { active: true, cityId: null, hpAddedThisTurn: 0, checkedOnTurn: 1 }
  };
  const result = completeTurn(current, { a: forming }, {
    source: "MANUAL",
    completedAt: new Date("2026-09-30T10:00:00.000Z"),
    armyCells: { a: { x: 0, y: 0 } }
  });
  expect(result.changed).toBe(true);
  if (!result.changed) return;
  expect(result.armies.a?.health.hp).toBe(20);
  expect(result.armies.a?.formation).toMatchObject({ active: true, hpAddedThisTurn: 20, checkedOnTurn: 2 });
  expect(result.scene.demographics?.[0]?.humanResource).toBe(384);
  expect(result.scene.lrTransactions?.[0]).toMatchObject({ kind: "FORMATION", hp: 20, amount: 200, ratePerHp: 10 });
});

it("automatically forms 35 HP per turn in a city with active barracks", () => {
  const current = scene();
  current.strategicCities = [{
    id: "city-red",
    name: "Red City",
    cells: [{ x: 0, y: 0 }],
    recognizedStateId: "red-state",
    deFactoStateId: "red-state",
    factionInfluenceId: "red",
    mayorId: null,
    isCapital: false,
    historicalBuildTypeCount: 0,
    buildings: [{ id: "b", type: "BARRACKS", cell: { x: 0, y: 0 } }]
  }];
  current.demographics = [{
    stateId: "red-state", population: 46_084, populationGrowthFactor: 1.003,
    humanResource: 584, conscriptionLawId: "URGENT_CONSCRIPTION", conscriptionRate: 0.04,
    humanResourceCapacity: 1_843.36, lastPopulationCalculationDate: "2026-09-29"
  }];
  const forming: ArmyState = {
    ...army(0),
    health: { hp: 0, maxHp: 40 },
    formation: { active: true, cityId: "city-red", hpAddedThisTurn: 0, checkedOnTurn: 1 }
  };
  const result = completeTurn(current, { a: forming }, {
    source: "MANUAL",
    completedAt: new Date("2026-09-30T10:00:00.000Z"),
    armyCells: { a: { x: 0, y: 0 } }
  });
  expect(result.changed).toBe(true);
  if (!result.changed) return;
  expect(result.armies.a?.health.hp).toBe(35);
  expect(result.armies.a?.formation).toMatchObject({ active: true, hpAddedThisTurn: 35, checkedOnTurn: 2 });
  expect(result.scene.demographics?.[0]?.humanResource).toBe(234);
});

it("adds two movement points when an army starts the turn in its active post-station city", () => {
  const current = scene();
  current.strategicCities = [{
    id: "post-city", name: "Post City", cells: [{ x: 0, y: 0 }],
    recognizedStateId: "red-state", deFactoStateId: "red-state", factionInfluenceId: "red",
    mayorId: null, isCapital: false, historicalBuildTypeCount: 0,
    buildings: [
      { id: "post", type: "POST_STATION", cell: { x: 0, y: 0 } },
      { id: "rail", type: "RAILWAY_STATION", cell: { x: 0, y: 0 } }
    ]
  }];
  const result = completeTurn(current, { a: army(0) }, {
    source: "MANUAL",
    completedAt: new Date("2026-09-30T10:00:00.000Z"),
    armyCells: { a: { x: 0, y: 0 } }
  });
  expect(result.changed).toBe(true);
  if (!result.changed) return;
  expect(result.armies.a?.movement).toEqual({ maxUnits: 12, remainingUnits: 12, enteredRouteCellCount: 0 });
});

it("grants exactly one supplied turn to an army stranded inside its railway city", () => {
  const current = scene();
  current.sides.push({ id: "blue", name: "Blue", color: "#00f", playerIds: [], leaderPlayerIds: [], stateId: "blue-state" });
  current.states.push({ id: "blue-state", name: "Blue State", rulingFactionId: "blue", active: true });
  current.gridMap.cells["0,0"] = { terrainId: "plain", impassable: false, factionTerritoryIds: [], recognizedStateId: "red-state", deFactoStateId: "red-state" };
  current.gridMap.cells["1,0"] = { terrainId: "plain", impassable: false, factionTerritoryIds: [], recognizedStateId: "blue-state", deFactoStateId: "blue-state" };
  current.gridMap.cells["2,0"] = { terrainId: "plain", impassable: false, factionTerritoryIds: [], recognizedStateId: "red-state", deFactoStateId: "red-state" };
  current.strategicCities = [{
    id: "rail-city", name: "Rail City", cells: [{ x: 0, y: 0 }, { x: 2, y: 0 }],
    recognizedStateId: "red-state", deFactoStateId: "red-state", factionInfluenceId: "red",
    mayorId: null, isCapital: false, historicalBuildTypeCount: 0,
    buildings: [{ id: "rail", type: "RAILWAY_STATION", cell: { x: 2, y: 0 } }]
  }];

  const first = completeTurn(current, { a: army(0) }, {
    source: "MANUAL",
    completedAt: new Date("2026-09-30T10:00:00.000Z"),
    armyCells: { a: { x: 0, y: 0 } }
  });
  expect(first.changed).toBe(true);
  if (!first.changed) return;
  expect(first.armies.a?.supply).toEqual({ supplied: true, checkedOnTurn: 2, unsuppliedSinceTurn: 2 });

  first.scene.turn.phase = "POST_MOVEMENT";
  const second = completeTurn(first.scene, first.armies, {
    source: "MANUAL",
    completedAt: new Date("2026-10-01T10:00:00.000Z"),
    armyCells: { a: { x: 0, y: 0 } }
  });
  expect(second.changed).toBe(true);
  if (!second.changed) return;
  expect(second.armies.a?.supply.supplied).toBe(false);
  expect(second.armies.a?.supply.unsuppliedSinceTurn).toBe(2);
});

it("always starts the new turn in movement phase", () => {
  const current = scene();
  current.turn.phase = "POST_MOVEMENT";
  const result = completeTurn(current, {}, {
    source: "MANUAL",
    completedAt: new Date("2026-09-09T10:00:00.000Z"),
    armyCells: {}
  });
  expect(result.changed).toBe(true); if (!result.changed) return;
  expect(result.scene.turn.turnNumber).toBe(2);
  expect(result.scene.turn.phase).toBe("MOVEMENT");
});

it("keeps the turn open until armies finish their active movement routes", () => {
  const current = scene();
  current.turn.phase = "POST_MOVEMENT";
  const moving = army(8, 1);
  moving.status = "MOVING";
  const result = completeTurn(current, { a: moving }, {
    source: "MANUAL",
    completedAt: new Date("2026-09-09T10:00:00.000Z"),
    armyCells: { a: { x: 0, y: 0 } }
  });
  expect(result).toMatchObject({
    changed: false,
    reason: "MOVEMENT_RESOLUTION_PENDING",
    blockers: ["MOVEMENT_RESOLUTION_PENDING"]
  });
});

it("refuses any global turn completion while a naval battle is active", () => {
  const current = scene();
  current.version = 6;
  current.turn.phase = "POST_MOVEMENT";
  current.activeNavalBattle = {
    version: 1,
    id: "naval-1",
    requestId: null,
    initiatorSideId: "red",
    areaCells: [{ x: 0, y: 0 }],
    participantShipIds: [],
    snapshots: {},
    initiative: [],
    roundNumber: 1,
    currentShipId: null,
    completedShipIdsThisRound: [],
    movementRemainingByShip: {},
    actionUsedByShip: {},
    exitedShipIds: [],
    status: "ACTIVE",
    events: [],
    startedOnTurn: 1,
    startedAt: 1,
    revision: 1
  };

  expect(completeTurn(current, {}, {
    source: "SCHEDULE",
    completedAt: new Date("2026-09-11T12:00:00.000Z"),
    boundaryId: "STANDARD:2026-09-11T15:00:00+03:00",
    armyCells: {}
  })).toEqual({
    changed: false,
    reason: "NAVAL_BATTLE_ACTIVE",
    blockers: ["NAVAL_BATTLE_ACTIVE"]
  });

  expect(completeTurn(current, {}, {
    source: "MANUAL",
    completedAt: new Date("2026-09-11T12:00:00.000Z"),
    armyCells: {}
  })).toEqual({
    changed: false,
    reason: "NAVAL_BATTLE_ACTIVE",
    blockers: ["NAVAL_BATTLE_ACTIVE"]
  });
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
  current.gridMap.cells["1,0"] = {terrainId:null,impassable:false,factionTerritoryIds:[],recognizedStateId:"blue",deFactoStateId:"blue"};
  const result = completeTurn(current, { a: army(3) }, { source:"MANUAL", completedAt:new Date("2026-09-02T10:00:00Z"), armyCells:{a:{x:0,y:0}} });
  expect(result.changed).toBe(true); if (!result.changed) return;
  expect(result.armies.a?.supply).toEqual({ supplied:false, checkedOnTurn:2, unsuppliedSinceTurn:2 });
  expect(result.armies.a?.health.hp).toBe(50);
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

it("keeps a due route blocked when it crosses a closed recognized border", () => {
  const current = scene();
  current.version = 7;
  current.sides.push({id:"government",name:"Government",color:"#fff",playerIds:[],leaderPlayerIds:[],stateId:"red-state"});
  current.sides.push({id:"blue",name:"Blue",color:"#00f",playerIds:[],leaderPlayerIds:[],stateId:"blue-state"});
  current.states = current.states.map((state) => state.id === "red-state"
    ? { ...state, rulingFactionId: "government" }
    : state);
  current.states.push({id:"blue-state",name:"Blue State",color:"#00f",rulingFactionId:"blue",active:true});
  current.stateRelations = {};
  current.gridMap.cells["1,0"] = {
    terrainId:null,impassable:false,factionTerritoryIds:[],recognizedStateId:"blue-state",deFactoStateId:"blue-state"
  };
  const result = completeTurn(current, { a: army(0, 2) }, {
    source:"MANUAL", completedAt:new Date("2026-09-02T10:00:00Z"), armyCells:{a:{x:0,y:0}}
  });
  expect(result.changed).toBe(true); if (!result.changed) return;
  expect(result.armies.a?.status).toBe("READY");
  expect(result.armies.a?.plannedRoute.invalidReason).toBe("FOREIGN_STATE_CLOSED");
});

it("activates forced exit on the next turn for an army that lost legal presence", () => {
  const current = scene();
  current.version = 7;
  current.sides.push({id:"blue",name:"Blue",color:"#00f",playerIds:[],leaderPlayerIds:[],stateId:"blue-state"});
  current.states.push({id:"blue-state",name:"Blue State",color:"#00f",rulingFactionId:"blue",active:true});
  current.stateRelations = {};
  current.forcedExitStates = [];
  current.gridMap.cells["1,0"] = {terrainId:null,impassable:false,factionTerritoryIds:[],recognizedStateId:"blue-state",deFactoStateId:"blue-state"};
  const result = completeTurn(current, {a:army(0)}, {
    source:"MANUAL", completedAt:new Date("2026-09-02T10:00:00Z"), armyCells:{a:{x:1,y:0}}
  });
  expect(result.changed).toBe(true); if (!result.changed) return;
  expect(result.scene.forcedExitStates).toEqual([{armyId:"a",startedOnTurn:2,originReason:"OTHER"}]);
});

it("automatically continues withdrawal over multiple turns using the available budget", () => {
  const current = scene();
  current.sides.push({id:"blue",name:"Blue",color:"#00f",playerIds:[],leaderPlayerIds:[],stateId:"blue-state"});
  current.states.push({id:"blue-state",name:"Blue",rulingFactionId:"blue",active:true});
  current.gridMap.cells = Object.fromEntries(Array.from({length:8}, (_, x) => [
    x + ",0", {terrainId:"plain",impassable:false,factionTerritoryIds:[],recognizedStateId:x === 7 ? "red-state" : "blue-state",deFactoStateId:x === 7 ? "red-state" : "blue-state"}
  ]));
  const first = completeTurn(current, {a:army(0)}, {
    source:"MANUAL",completedAt:new Date("2026-09-02T10:00:00Z"),armyCells:{a:{x:0,y:0}},
    positionForCell: ({x,y}) => ({x:x*100+50,y:y*100+50})
  });
  expect(first.changed).toBe(true); if (!first.changed) return;
  expect(first.armies.a?.plannedRoute.cells).toHaveLength(5);
  expect(first.armies.a?.status).toBe("MOVING");
  first.scene.turn.phase = "POST_MOVEMENT";
  const second = completeTurn(first.scene, first.armies, {
    source:"MANUAL",completedAt:new Date("2026-09-03T10:00:00Z"),armyCells:{a:{x:5,y:0}},
    positionForCell: ({x,y}) => ({x:x*100+50,y:y*100+50})
  });
  expect(second.changed).toBe(true); if (!second.changed) return;
  expect(second.armies.a?.plannedRoute.cells).toEqual([{x:6,y:0},{x:7,y:0}]);
  expect(second.scene.stateRelations ?? {}).toEqual({});
});


it("exposes land battle and movement blockers before running a checkpoint", () => {
  const moving = scene();
  moving.turn.phase = "MOVEMENT";
  expect(completeTurn(moving, {}, {
    source: "MANUAL",
    completedAt: new Date("2026-09-14T10:00:00Z"),
    armyCells: {}
  })).toEqual({
    changed: false,
    reason: "MOVEMENT_RESOLUTION_PENDING",
    blockers: ["MOVEMENT_RESOLUTION_PENDING"]
  });

  const battle = scene();
  battle.battleGroups = [{ battleId: "land", name: "Land", participantIds: [], revision: 1 }];
  expect(completeTurn(battle, {}, {
    source: "MANUAL",
    completedAt: new Date("2026-09-14T10:00:00Z"),
    armyCells: {}
  })).toEqual({
    changed: false,
    reason: "LAND_BATTLE_ACTIVE",
    blockers: ["LAND_BATTLE_ACTIVE"]
  });
});

