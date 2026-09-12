import { expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE, METADATA_KEYS } from "../shared/constants";
import type { ArmyCommand, ArmyState, SceneItemRecord, SceneState } from "../shared/types";
import { COMMAND_PROTOCOL_VERSION } from "../shared/types";
import { RouteToolService, type RouteToolServicePort } from "./routeToolService";

const armyState: ArmyState = {
  version: 3, registered: true, sideId: "red", status: "READY", overrides: {}, route: [],
  plannedRoute: { startCell: { x: 0, y: 0 }, executeOnTurn: 0, cells: [], totalCostUnits: 0, validatedRevision: 1, requiresReplan: false },
  movement: { maxUnits: 10, remainingUnits: 10, enteredRouteCellCount: 0 },
  health: { hp: 50, maxHp: 50 }, supply: { supplied: true, checkedOnTurn: 1 },
  disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
  currentWaypointIndex: 0, segmentProgressCells: 0,
  ignoresMovementBarriers: false, ignoresVisionBarriers: false, revision: 1
};

const scene: SceneState = {
  version: 7, revision: 1, settings: structuredClone(DEFAULT_SETTINGS),
  sides: [
    { id: "red", name: "Красные", color: "#f00", playerIds: ["leader"], leaderPlayerIds: ["leader"], stateId: "ru" },
    { id: "blue", name: "Синие", color: "#00f", playerIds: [], leaderPlayerIds: [], stateId: "de" }
  ],
  states: [
    { id: "ru", name: "Россия", color: "#123456", rulingFactionId: "red", active: true },
    { id: "de", name: "Германия", color: "#654321", rulingFactionId: "blue", active: true }
  ],
  relations: {}, stateRelations: { ru: { de: { militaryAccess: true, atWar: false } } },
  battleGroups: [], terrain: structuredClone(DEFAULT_TERRAIN),
  gridMap: { version: 1, revision: 0, cells: {} }, wars: [], turn: structuredClone(DEFAULT_TURN_STATE),
  ships: {}, navalBattleRequests: [], transportEmbarkRequests: [], activeNavalBattle: null,
  navalBattleHistory: [], navalRevealUntilTurn: {}, foreignPresenceViolations: [], forcedExitStates: [],
  strategicCities: [], territorialScores: [], rebellions: [], turnCheckpoint: null
};

it("loads sides, states, and interstate relations into the live route session", async () => {
  const item: SceneItemRecord = { id: "army-a", type: "IMAGE", position: { x: 50, y: 50 }, metadata: { [METADATA_KEYS.army]: structuredClone(armyState) } };
  const port: RouteToolServicePort = {
    getPlayerIdentity: async () => ({ id: "leader", role: "PLAYER", connectionId: "c1" }),
    getSceneMetadata: async () => ({ [METADATA_KEYS.scene]: structuredClone(scene) }),
    patchSceneMetadata: async () => {},
    getSceneItems: async () => [structuredClone(item)],
    updateSceneItem: async () => {},
    getLocalItems: async () => [], addLocalItems: async () => {}, updateLocalItems: async () => {}, deleteLocalItems: async () => {},
    createId: () => "preview-1", show: async () => {}, activateTool: async () => {},
    getGridDistance: async () => 0, getGridDpi: async () => 100, snapGridCenter: async (position) => ({ ...position })
  };
  const service = new RouteToolService(port, { send: async (command: ArmyCommand) => ({
    protocolVersion: COMMAND_PROTOCOL_VERSION, requestId: command.requestId, status: "ACCEPTED",
    coordinatorConnectionId: "gm", recipientConnectionId: command.senderConnectionId
  }) });

  await expect(service.loadSession("army-a")).resolves.toMatchObject({
    sides: scene.sides,
    states: scene.states,
    stateRelations: scene.stateRelations
  });
});
