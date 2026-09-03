import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../shared/constants";
import { migrateArmyState, migrateBarrierState, migrateSceneState } from "./migrations";

describe("metadata migrations", () => {
  it("migrates a v0 army through the current v4 schema and fills barrier exceptions", () => {
    const result = migrateArmyState({
      version: 0,
      registered: true,
      sideId: "red",
      status: "IDLE",
      route: []
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        version: 4,
        status: "READY",
        embarkedOnShipId: null,
        ignoresMovementBarriers: false,
        ignoresVisionBarriers: false
      }
    });
  });

  it("refuses a future schema without modifying it", () => {
    expect(migrateSceneState({ version: 99 })).toEqual({
      ok: false,
      issue: { code: "FUTURE_VERSION", version: 99 }
    });
  });

  it("migrates v2 battles to deterministic names", () => {
    const result = migrateSceneState({
      version: 2,
      battleGroups: [
        { battleId: "z", participantIds: ["z1", "z2"], revision: 1 },
        { battleId: "a", participantIds: ["a1", "a2"], revision: 2 }
      ]
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        version: 6,
        battleGroups: [
          { battleId: "a", name: "Бой 1" },
          { battleId: "z", name: "Бой 2" }
        ]
      }
    });
  });

  it("uses locale-independent ordinal battle id order", () => {
    const result = migrateSceneState({
      version: 2,
      battleGroups: [
        { battleId: "я", participantIds: ["я1", "я2"], revision: 1 },
        { battleId: "a", participantIds: ["a1", "a2"], revision: 1 },
        { battleId: "Z", participantIds: ["Z1", "Z2"], revision: 1 },
        { battleId: "é", participantIds: ["é1", "é2"], revision: 1 }
      ]
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        battleGroups: [
          { battleId: "Z", name: "Бой 1" },
          { battleId: "a", name: "Бой 2" },
          { battleId: "é", name: "Бой 3" },
          { battleId: "я", name: "Бой 4" }
        ]
      }
    });
  });

  it("migrates v1 sides through the current v6 schema without losing memberships", () => {
    const result = migrateSceneState({
      version: 1,
      revision: 7,
      settings: DEFAULT_SETTINGS,
      sides: [
        {
          id: "red",
          name: "Красные",
          color: "#f00",
          playerIds: ["player-1", "player-1"]
        }
      ],
      relations: {},
      battleGroups: []
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        version: 6,
        revision: 7,
        sides: [
          {
            id: "red",
            name: "Красные",
            color: "#f00",
            playerIds: ["player-1"],
            leaderPlayerIds: []
          }
        ],
        ships: {},
        activeNavalBattle: null
      }
    });
  });

  it("migrates a v0 scene through the current v6 schema", () => {
    expect(migrateSceneState({
      version: 0,
      revision: 4,
      sides: [{ id: "red", name: "Красные", color: "#f00", playerIds: ["p1"] }]
    })).toMatchObject({
      ok: true,
      value: {
        version: 6,
        revision: 4,
        sides: [{ id: "red", playerIds: ["p1"], leaderPlayerIds: [] }],
        turn: { phase: "MOVEMENT" },
        ships: {}
      }
    });
  });

  it("rejects a present non-numeric scene version instead of treating it as missing", () => {
    expect(migrateSceneState({ version: "1" })).toEqual({
      ok: false,
      issue: { code: "INVALID_VALUE", path: "version" }
    });
    expect(migrateSceneState({ version: null })).toEqual({
      ok: false,
      issue: { code: "INVALID_VALUE", path: "version" }
    });
  });

  it("migrates a v0 barrier to independent movement and vision flags", () => {
    expect(migrateBarrierState({ version: 0, blocks: false })).toMatchObject({
      ok: true,
      value: { version: 1, blocksMovement: false, blocksVision: false }
    });
  });
});

it("migrates v4 scene through state territory and naval schemas", () => {
  const result = migrateSceneState({
    version: 4,
    revision: 3,
    settings: DEFAULT_SETTINGS,
    sides: [{ id: "red", name: "Красные", color: "#f00", playerIds: [], leaderPlayerIds: [] }],
    relations: {},
    battleGroups: [],
    terrain: {
      defaultTerrainId: "plain",
      types: { plain: { id: "plain", name: "Равнина", movementCostUnits: 2, enabled: true } }
    },
    gridMap: {
      version: 1,
      revision: 1,
      cells: { "1,2": { terrainId: null, impassable: false, factionTerritoryIds: ["red"] } }
    },
    wars: [{ id: "war", name: "Война", participantFactionIds: ["red", "blue"], active: true }],
    turn: {
      turnNumber: 4,
      autoTurnsPaused: false,
      deferredUntil: null,
      lastCompletedAt: null,
      lastCompletedBy: null,
      lastProcessedBoundaryId: null
    }
  });

  expect(result).toMatchObject({
    ok: true,
    value: {
      version: 6,
      states: [],
      sides: [{ id: "red", stateId: null }],
      gridMap: {
        cells: {
          "1,2": {
            recognizedStateId: null,
            deFactoStateId: null
          }
        }
      },
      wars: [{ id: "war", participantStateIds: [] }],
      turn: { phase: "MOVEMENT" },
      ships: {}
    }
  });
});

it("migrates v2 army through health supply disband and transport schema with fixed five OP budget", () => {
  const result = migrateArmyState({
    version: 2,
    registered: true,
    sideId: "red",
    status: "READY",
    overrides: {},
    route: [{ x: 100, y: 100 }],
    plannedRoute: {
      startCell: { x: 0, y: 0 },
      cells: [{ x: 1, y: 0 }],
      totalCostUnits: 2,
      validatedRevision: 1,
      requiresReplan: false
    },
    movement: { maxUnits: 20, remainingUnits: 17, enteredRouteCellCount: 0 },
    currentWaypointIndex: 0,
    segmentProgressCells: 0,
    ignoresMovementBarriers: false,
    ignoresVisionBarriers: false,
    revision: 2
  });

  expect(result).toMatchObject({
    ok: true,
    value: {
      version: 4,
      health: { hp: 50, maxHp: 50 },
      supply: { supplied: true, checkedOnTurn: 0 },
      disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
      embarkedOnShipId: null,
      movement: { maxUnits: 10, remainingUnits: 10 },
      plannedRoute: { executeOnTurn: 0, requiresReplan: true }
    }
  });
});
