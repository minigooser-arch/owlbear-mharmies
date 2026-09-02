import { describe, expect, it } from "vitest";
import { annexingStateForEntry } from "./annexationRules";

describe("annexation", () => {
  const scene = {
    states:[{id:"russia",name:"Россия",rulingFactionId:"romanov",active:true},{id:"germany",name:"Германия",rulingFactionId:"hohenzollern",active:true}],
    sides:[{id:"romanov",name:"Романовы",color:"#f00",playerIds:[],leaderPlayerIds:[],stateId:"russia"},{id:"opposition",name:"Оппозиция",color:"#aaa",playerIds:[],leaderPlayerIds:[],stateId:"russia"}],
    wars:[{id:"war",name:"Война",participantFactionIds:["romanov","hohenzollern"],participantStateIds:["russia","germany"],active:true}]
  };
  const enemyCell = { terrainId:null,impassable:false,factionTerritoryIds:[],recognizedStateId:"germany",deFactoStateId:"germany" };
  it("allows only the ruling faction to annex an enemy state cell during war", () => {
    expect(annexingStateForEntry(scene,"romanov",enemyCell)).toBe("russia");
    expect(annexingStateForEntry(scene,"opposition",enemyCell)).toBeUndefined();
  });
});
