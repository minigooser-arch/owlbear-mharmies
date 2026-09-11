import { describe, expect, it } from "vitest";
import { annexingStateForEntry } from "../annexation/annexationRules";
import { canFactionEnterCell } from "../wars/warRules";

const openCell = {
  terrainId: null,
  impassable: false,
  factionTerritoryIds: [],
  recognizedStateId: "france",
  deFactoStateId: "france"
};

describe("pairwise state diplomacy regressions", () => {
  it("does not turn generic faction participation in any war into global movement access", () => {
    const result = canFactionEnterCell({
      factionId: "red",
      cellState: openCell,
      wars: [
        {
          id: "some-war",
          name: "Другая война",
          participantFactionIds: ["red", "blue"],
          participantStateIds: ["russia", "germany"],
          active: true
        }
      ]
    });

    expect(result).toEqual({ allowed: false, reason: "OUTSIDE_FACTION_TERRITORY" });
  });

  it("does not infer all-vs-all annexation rights from a legacy three-state war", () => {
    const scene = {
      states: [
        { id: "russia", name: "Россия", rulingFactionId: "red", active: true },
        { id: "germany", name: "Германия", rulingFactionId: "blue", active: true },
        { id: "france", name: "Франция", rulingFactionId: "white", active: true }
      ],
      sides: [
        { id: "red", name: "Красные", color: "#d32f2f", playerIds: [], leaderPlayerIds: [], stateId: "russia" },
        { id: "blue", name: "Синие", color: "#1976d2", playerIds: [], leaderPlayerIds: [], stateId: "germany" },
        { id: "white", name: "Белые", color: "#eeeeee", playerIds: [], leaderPlayerIds: [], stateId: "france" }
      ],
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
