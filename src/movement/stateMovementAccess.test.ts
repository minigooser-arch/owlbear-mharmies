import { describe, expect, it } from "vitest";
import type { Side, StateEntity, StateRelations } from "../shared/types";
import { classifyStateMovementAccess } from "./stateMovementAccess";

const states: StateEntity[] = [
  { id: "russia", name: "Россия", color: "#b71c1c", rulingFactionId: "red", active: true },
  { id: "germany", name: "Германия", color: "#222222", rulingFactionId: "blue", active: true },
  { id: "france", name: "Франция", color: "#1565c0", rulingFactionId: "white", active: true }
];
const sides: Side[] = [
  { id: "red", name: "Правящие России", color: "#f00", playerIds: [], leaderPlayerIds: [], stateId: "russia" },
  { id: "pink", name: "Оппозиция России", color: "#f8b", playerIds: [], leaderPlayerIds: [], stateId: "russia" },
  { id: "blue", name: "Правящие Германии", color: "#00f", playerIds: [], leaderPlayerIds: [], stateId: "germany" },
  { id: "white", name: "Правящие Франции", color: "#fff", playerIds: [], leaderPlayerIds: [], stateId: "france" },
  { id: "black", name: "Без государства", color: "#000", playerIds: [], leaderPlayerIds: [], stateId: null }
];

function classify(sideId: string, destinationStateId: string | null, relations: StateRelations = {}, stateList = states) {
  return classifyStateMovementAccess({ sideId, destinationStateId, sides, states: stateList, stateRelations: relations });
}

describe("classifyStateMovementAccess", () => {
  it("allows own state and unowned cells", () => {
    expect(classify("pink", "russia")).toEqual({ kind: "ALLOW_OWN_STATE" });
    expect(classify("pink", null)).toEqual({ kind: "ALLOW_UNOWNED" });
    expect(classify("black", null)).toEqual({ kind: "ALLOW_UNOWNED" });
  });

  it("uses directional military access", () => {
    const relations: StateRelations = {
      russia: { germany: { militaryAccess: true, atWar: false } },
      germany: { russia: { militaryAccess: false, atWar: false } }
    };
    expect(classify("pink", "germany", relations)).toEqual({ kind: "ALLOW_MILITARY_ACCESS", destinationStateId: "germany" });
    expect(classify("blue", "russia", relations)).toEqual({ kind: "DECLARE_WAR_AND_ALLOW", sourceStateId: "germany", destinationStateId: "russia" });
  });

  it("allows exact pairwise war without leaking authority to a third state", () => {
    const relations: StateRelations = {
      russia: { germany: { militaryAccess: false, atWar: true } },
      germany: { russia: { militaryAccess: false, atWar: true } }
    };
    expect(classify("pink", "germany", relations)).toEqual({ kind: "ALLOW_WAR", destinationStateId: "germany" });
    expect(classify("pink", "france", relations)).toEqual({ kind: "DENY_FOREIGN_STATE", destinationStateId: "france" });
  });

  it("denies a non-ruling faction at a closed foreign border", () => {
    expect(classify("pink", "germany")).toEqual({ kind: "DENY_FOREIGN_STATE", destinationStateId: "germany" });
  });

  it("lets the ruling faction declare war on actual foreign entry", () => {
    expect(classify("red", "germany")).toEqual({ kind: "DECLARE_WAR_AND_ALLOW", sourceStateId: "russia", destinationStateId: "germany" });
  });

  it("denies stateless factions from state-owned territory", () => {
    expect(classify("black", "germany")).toEqual({ kind: "DENY_STATELESS", destinationStateId: "germany" });
  });

  it("fails closed for missing, inactive, or invalid state configuration", () => {
    expect(classify("pink", "missing")).toEqual({ kind: "DENY_INVALID_POLITICAL_CONFIG" });
    expect(classify("pink", "germany", {}, states.map((state) => state.id === "germany" ? { ...state, active: false } : state))).toEqual({ kind: "DENY_INVALID_POLITICAL_CONFIG" });
    expect(classify("pink", "germany", {}, states.map((state) => state.id === "germany" ? { ...state, rulingFactionId: "red" } : state))).toEqual({ kind: "DENY_INVALID_POLITICAL_CONFIG" });
  });
});
