import { expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import type { ArmyState, SceneState } from "../shared/types";
import { forcedExitRoutes, reconcileForcedExitStates, validateForcedExitRoute } from "./forcedExitService";

function fixture(): { scene: SceneState; armies: Record<string, ArmyState> } {
  const scene: SceneState = {
    version:7,revision:1,settings:{...DEFAULT_SETTINGS},relations:{},battleGroups:[],terrain:structuredClone(DEFAULT_TERRAIN),wars:[],turn:structuredClone(DEFAULT_TURN_STATE),
    sides:[
      {id:"red",name:"Red",color:"#f00",playerIds:[],leaderPlayerIds:[],stateId:"red-state"},
      {id:"blue",name:"Blue",color:"#00f",playerIds:[],leaderPlayerIds:[],stateId:"blue-state"}
    ],
    states:[
      {id:"red-state",name:"Red State",color:"#f00",rulingFactionId:"red",active:true},
      {id:"blue-state",name:"Blue State",color:"#00f",rulingFactionId:"blue",active:true}
    ], stateRelations:{}, forcedExitStates:[],
    gridMap:{version:1,revision:0,cells:{
      "0,0":{terrainId:null,impassable:false,factionTerritoryIds:[],recognizedStateId:"blue-state",deFactoStateId:"blue-state"},
      "1,0":{terrainId:null,impassable:false,factionTerritoryIds:[],recognizedStateId:"blue-state",deFactoStateId:"blue-state"},
      "2,0":{terrainId:null,impassable:false,factionTerritoryIds:[],recognizedStateId:"red-state",deFactoStateId:"red-state"}
    }}
  };
  const armies = { army:{version:3,registered:true,sideId:"red",status:"READY",overrides:{},route:[],plannedRoute:{startCell:{x:0,y:0},executeOnTurn:0,cells:[],totalCostUnits:0,validatedRevision:1,requiresReplan:false},movement:{maxUnits:10,remainingUnits:10,enteredRouteCellCount:0},health:{hp:50,maxHp:50},supply:{supplied:true,checkedOnTurn:1},disband:{pending:false,requestedOnTurn:null,requestedByPlayerId:null},currentWaypointIndex:0,segmentProgressCells:0,ignoresMovementBarriers:false,ignoresVisionBarriers:false,revision:1} } satisfies Record<string, ArmyState>;
  return { scene, armies };
}

it("activates next-turn forced exit, clears restored legality, and accepts only a shortest route", () => {
  const f = fixture();
  const army = f.armies.army;
  expect(army).toBeDefined();
  if (!army) return;
  f.scene.forcedExitStates = reconcileForcedExitStates(f.scene, f.armies, {army:{x:0,y:0}}, 2, "WAR_ENDED");
  expect(f.scene.forcedExitStates).toEqual([{armyId:"army",startedOnTurn:2,originReason:"WAR_ENDED"}]);
  expect(forcedExitRoutes(f.scene, army, {x:0,y:0})).toEqual([[{x:1,y:0},{x:2,y:0}]]);
  expect(validateForcedExitRoute(f.scene, army, {x:0,y:0}, [{x:1,y:0}])).toEqual({ok:true});
  expect(validateForcedExitRoute(f.scene, army, {x:0,y:0}, [{x:2,y:0}])).toEqual({ok:false,reason:"NOT_SHORTEST_EXIT"});
  f.scene.stateRelations = {"red-state":{"blue-state":{militaryAccess:true,atWar:false}}};
  expect(reconcileForcedExitStates(f.scene, f.armies, {army:{x:0,y:0}}, 2)).toEqual([]);
});
