import { describe, expect, it } from "vitest";
import {
  applySheetStateSnapshots,
  buildSheetWritebackEvent,
  buildSheetWritebackSnapshotEvent,
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

  const sceneOverride = (overrides.scene ?? {}) as Partial<CommandState["scene"]>;
  const rest = { ...overrides };
  delete rest.scene;
  return {
    scene: {
      ...scene,
      ...sceneOverride,
      sides: sceneOverride.sides ?? scene.sides,
      states: sceneOverride.states ?? scene.states,
      demographics: sceneOverride.demographics ?? scene.demographics,
      settings: sceneOverride.settings ?? scene.settings
    } as CommandState["scene"],
    armies: {},
    barriers: {},
    items: {},
    positions: {},
    ...rest
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
  it("exports aggregate HP but never ship counts or individual armies", () => {
    const previous = makeState({
      armies: { "army-1": army(20) },
      scene: { ships: { "ship-1": ship } } as never
    });
    const next = makeState({
      armies: { "army-1": army(19) },
      scene: { ships: { "ship-1": ship } } as never
    });
    const event = buildSheetWritebackEvent(previous, next, "2026-10-01T00:00:00Z");
    expect(event?.factions).toEqual([{ factionId: "side-a", factionName: "A", country: "STATE_A", hp: 19, maxHp: 40 }]);
    expect(event?.stateArmies).toEqual([{ country: "STATE_A", hp: 19, maxHp: 40 }]);
    expect(event?.armies).toEqual([]);
    expect(event?.states).toEqual([]);

    const destroyedShip = makeState({
      armies: { "army-1": army(19) },
      scene: { ships: {} } as never
    });
    const shipEvent = buildSheetWritebackEvent(previous, destroyedShip, "2026-10-01T00:00:00Z");
    expect(shipEvent?.factions).toEqual([{ factionId: "side-a", factionName: "A", country: "STATE_A", hp: 19, maxHp: 40 }]);
    expect(shipEvent?.stateArmies).toEqual([{ country: "STATE_A", hp: 19, maxHp: 40 }]);
    expect(shipEvent?.armies).toEqual([]);
    expect(shipEvent?.states).toEqual([]);
  });

  it("queues new military influence operations for the LR sheet", () => {
    const previous = makeState({ scene: { militaryInfluenceAudit: [] } as never });
    const next = makeState({
      scene: {
        militaryInfluenceAudit: [{
          requestId: "influence-1",
          createdAt: "2026-10-01T00:00:00Z",
          factionId: "side-a",
          factionName: "A",
          country: "STATE_A",
          reasonCode: "LAND_BATTLE_VICTORY",
          delta: 4,
          balanceBefore: 0,
          balanceAfter: 4,
          reason: "Победа",
          actorPlayerId: "gm",
          turnNumber: 1
        }]
      } as never
    });

    const event = buildSheetWritebackEvent(previous, next, "2026-10-01T00:00:00Z");
    expect(event?.militaryInfluenceOperations).toEqual(next.scene.militaryInfluenceAudit);
  });

  it("drops legacy unit projections while preserving military influence operations", () => {
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
    expect(next.pending.armies).toEqual([]);
    expect(next.pending.states).toEqual([]);
    expect(next.pending.removedArmyIds).toEqual([]);
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



  it("does not export individual army HP while allowing aggregate HP", () => {
    const previous = makeState({
      armies: { "army-a": army(20), "army-b": army(10, 40, "side-b") },
      scene: {
        sides: [
          { id: "side-a", name: "A", color: "#fff", playerIds: [], leaderPlayerIds: [], stateId: "state-a" },
          { id: "side-b", name: "B", color: "#000", playerIds: [], leaderPlayerIds: [], stateId: "state-a" }
        ]
      } as never
    });
    const next = makeState({
      armies: { "army-a": army(18), "army-b": army(10, 40, "side-b") },
      scene: {
        sides: [
          { id: "side-a", name: "A", color: "#fff", playerIds: [], leaderPlayerIds: [], stateId: "state-a" },
          { id: "side-b", name: "B", color: "#000", playerIds: [], leaderPlayerIds: [], stateId: "state-a" }
        ]
      } as never
    });
    const event = buildSheetWritebackEvent(previous, next, "2026-10-01T00:00:00Z");
    expect(event?.factions).toEqual([{
      factionId: "side-a",
      factionName: "A",
      country: "STATE_A",
      hp: 18,
      maxHp: 40
    }]);
    expect(event?.stateArmies).toEqual([{ country: "STATE_A", hp: 28, maxHp: 80 }]);
    expect(event?.armies).toEqual([]);
    expect(JSON.stringify(event)).not.toContain("army-a");
  });

  it("can backfill all aggregate HP without exporting units or influence history", () => {
    const next = makeState({
      armies: { "army-1": army(19), "army-2": army(11) },
      scene: {
        militaryInfluenceAudit: [{
          requestId: "old-influence",
          createdAt: "2026-09-30T00:00:00Z",
          factionId: "side-a",
          factionName: "A",
          country: "STATE_A",
          reasonCode: "LAND_BATTLE_VICTORY",
          delta: 4,
          balanceBefore: 0,
          balanceAfter: 4,
          reason: "Победа",
          actorPlayerId: "gm",
          turnNumber: 1
        }]
      } as never
    });
    const event = buildSheetWritebackSnapshotEvent(next, "2026-10-01T00:00:00Z");
    expect(event?.factions).toEqual([{ factionId: "side-a", factionName: "A", country: "STATE_A", hp: 30, maxHp: 80 }]);
    expect(event?.stateArmies).toEqual([{ country: "STATE_A", hp: 30, maxHp: 80 }]);
    expect(event?.militaryInfluenceOperations).toEqual([]);
    expect(event?.armies).toEqual([]);
    expect(event?.states).toEqual([]);
  });

  it("exports only changed aggregate HP for factions and states", () => {
    const previous = makeState({
      armies: { "army-a": army(20), "army-b": army(10, 40, "side-b") },
      scene: {
        sides: [
          { id: "side-a", name: "A", color: "#fff", playerIds: [], leaderPlayerIds: [], stateId: "state-a" },
          { id: "side-b", name: "B", color: "#000", playerIds: [], leaderPlayerIds: [], stateId: "state-a" }
        ]
      } as never
    });
    const next = makeState({
      armies: { "army-a": army(18), "army-b": army(10, 40, "side-b") },
      scene: {
        sides: [
          { id: "side-a", name: "A", color: "#fff", playerIds: [], leaderPlayerIds: [], stateId: "state-a" },
          { id: "side-b", name: "B", color: "#000", playerIds: [], leaderPlayerIds: [], stateId: "state-a" }
        ]
      } as never
    });

    const event = buildSheetWritebackEvent(previous, next, "2026-10-01T00:00:00Z");

    expect(event?.factions).toEqual([{
      factionId: "side-a",
      factionName: "A",
      country: "STATE_A",
      hp: 18,
      maxHp: 40
    }]);
    expect(event?.stateArmies).toEqual([{
      country: "STATE_A",
      hp: 28,
      maxHp: 80
    }]);
    expect(event?.armies).toEqual([]);
    expect(event?.removedArmyIds).toEqual([]);
    expect(JSON.stringify(event)).not.toContain("army-a");
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

  it("keeps potential LR independent from available LR", () => {
    const updated = applySheetStateSnapshots(makeState().scene, [{
      country: "STATE_A", population: 1000, humanResource: 15,
      humanResourceCapacity: 40, conscriptionRate: 0.04
    }]);
    expect(updated.demographics?.[0]).toMatchObject({
      population: 1000, humanResource: 15, humanResourceCapacity: 40
    });
  });

  it("exports ship totals without revealing individual ship IDs", () => {
    const previous = makeState();
    const next = makeState({ scene: { ships: { "private-ship-123": ship } } as never });
    const changed = buildSheetWritebackEvent(previous, next);
    expect(changed?.stateShips).toEqual([{ country: "STATE_A", ships: 1 }]);
    expect(JSON.stringify(changed)).not.toContain("private-ship-123");
    const full = buildSheetWritebackSnapshotEvent(next);
    expect(full?.stateShips).toEqual([{ country: "STATE_A", ships: 1 }]);
    const queue = mergeSheetWritebackQueue(undefined, full ?? (() => { throw new Error('Missing snapshot'); })());
    expect(queue.pending.stateShips).toEqual([{ country: "STATE_A", ships: 1 }]);
  });

});

