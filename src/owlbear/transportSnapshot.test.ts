import { describe, expect, it } from "vitest";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import type { ArmyState, NavalSceneState, SceneItemRecord, ShipState } from "../shared/types";
import { buildRoleSafeSnapshot } from "./extensionServices";

function item(id: string, name: string): SceneItemRecord {
  return { id, type: "IMAGE", name, position: { x: 0, y: 0 }, metadata: {} };
}

function army(sideId: string, embarkedOnShipId: string | null = null): ArmyState {
  return {
    version: 4,
    registered: true,
    sideId,
    status: "READY",
    overrides: {},
    route: [],
    plannedRoute: {
      startCell: { x: 0, y: 0 },
      executeOnTurn: 1,
      cells: [],
      totalCostUnits: 0,
      validatedRevision: 1,
      requiresReplan: false
    },
    movement: { maxUnits: 10, remainingUnits: 10, enteredRouteCellCount: 0 },
    health: { hp: 50, maxHp: 50 },
    supply: { supplied: true, checkedOnTurn: 1 },
    disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
    embarkedOnShipId,
    currentWaypointIndex: 0,
    segmentProgressCells: 0,
    ignoresMovementBarriers: false,
    ignoresVisionBarriers: false,
    revision: 1
  };
}

function scene(): NavalSceneState {
  const redTransport = createRegisteredShip("red", "TRANSPORT", "EAST");
  const blueTransport = createRegisteredShip("blue", "TRANSPORT", "WEST");
  blueTransport.embarkedArmyId = "blue-embarked";
  return {
    version: 6,
    revision: 5,
    settings: { ...DEFAULT_SETTINGS },
    sides: [
      {
        id: "red",
        name: "Красные",
        color: "#f00",
        playerIds: ["red-leader", "red-member"],
        leaderPlayerIds: ["red-leader"],
        stateId: null
      },
      {
        id: "blue",
        name: "Синие",
        color: "#00f",
        playerIds: ["blue-leader"],
        leaderPlayerIds: ["blue-leader"],
        stateId: null
      }
    ],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 4, phase: "MOVEMENT" },
    ships: {
      "red-transport": redTransport,
      "blue-transport": blueTransport
    },
    transportEmbarkRequests: [
      { id: "embark-request", shipId: "red-transport", armyId: "blue-army" }
    ],
    navalBattleRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
}

function ship(current: NavalSceneState, id: string): ShipState {
  const value = current.ships[id];
  if (!value) throw new Error(`Missing ship fixture: ${id}`);
  return value;
}

function records(current: NavalSceneState) {
  return {
    armies: [
      { item: item("red-army", "Красная армия"), state: army("red") },
      { item: item("blue-army", "Синяя армия"), state: army("blue") },
      { item: item("blue-hidden", "Скрытая синяя армия"), state: army("blue") },
      { item: item("blue-embarked", "Армия на борту"), state: army("blue", "blue-transport") }
    ],
    ships: [
      { item: item("red-transport", "Красный транспорт"), state: ship(current, "red-transport") },
      { item: item("blue-transport", "Синий транспорт"), state: ship(current, "blue-transport") }
    ]
  };
}

describe("role-safe transport snapshot", () => {
  it("gives a transport-side leader only minimal visible foreign armies that can be requested as cargo", () => {
    const current = scene();
    const input = records(current);
    const snapshot = buildRoleSafeSnapshot({
      role: "PLAYER",
      playerId: "red-leader",
      scene: current,
      players: [],
      armies: input.armies,
      ships: input.ships,
      mapVisibleSourceIds: new Set(["blue-army", "blue-embarked"])
    });

    expect(snapshot.transportEmbarkTargets).toEqual([
      { id: "blue-army", name: "Синяя армия", sideId: "blue", sideName: "Синие" }
    ]);
    const target = snapshot.transportEmbarkTargets?.[0] as unknown as Record<string, unknown> | undefined;
    expect(Object.keys(target ?? {}).sort()).toEqual(["id", "name", "sideId", "sideName"]);
    expect(JSON.stringify(snapshot.transportEmbarkTargets)).not.toContain("healthHp");
    expect(JSON.stringify(snapshot.transportEmbarkTargets)).not.toContain("Скрытая синяя армия");
    expect(JSON.stringify(snapshot.transportEmbarkTargets)).not.toContain("Армия на борту");
  });

  it("does not expose foreign embark targets to an ordinary member", () => {
    const current = scene();
    const input = records(current);
    const snapshot = buildRoleSafeSnapshot({
      role: "PLAYER",
      playerId: "red-member",
      scene: current,
      players: [],
      armies: input.armies,
      ships: input.ships,
      mapVisibleSourceIds: new Set(["blue-army"])
    });

    expect(snapshot.transportEmbarkTargets).toEqual([]);
  });

  it("shows a pending foreign embark request only to the leader of the requested army side and to the GM", () => {
    const current = scene();
    const input = records(current);
    const blueLeader = buildRoleSafeSnapshot({
      role: "PLAYER",
      playerId: "blue-leader",
      scene: current,
      players: [],
      armies: input.armies,
      ships: input.ships,
      mapVisibleSourceIds: new Set()
    });
    const redLeader = buildRoleSafeSnapshot({
      role: "PLAYER",
      playerId: "red-leader",
      scene: current,
      players: [],
      armies: input.armies,
      ships: input.ships,
      mapVisibleSourceIds: new Set()
    });
    const gm = buildRoleSafeSnapshot({
      role: "GM",
      playerId: "gm",
      scene: current,
      players: [],
      armies: input.armies,
      ships: input.ships,
      mapVisibleSourceIds: new Set()
    });

    const expected = [{
      id: "embark-request",
      shipId: "red-transport",
      shipName: "Красный транспорт",
      shipSideId: "red",
      shipSideName: "Красные",
      armyId: "blue-army",
      armyName: "Синяя армия"
    }];
    expect(blueLeader.pendingTransportEmbarkRequests).toEqual(expected);
    expect(gm.pendingTransportEmbarkRequests).toEqual(expected);
    expect(redLeader.pendingTransportEmbarkRequests).toEqual([]);
  });

  it("includes the own army embark link in ArmyView so its owner can see that it is on board", () => {
    const current = scene();
    const input = records(current);
    const snapshot = buildRoleSafeSnapshot({
      role: "PLAYER",
      playerId: "blue-leader",
      scene: current,
      players: [],
      armies: input.armies,
      ships: input.ships,
      mapVisibleSourceIds: new Set()
    });

    expect(snapshot.armies.find((candidate) => candidate.id === "blue-embarked")).toMatchObject({
      embarkedOnShipId: "blue-transport"
    });
  });
});
