import { expect, it } from "vitest";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import type { NavalBattleState, SceneItemRecord, SceneState, ShipState } from "../shared/types";
import { buildRoleSafeSnapshot } from "./extensionServices";

const shipState: ShipState = {
  ...createRegisteredShip("red", "CRUISER", "EAST"),
  status: "IN_NAVAL_BATTLE",
  battleId: "naval-1"
};
const item: SceneItemRecord = {
  id: "red-ship",
  type: "IMAGE",
  name: "Аврора",
  position: { x: 50, y: 50 },
  metadata: {}
};
const battle: NavalBattleState = {
  version: 1,
  id: "naval-1",
  requestId: null,
  initiatorSideId: "red",
  areaCells: [{ x: 0, y: 0 }],
  participantShipIds: ["red-ship"],
  snapshots: {},
  initiative: [{ shipId: "red-ship", initialRoll: 12, bonus: 2, total: 14, tieBreakRolls: [] }],
  roundNumber: 2,
  currentShipId: null,
  completedShipIdsThisRound: ["red-ship"],
  movementRemainingByShip: { "red-ship": 0 },
  actionUsedByShip: { "red-ship": false },
  exitedShipIds: ["red-ship"],
  status: "ACTIVE",
  events: [],
  startedOnTurn: 4,
  startedAt: 1,
  revision: 4
};
const scene: SceneState = {
  version: 6,
  revision: 8,
  settings: { ...DEFAULT_SETTINGS },
  sides: [{ id: "red", name: "Красные", color: "#f00", playerIds: ["leader"], leaderPlayerIds: ["leader"], stateId: null }],
  states: [],
  relations: {},
  battleGroups: [],
  terrain: structuredClone(DEFAULT_TERRAIN),
  gridMap: { version: 1, revision: 0, cells: {} },
  wars: [],
  turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 4, phase: "POST_MOVEMENT" },
  ships: { "red-ship": shipState },
  navalBattleRequests: [],
  activeNavalBattle: battle,
  navalBattleHistory: [],
  navalRevealUntilTurn: {}
};

it("marks an already-visible ship as exited without exposing broader battle state", () => {
  const snapshot = buildRoleSafeSnapshot({
    role: "PLAYER",
    playerId: "leader",
    scene,
    players: [],
    armies: [],
    ships: [{ item, state: shipState }],
    mapVisibleSourceIds: new Set()
  });

  expect(snapshot.ships).toHaveLength(1);
  expect(snapshot.ships?.[0]).toMatchObject({
    id: "red-ship",
    navalExited: true,
    isCurrentNavalTurn: false
  });
  expect(snapshot.activeNavalBattle).toBeUndefined();
});
