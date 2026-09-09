import { expect, it, vi } from "vitest";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE, METADATA_KEYS } from "../shared/constants";
import type { ItemUpdate, SceneItemRecord, SceneState, TerrainType } from "../shared/types";
import { ShipRouteToolService, type ShipRouteToolServicePort } from "./shipRouteToolService";

function seaTerrain(): TerrainType {
  return {
    id: "sea",
    name: "Море",
    movementCostUnits: 2,
    enabled: true,
    movementDomains: ["SEA"],
    blocksNavalLos: false
  };
}

class PostMovementPort implements ShipRouteToolServicePort {
  private readonly ship = createRegisteredShip("red", "IRONCLAD", "EAST");
  private readonly scene: SceneState = {
    version: 6,
    revision: 1,
    settings: { ...DEFAULT_SETTINGS },
    sides: [{
      id: "red",
      name: "Красные",
      color: "#f00",
      playerIds: ["leader"],
      leaderPlayerIds: ["leader"],
      stateId: null
    }],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: {
      ...structuredClone(DEFAULT_TERRAIN),
      defaultTerrainId: "sea",
      types: { ...structuredClone(DEFAULT_TERRAIN.types), sea: seaTerrain() }
    },
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), phase: "POST_MOVEMENT" },
    ships: { ship: this.ship },
    navalBattleRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };

  async getPlayerIdentity() { return { id: "leader", role: "PLAYER" as const, connectionId: "leader-connection" }; }
  async getSceneMetadata() { return { [METADATA_KEYS.scene]: structuredClone(this.scene) }; }
  async patchSceneMetadata() { return; }
  async getSceneItems(): Promise<SceneItemRecord[]> {
    return [{
      id: "ship",
      type: "IMAGE",
      position: { x: 50, y: 50 },
      metadata: { [METADATA_KEYS.ship]: structuredClone(this.ship) }
    }];
  }
  async updateSceneItem(_id: string, _update: ItemUpdate) { return; }
  async getLocalItems(): Promise<SceneItemRecord[]> { return []; }
  async addLocalItem(_item: SceneItemRecord) { return; }
  async addLocalItems(_items: readonly SceneItemRecord[]) { return; }
  async updateLocalItems(_items: readonly SceneItemRecord[]) { return; }
  async deleteLocalItems(_ids: readonly string[]) { return; }
  createId() { return "preview"; }
  async show() { return; }
  async activateTool() { return; }
  async snapGridCenter(position: { x: number; y: number }) { return position; }
  async getGridDpi() { return 100; }
}

it("refuses to open the ship route tool after the movement phase", async () => {
  const service = new ShipRouteToolService(new PostMovementPort(), { send: vi.fn() });
  await expect(service.loadSession("ship"))
    .rejects.toEqual(expect.objectContaining({ code: "NOT_MOVEMENT_PHASE" }));
});
