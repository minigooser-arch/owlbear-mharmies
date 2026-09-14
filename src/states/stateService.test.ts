import { describe, expect, it } from "vitest";
import type { GridMapState, Side, StateEntity } from "../shared/types";
import {
  createState,
  deleteState,
  setSideState,
  updateState,
  validateStateConfiguration
} from "./stateService";

const sides: Side[] = [
  { id: "red", name: "Красные", color: "#d32f2f", playerIds: [], leaderPlayerIds: [], stateId: "russia" },
  { id: "blue", name: "Синие", color: "#1976d2", playerIds: [], leaderPlayerIds: [], stateId: "germany" }
];

const states: StateEntity[] = [
  { id: "russia", name: "Россия", color: "#607d8b", rulingFactionId: "red", active: true },
  { id: "germany", name: "Германия", color: "#607d8b", rulingFactionId: "blue", active: true }
];

const emptyGrid: GridMapState = { version: 1, revision: 0, cells: {} };

describe("stateService", () => {
  it("requires an active state to have a ruler belonging to that state", () => {
    expect(validateStateConfiguration(
      { id: "x", name: "X", color: "#607d8b", rulingFactionId: null, active: true },
      sides
    )).toEqual({ ok: false, reason: "STATE_RULING_FACTION_REQUIRED" });

    expect(validateStateConfiguration(
      { id: "russia", name: "Россия", color: "#607d8b", rulingFactionId: "blue", active: true },
      sides
    )).toEqual({ ok: false, reason: "RULING_FACTION_MUST_BELONG_TO_STATE" });
  });

  it("allows an inactive state without a ruler", () => {
    expect(createState(states, sides, {
      id: "france",
      name: "Франция",
      color: "#607d8b",
      rulingFactionId: null,
      active: false
    })).toMatchObject({ ok: true });
  });

  it("rejects moving the ruling faction out of an active state", () => {
    expect(setSideState(states, sides, "red", "germany")).toEqual({
      ok: false,
      reason: "RULING_FACTION_MOVE_FORBIDDEN"
    });
  });

  it("allows moving the ruler after the source state is deactivated and clears stale rulership", () => {
    const deactivated = updateState(states, sides, "russia", { active: false });
    expect(deactivated.ok).toBe(true);
    if (!deactivated.ok) return;
    const moved = setSideState(deactivated.states, deactivated.sides, "red", "germany");
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.sides.find((side) => side.id === "red")?.stateId).toBe("germany");
    expect(moved.states.find((state) => state.id === "russia")?.rulingFactionId).toBeNull();
  });

  it("rejects deleting a state while factions or map cells still reference it", () => {
    expect(deleteState(states, sides, emptyGrid, "russia")).toEqual({
      ok: false,
      reason: "STATE_STILL_REFERENCED"
    });

    const noFactionReference = sides.map((side) =>
      side.id === "red" ? { ...side, stateId: null } : side
    );
    const grid: GridMapState = {
      version: 1,
      revision: 0,
      cells: {
        "0,0": {
          terrainId: null,
          impassable: false,
          factionTerritoryIds: [],
          recognizedStateId: "russia",
          deFactoStateId: "russia"
        }
      }
    };
    expect(deleteState(states, noFactionReference, grid, "russia")).toEqual({
      ok: false,
      reason: "STATE_STILL_REFERENCED"
    });
  });
});
