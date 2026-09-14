import { describe, expect, it } from "vitest";
import { annexingStateForEntry } from "../annexation/annexationRules";
import { classifyStateMovementAccess } from "../movement/stateMovementAccess";

const openCell = {
  terrainId: null,
  impassable: false,
  factionTerritoryIds: [],
  recognizedStateId: "france",
  deFactoStateId: "france"
};

const states = [
  { id: "russia", name: "Россия", color: "#d32f2f", rulingFactionId: "red", active: true },
  { id: "germany", name: "Германия", color: "#1976d2", rulingFactionId: "blue", active: true },
  { id: "france", name: "Франция", color: "#eeeeee", rulingFactionId: "white", active: true }
];

const sides = [
  { id: "red", name: "Красные", color: "#d32f2f", playerIds: [], leaderPlayerIds: [], stateId: "russia" },
  { id: "blue", name: "Синие", color: "#1976d2", playerIds: [], leaderPlayerIds: [], stateId: "germany" },
  { id: "white", name: "Белые", color: "#eeeeee", playerIds: [], leaderPlayerIds: [], stateId: "france" }
];

describe("pairwise state diplomacy regressions", () => {
  it("does not turn legacy war participation into movement access", () => {
    const result = classifyStateMovementAccess({
      sideId: "blue",
      destinationStateId: "france",
      sides,
      states,
      stateRelations: {}
    });

    expect(result).toEqual({ kind: "DECLARE_WAR_AND_ALLOW", sourceStateId: "germany", destinationStateId: "france" });

    const nonRulingSides = [
      ...sides,
      { id: "blue-opposition", name: "Оппозиция", color: "#779", playerIds: [], leaderPlayerIds: [], stateId: "germany" }
    ];
    expect(classifyStateMovementAccess({
      sideId: "blue-opposition",
      destinationStateId: "france",
      sides: nonRulingSides,
      states,
      stateRelations: {}
    })).toEqual({ kind: "DENY_FOREIGN_STATE", destinationStateId: "france" });
  });

  it("does not infer all-vs-all annexation rights from a legacy three-state war", () => {
    const scene = {
      states,
      sides,
      wars: [
        {
          id: "legacy-coalition",
          name: "Старая коалиционная война",
          participantFactionIds: ["red", "blue", "white"],
          participantStateIds: ["russia", "germany", "france"],
          active: true
        }
      ],
      stateRelations: {}
    };

    expect(annexingStateForEntry(scene, "red", openCell)).toBeUndefined();
  });
});
