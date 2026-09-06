import { describe, expect, it } from "vitest";
import type { NavalBattleState, NavalSceneState, SceneItemRecord, ShipState, Vector2 } from "../../shared/types";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE, METADATA_KEYS } from "../../shared/constants";
import { createRegisteredShip } from "../ships/shipLifecycle";
import {
  InterceptionOverlayService,
  type InterceptionOverlayPort,
  type InterceptionOverlayViewer
} from "./interceptionOverlayService";

class MemoryOverlayPort implements InterceptionOverlayPort {
  items: SceneItemRecord[] = [];
  next = 0;
  async getLocalItems() { return structuredClone(this.items); }
  async addLocalItems(items: readonly SceneItemRecord[]) { this.items.push(...structuredClone(items)); }
  async updateLocalItems(items: readonly SceneItemRecord[]) {
    for (const update of items) {
      const index = this.items.findIndex((item) => item.id === update.id);
      if (index >= 0) this.items[index] = structuredClone(update);
    }
  }
  async deleteLocalItems(ids: readonly string[]) {
    this.items = this.items.filter((item) => !ids.includes(item.id));
  }
  createId() { this.next += 1; return `interception-${this.next}`; }
}

function ship(sideId: string, classId: ShipState["classId"], facing: ShipState["facing"]): ShipState {
  return {
    ...createRegisteredShip(sideId, classId, facing),
    status: "IN_NAVAL_BATTLE",
    battleId: "battle"
  };
}

function battle(): NavalBattleState {
  return {
    version: 1,
    id: "battle",
    requestId: null,
    initiatorSideId: "red",
    areaCells: [
      { x: 5, y: 5 },
      { x: 6, y: 5 },
      { x: 7, y: 5 },
      { x: 5, y: 3 },
      { x: 5, y: 7 }
    ],
    participantShipIds: ["cruiser", "blocker"],
    snapshots: {},
    initiative: [
      { shipId: "cruiser", initialRoll: 20, bonus: 2, total: 22, tieBreakRolls: [] },
      { shipId: "blocker", initialRoll: 10, bonus: 0, total: 10, tieBreakRolls: [] }
    ],
    roundNumber: 3,
    currentShipId: "blocker",
    completedShipIdsThisRound: ["cruiser"],
    movementRemainingByShip: { cruiser: 0, blocker: 2 },
    actionUsedByShip: { cruiser: true, blocker: false },
    interceptions: {
      cruiser: { cruiserShipId: "cruiser", activatedRoundNumber: 2 }
    },
    exitedShipIds: [],
    status: "ACTIVE",
    events: [],
    startedOnTurn: 8,
    startedAt: 1,
    revision: 4
  };
}

function scene(): NavalSceneState {
  const terrain = structuredClone(DEFAULT_TERRAIN);
  terrain.defaultTerrainId = "sea";
  terrain.types.sea = {
    id: "sea",
    name: "Море",
    movementCostUnits: 2,
    enabled: true,
    movementDomains: ["SEA"],
    blocksNavalLos: false
  };
  return {
    version: 6,
    revision: 5,
    settings: structuredClone(DEFAULT_SETTINGS),
    sides: [
      { id: "red", name: "Красные", color: "#ff0000", playerIds: [], leaderPlayerIds: [], stateId: null },
      { id: "blue", name: "Синие", color: "#0000ff", playerIds: [], leaderPlayerIds: [], stateId: null }
    ],
    states: [],
    relations: {},
    battleGroups: [],
    terrain,
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 8, phase: "POST_MOVEMENT" },
    ships: {
      cruiser: ship("red", "CRUISER", "NORTH"),
      blocker: ship("blue", "BATTLESHIP", "SOUTH")
    },
    navalBattleRequests: [],
    transportEmbarkRequests: [],
    activeNavalBattle: battle(),
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
}

function viewer(kind: "GM" | "RED_LEADER" | "RED_MEMBER" | "BLUE_LEADER"): InterceptionOverlayViewer {
  return {
    isGM: kind === "GM",
    leaderSideIds: kind === "RED_LEADER" ? ["red"] : kind === "BLUE_LEADER" ? ["blue"] : []
  };
}

const basePositions: Record<string, Vector2> = {
  cruiser: { x: 550, y: 550 },
  blocker: { x: 1050, y: 1050 }
};

function overlayCells(port: MemoryOverlayPort): string[] {
  return port.items
    .flatMap((item) => {
      const raw = item.metadata[METADATA_KEYS.interceptionOverlay];
      if (typeof raw !== "object" || raw === null) return [];
      const cellKey = (raw as Record<string, unknown>).cellKey;
      return typeof cellKey === "string" ? [cellKey] : [];
    })
    .sort();
}

describe("cruiser interception private overlay", () => {
  it.each([
    ["GM", true],
    ["RED_LEADER", true],
    ["RED_MEMBER", false],
    ["BLUE_LEADER", false]
  ] as const)("is role-safe for %s", async (kind, visible) => {
    const port = new MemoryOverlayPort();
    await new InterceptionOverlayService(port).reconcile({
      dpi: 100,
      scene: scene(),
      shipPositions: basePositions
    }, viewer(kind));

    expect(port.items.length > 0).toBe(visible);
    expect(port.items.every((item) => item.disableHit === true)).toBe(true);
  });

  it("uses the current facing and exact cruiser broadside mask", async () => {
    const port = new MemoryOverlayPort();
    const currentScene = scene();
    const service = new InterceptionOverlayService(port);

    await service.reconcile({ dpi: 100, scene: currentScene, shipPositions: basePositions }, viewer("GM"));
    expect(overlayCells(port)).toEqual(["6,5", "7,5"]);

    currentScene.ships.cruiser!.facing = "EAST";
    await service.reconcile({ dpi: 100, scene: currentScene, shipPositions: basePositions }, viewer("GM"));
    expect(overlayCells(port)).toEqual(["5,3", "5,7"]);
  });

  it("recomputes LOS from current ship positions instead of caching zone cells", async () => {
    const port = new MemoryOverlayPort();
    const currentScene = scene();
    const service = new InterceptionOverlayService(port);

    await service.reconcile({ dpi: 100, scene: currentScene, shipPositions: basePositions }, viewer("GM"));
    expect(overlayCells(port)).toEqual(["6,5", "7,5"]);

    await service.reconcile({
      dpi: 100,
      scene: currentScene,
      shipPositions: {
        ...basePositions,
        blocker: { x: 650, y: 550 }
      }
    }, viewer("GM"));
    expect(overlayCells(port)).toEqual(["6,5"]);
  });

  it("removes local zone items immediately when the interception is gone", async () => {
    const port = new MemoryOverlayPort();
    const currentScene = scene();
    const service = new InterceptionOverlayService(port);
    await service.reconcile({ dpi: 100, scene: currentScene, shipPositions: basePositions }, viewer("GM"));
    expect(port.items.length).toBeGreaterThan(0);

    currentScene.activeNavalBattle!.interceptions = {};
    await service.reconcile({ dpi: 100, scene: currentScene, shipPositions: basePositions }, viewer("GM"));
    expect(port.items).toEqual([]);
  });
});
