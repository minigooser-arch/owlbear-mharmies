import { describe, expect, it } from "vitest";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import type { ArmyState, NavalSceneState, SceneItemRecord, ShipState } from "../shared/types";
import { buildRoleSafeSnapshot } from "./extensionServices";

function item(id: string, name: string): SceneItemRecord {
  return { id, type: "IMAGE", name, position: { x: 0, y: 0 }, metadata: {} };
}

function army(sideId: string, hp = 50): ArmyState {
  return {
    version: 4,
    registered: true,
    sideId,
    status: "READY",
    overrides: {},
    route: [],
    plannedRoute: {
      startCell: { x: 0, y: 0 },
      executeOnTurn: 4,
      cells: [],
      totalCostUnits: 0,
      validatedRevision: 1,
      requiresReplan: false
    },
    movement: { maxUnits: 10, remainingUnits: 10, enteredRouteCellCount: 0 },
    health: { hp, maxHp: 50 },
    supply: { supplied: true, checkedOnTurn: 4 },
    disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
    embarkedOnShipId: null,
    currentWaypointIndex: 0,
    segmentProgressCells: 0,
    ignoresMovementBarriers: false,
    ignoresVisionBarriers: false,
    revision: 1
  };
}

function scene(): NavalSceneState {
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
    relations: {
      red: { blue: "ENEMY" },
      blue: { red: "ENEMY" }
    },
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 4, phase: "POST_MOVEMENT" },
    ships: {
      battleship: createRegisteredShip("red", "BATTLESHIP", "EAST"),
      cruiser: createRegisteredShip("red", "CRUISER", "EAST"),
      transport: createRegisteredShip("red", "TRANSPORT", "EAST")
    },
    transportEmbarkRequests: [],
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
      { item: item("blue-visible", "Видимая синяя армия"), state: army("blue") },
      { item: item("blue-hidden", "Скрытая синяя армия"), state: army("blue") },
      { item: item("blue-dead", "Уничтоженная синяя армия"), state: army("blue", 0) }
    ],
    ships: [
      { item: item("battleship", "Красный линкор"), state: ship(current, "battleship") },
      { item: item("cruiser", "Красный крейсер"), state: ship(current, "cruiser") },
      { item: item("transport", "Красный транспорт"), state: ship(current, "transport") }
    ]
  };
}

function snapshotFor(playerId: string, role: "GM" | "PLAYER" = "PLAYER") {
  const current = scene();
  const input = records(current);
  return buildRoleSafeSnapshot({
    role,
    playerId,
    scene: current,
    players: [],
    armies: input.armies,
    ships: input.ships,
    mapVisibleSourceIds: new Set(["blue-visible", "blue-dead"])
  });
}

describe("role-safe shore bombardment snapshot", () => {
  it("gives a controlling leader only minimal living army targets already visible to that client", () => {
    const snapshot = snapshotFor("red-leader");
    const battleship = snapshot.ships?.find((candidate) => candidate.id === "battleship");
    const cruiser = snapshot.ships?.find((candidate) => candidate.id === "cruiser");

    const expected = [
      { id: "red-army", name: "Красная армия", sideId: "red", sideName: "Красные" },
      { id: "blue-visible", name: "Видимая синяя армия", sideId: "blue", sideName: "Синие" }
    ];
    expect(battleship?.shoreBombardmentTargets).toEqual(expected);
    expect(cruiser?.shoreBombardmentTargets).toEqual(expected);
    expect(snapshot.ships?.find((candidate) => candidate.id === "transport")?.shoreBombardmentTargets).toEqual([]);

    const serialized = JSON.stringify(battleship?.shoreBombardmentTargets);
    expect(serialized).not.toContain("Скрытая синяя армия");
    expect(serialized).not.toContain("Уничтоженная синяя армия");
    expect(Object.keys(battleship?.shoreBombardmentTargets?.[0] ?? {}).sort()).toEqual([
      "id",
      "name",
      "sideId",
      "sideName"
    ]);
  });

  it("does not expose bombardment targets to an ordinary member", () => {
    const snapshot = snapshotFor("red-member");
    expect(snapshot.ships?.find((candidate) => candidate.id === "battleship")?.shoreBombardmentTargets).toEqual([]);
    expect(JSON.stringify(snapshot)).not.toContain("Видимая синяя армия");
  });

  it("closes the target list outside the final global action window or after the ship already fired", () => {
    const current = scene();
    current.turn.phase = "MOVEMENT";
    ship(current, "battleship").shoreBombardmentUsedOnTurn = 4;
    const input = records(current);
    const movementSnapshot = buildRoleSafeSnapshot({
      role: "PLAYER",
      playerId: "red-leader",
      scene: current,
      players: [],
      armies: input.armies,
      ships: input.ships,
      mapVisibleSourceIds: new Set(["blue-visible"])
    });
    expect(movementSnapshot.ships?.find((candidate) => candidate.id === "battleship")?.shoreBombardmentTargets).toEqual([]);

    current.turn.phase = "POST_MOVEMENT";
    const usedSnapshot = buildRoleSafeSnapshot({
      role: "PLAYER",
      playerId: "red-leader",
      scene: current,
      players: [],
      armies: input.armies,
      ships: input.ships,
      mapVisibleSourceIds: new Set(["blue-visible"])
    });
    expect(usedSnapshot.ships?.find((candidate) => candidate.id === "battleship")?.shoreBombardmentTargets).toEqual([]);
  });

  it("lets the GM receive all living targets because the GM map is authoritative-visible", () => {
    const snapshot = snapshotFor("gm", "GM");
    const battleship = snapshot.ships?.find((candidate) => candidate.id === "battleship");
    expect(battleship?.shoreBombardmentTargets?.map((target) => target.id)).toEqual([
      "red-army",
      "blue-visible",
      "blue-hidden"
    ]);
  });
});