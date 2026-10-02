import { describe, expect, it } from "vitest";
import {
  applySheetStateSnapshots,
  buildSheetWritebackEvent,
  mergeSheetWritebackQueue,
  pendingLRTransactions,
  type SheetWritebackEvent
} from "./writeback";
import type { CommandState } from "../commands/commandProcessorCore";

function makeState(overrides: Partial<CommandState> = {}): CommandState {
  const scene = {
    revision: 1,
    settings: {},
    sides: [
      { id: "side-a", name: "A", color: "#fff", playerIds: [], leaderPlayerIds: [], stateId: "state-a" }
    ],
    states: [
      { id: "state-a", name: "State A", rulingFactionId: null, active: true, backendCountry: "STATE_A" }
    ],
    battleGroups: [],
    ships: {},
    lrTransactions: [],
    demographics: [{
      stateId: "state-a",
      population: 1000,
      populationGrowthFactor: 1,
      humanResource: 40,
      conscriptionLawId: "URGENT_CONSCRIPTION",
      conscriptionRate: 0.04,
      humanResourceCapacity: 40,
      lastPopulationCalculationDate: null
    }]
  } as unknown as CommandState["scene"];

  return {
    scene: { ...scene, ...(overrides.scene ?? {}) } as CommandState["scene"],
    armies: {},
    barriers: {},
    items: {},
    positions: {},
    ...overrides
  };
}

function army(hp: number, maxHp = 40, sideId = "side-a") {
  return {
    version: 4,
    sideId,
    status: "READY",
    health: { hp, maxHp },
    movement: { maxUnits: 5, remainingUnits: 5, enteredRouteCellCount: 0 },
    route: [],
    plannedRoute: { startCell: { x: 0, y: 0 }, executeOnTurn: null, cells: [], totalCostUnits: 0, validatedRevision: 1, requiresReplan: false },
    currentWaypointIndex: 0,
    segmentProgressCells: 0,
    battleId: null,
    formation: { active: false, cityId: null, hpAddedThisTurn: 0, checkedOnTurn: null },
    healing: { pending: false, requestedAt: null, requestedByPlayerId: null, checkedOnTurn: 0, hpHealedThisTurn: 0 },
    supply: { status: "SUPPLIED", current: 100, maximum: 100, checkedOnTurn: 0 },
    revision: 1,
    overrides: {},
    embarkedOnShipId: null,
    ignoresMovementBarriers: false,
    ignoresVisionBarriers: false
  } as never;
}

const ship = {
  version: 1,
  registered: true,
  sideId: "side-a",
  classId: "CRUISER",
  status: "READY",
  hp: 10,
  temporaryHp: 0,
  facing: "NORTH",
  plannedRoute: [],
  plannedFacing: null,
  globalMovementRemaining: 5,
  movementSpentThisTurn: false,
  battleId: null,
  detectionOverride: null,
  embarkedArmyId: null,
  shoreBombardmentUsedOnTurn: null,
  logisticsActionUsedOnTurn: null,
  revision: 1
} as never;

describe("sheet writeback projection", () => {
  it("writes only changed army HP/maxHP and ship counts", () => {
    const previous = makeState({
      armies: { "army-1": army(20) },
      scene: { ships: { "ship-1": ship } } as never
    });
    const next = makeState({
      armies: { "army-1": army(19) },
      scene: { ships: { "ship-1": ship } } as never
    });
    const event = buildSheetWritebackEvent(previous, next, "2026-10-01T00:00:00Z");
    expect(event?.armies).toEqual([{ armyId: "army-1", stateId: "state-a", country: "STATE_A", hp: 19, maxHp: 40 }]);
    expect(event?.states).toEqual([]);

    const destroyedShip = makeState({
      armies: { "army-1": army(19) },
      scene: { ships: {} } as never
    });
    const shipEvent = buildSheetWritebackEvent(previous, destroyedShip, "2026-10-01T00:00:00Z");
    expect(shipEvent?.states).toEqual([{ country: "STATE_A", ships: 0 }]);
  });

  it("coalesces pending state by army and country", () => {
    const first: SheetWritebackEvent = {
      version: 1, eventId: "e1", createdAt: "a",
      armies: [{ armyId: "a", stateId: "s", country: "C", hp: 20, maxHp: 40 }],
      removedArmyIds: [],
      states: [{ country: "C", ships: 3 }]
    };
    const second: SheetWritebackEvent = {
      version: 1, eventId: "e2", createdAt: "b",
      armies: [{ armyId: "a", stateId: "s", country: "C", hp: 18, maxHp: 40 }],
      removedArmyIds: ["b"],
      states: [{ country: "C", ships: 2 }]
    };
    const merged = mergeSheetWritebackQueue(undefined, first);
    const next = mergeSheetWritebackQueue(merged, second);
    expect(next.pending.eventId).toBe("e2");
    expect(next.pending.armies).toEqual([{ armyId: "a", stateId: "s", country: "C", hp: 18, maxHp: 40 }]);
    expect(next.pending.states).toEqual([{ country: "C", ships: 2 }]);
    expect(next.pending.removedArmyIds).toEqual(["b"]);
  });

  it("applies authoritative population/LR snapshots and rejects unmappable states", () => {
    const scene = makeState().scene;
    const updated = applySheetStateSnapshots(scene, [{
      country: "STATE_A",
      population: 900,
      humanResource: 36,
      conscriptionRate: 0.04
    }]);
    expect(updated.demographics?.[0]).toMatchObject({
      population: 900,
      humanResource: 36,
      humanResourceCapacity: 36
    });
    expect(() => applySheetStateSnapshots(scene, [{
      country: "UNKNOWN",
      population: 900,
      humanResource: 36
    }])).toThrow("SHEET_DEMOGRAPHY_NOT_FOUND:UNKNOWN");
  });

  it("extracts only new pending LR transactions", () => {
    const previous = makeState({
      scene: {
        lrTransactions: [{
          id: "old", requestId: "old", createdAt: "", turnNumber: 1, actorPlayerId: "p",
          sideId: "side-a", sideName: "A", cityId: null, cityName: null,
          armyId: "army", armyName: "Army", kind: "HEALING", hp: 1, ratePerHp: 5,
          amount: 5, status: "RECORDED"
        }]
      } as never
    });
    const next = makeState({
      scene: {
        lrTransactions: [
          ...(previous.scene.lrTransactions ?? []),
          {
            id: "new", requestId: "new", createdAt: "", turnNumber: 1, actorPlayerId: "p",
            sideId: "side-a", sideName: "A", cityId: null, cityName: null,
            armyId: "army", armyName: "Army", kind: "HEALING", hp: 1, ratePerHp: 5,
            amount: 5, status: "PENDING"
          }
        ]
      } as never
    });
    expect(pendingLRTransactions(previous, next)).toHaveLength(1);
    const pending = pendingLRTransactions(previous, next);
    expect(pending[0]?.country).toBe("STATE_A");
  });
});
