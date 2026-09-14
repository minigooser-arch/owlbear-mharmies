import { describe, expect, it } from "vitest";
import { annexingStateForEntry } from "./annexationRules";

describe("annexation", () => {
  const scene = {
    states:[{id:"russia",name:"Россия",rulingFactionId:"romanov",active:true},{id:"germany",name:"Германия",rulingFactionId:"hohenzollern",active:true}],
    sides:[{id:"romanov",name:"Романовы",color:"#f00",playerIds:[],leaderPlayerIds:[],stateId:"russia"},{id:"opposition",name:"Оппозиция",color:"#aaa",playerIds:[],leaderPlayerIds:[],stateId:"russia"}],
    wars:[{id:"war",name:"Война",participantFactionIds:["romanov","hohenzollern"],participantStateIds:["russia","germany"],active:true}],
    stateRelations:{
      russia:{germany:{militaryAccess:false,atWar:true}},
      germany:{russia:{militaryAccess:false,atWar:true}}
    }
  };
  const enemyCell = { terrainId:null,impassable:false,factionTerritoryIds:[],recognizedStateId:"germany",deFactoStateId:"germany" };
  it("allows only the ruling faction to annex an enemy state cell during exact pairwise war", () => {
    expect(annexingStateForEntry(scene,"romanov",enemyCell)).toBe("russia");
    expect(annexingStateForEntry(scene,"opposition",enemyCell)).toBeUndefined();
  });
  it("does not occupy neutral recognized territory controlled by an enemy", () => {
    expect(annexingStateForEntry(scene, "romanov", {...enemyCell, recognizedStateId:"france"})).toBeUndefined();
  });
  it("recaptures own recognized land from the exact enemy", () => {
    expect(annexingStateForEntry(scene, "romanov", {...enemyCell, recognizedStateId:"russia"})).toBe("russia");
  });
});
