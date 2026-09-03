import { describe, expect, it, vi } from "vitest";
import type { CommandAck } from "../commands/commandGateway";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE, METADATA_KEYS } from "../shared/constants";
import { COMMAND_PROTOCOL_VERSION } from "../shared/types";
import type { ArmyCommand, ItemUpdate, SceneItemRecord, SceneState, ShipState } from "../shared/types";
import { ShipRouteToolService, type ShipRouteToolServicePort } from "./shipRouteToolService";

const shipState = createRegisteredShip("red", "IRONCLAD", "EAST");
const scene: SceneState = {
  version: 6,
  revision: 7,
  settings: { ...DEFAULT_SETTINGS },
  sides: [{ id: "red", name: "Красные", color: "#f00", playerIds: ["leader", "member"], leaderPlayerIds: ["leader"], stateId: null }],
  states: [], relations: {}, battleGroups: [],
  terrain: {
    ...structuredClone(DEFAULT_TERRAIN),
    types: {
      ...structuredClone(DEFAULT_TERRAIN.types),
      sea: { id: "sea", name: "Море", movementCostUnits: 2, enabled: true, movementDomains: ["SEA"], blocksNavalLos: false }
    },
    defaultTerrainId: "sea"
  },
  gridMap: { version: 1, revision: 0, cells: {} },
  wars: [], turn: structuredClone(DEFAULT_TURN_STATE),
  ships: { ship: structuredClone(shipState) },
  navalBattleRequests: [], activeNavalBattle: null, navalBattleHistory: [], navalRevealUntilTurn: {}
};

function shipItem(state: ShipState = shipState): SceneItemRecord {
  return {
    id: "ship", type: "IMAGE", name: "Севастополь", position: { x: 50, y: 50 },
    metadata: { [METADATA_KEYS.ship]: structuredClone(state) }
  };
}

class MemoryPort implements ShipRouteToolServicePort {
  role: "GM" | "PLAYER" = "PLAYER";
  playerId = "leader";
  connectionId = "connection-leader";
  scene = structuredClone(scene);
  items: SceneItemRecord[] = [shipItem()];
  localItems: SceneItemRecord[] = [];
  restored: string[] = [];
  nextId = 0;

  async getPlayerIdentity() { return { id: this.playerId, role: this.role, connectionId: this.connectionId }; }
  async getSceneMetadata() { return { [METADATA_KEYS.scene]: structuredClone(this.scene) }; }
  async patchSceneMetadata() { return; }
  async getSceneItems() { return structuredClone(this.items); }
  async updateSceneItem(id: string, update: ItemUpdate) {
    const item = this.items.find((candidate) => candidate.id === id);
    if (item) Object.assign(item, structuredClone(update));
  }
  async getLocalItems() { return structuredClone(this.localItems); }
  async addLocalItem(item: SceneItemRecord) { this.localItems.push(structuredClone(item)); }
  async addLocalItems(items: readonly SceneItemRecord[]) { this.localItems.push(...structuredClone(items)); }
  async updateLocalItems(items: readonly SceneItemRecord[]) {
    for (const update of items) {
      const index = this.localItems.findIndex((item) => item.id === update.id);
      if (index >= 0) this.localItems[index] = structuredClone(update);
    }
  }
  async deleteLocalItems(ids: readonly string[]) { this.localItems = this.localItems.filter((item) => !ids.includes(item.id)); }
  createId() { this.nextId += 1; return `ship-preview-${this.nextId}`; }
  async show() { return; }
  async activateTool(toolId: string) { this.restored.push(toolId); }
  async getGridDpi() { return 100; }
  async snapGridCenter(position: { x: number; y: number }) {
    return { x: Math.floor(position.x / 100) * 100 + 50, y: Math.floor(position.y / 100) * 100 + 50 };
  }
}

function accepted(command: ArmyCommand): CommandAck {
  return {
    protocolVersion: COMMAND_PROTOCOL_VERSION,
    requestId: command.requestId,
    status: "ACCEPTED",
    coordinatorConnectionId: "coordinator",
    recipientConnectionId: command.senderConnectionId
  };
}

describe("ShipRouteToolService", () => {
  it("loads READY ship context for its side leader", async () => {
    const port = new MemoryPort();
    const service = new ShipRouteToolService(port, { send: async (command: ArmyCommand) => accepted(command) });
    await expect(service.loadSession("ship")).resolves.toMatchObject({
      shipId: "ship",
      start: { x: 50, y: 50 },
      startCell: { x: 0, y: 0 },
      gridDpi: 100,
      movementPoints: 4,
      maxMovementPoints: 4
    });
  });

  it("rejects an ordinary faction member", async () => {
    const port = new MemoryPort();
    port.playerId = "member";
    const service = new ShipRouteToolService(port, { send: vi.fn() });
    await expect(service.loadSession("ship"))
      .rejects.toEqual(expect.objectContaining({ code: "NOT_SIDE_LEADER" }));
  });

  it("rejects battle ships and ships with an already committed route", async () => {
    const battlePort = new MemoryPort();
    battlePort.items = [shipItem({ ...shipState, status: "IN_NAVAL_BATTLE", battleId: "battle" })];
    battlePort.scene.ships = { ship: { ...shipState, status: "IN_NAVAL_BATTLE", battleId: "battle" } };
    await expect(new ShipRouteToolService(battlePort, { send: vi.fn() }).loadSession("ship"))
      .rejects.toEqual(expect.objectContaining({ code: "SHIP_NOT_READY" }));

    const plannedPort = new MemoryPort();
    plannedPort.items = [shipItem({ ...shipState, plannedRoute: [{ x: 1, y: 0 }] })];
    plannedPort.scene.ships = { ship: { ...shipState, plannedRoute: [{ x: 1, y: 0 }] } };
    await expect(new ShipRouteToolService(plannedPort, { send: vi.fn() }).loadSession("ship"))
      .rejects.toEqual(expect.objectContaining({ code: "SHIP_ROUTE_ALREADY_PLANNED" }));
  });

  it("sends SET_SHIP_ROUTE with current scene revision", async () => {
    const port = new MemoryPort();
    const send = vi.fn(async (command: ArmyCommand) => accepted(command));
    const service = new ShipRouteToolService(port, { send });
    await service.commitRoute("ship", { x: 0, y: 0 }, [{ x: 1, y: 0 }, { x: 2, y: 0 }]);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      type: "SET_SHIP_ROUTE",
      shipId: "ship",
      startCell: { x: 0, y: 0 },
      cells: [{ x: 1, y: 0 }, { x: 2, y: 0 }],
      expectedRevision: 7
    }));
  });

  it("renders and clears only ship route previews", async () => {
    const port = new MemoryPort();
    port.localItems.push({ id: "keep", type: "LABEL", position: { x: 0, y: 0 }, metadata: { other: true } });
    const service = new ShipRouteToolService(port, { send: vi.fn() });
    await service.renderPreview({
      shipId: "ship", start: { x: 50, y: 50 }, startCell: { x: 0, y: 0 },
      points: [{ x: 150, y: 50 }], cells: [{ x: 1, y: 0 }],
      spentMovementPoints: 1, remainingMovementPoints: 3, maxMovementPoints: 4,
      preview: {
        point: { x: 250, y: 50 }, cell: { x: 2, y: 0 }, valid: true,
        color: "#4f687a", label: "Шаг: 1 ОП", spentMovementPoints: 2, remainingMovementPoints: 2
      }
    });
    expect(port.localItems.filter((item) => item.type === "LABEL").map((item) => item.text))
      .toEqual(expect.arrayContaining(["1 ОП", "Шаг: 1 ОП"]));
    await service.clearPreview();
    expect(port.localItems.map((item) => item.id)).toEqual(["keep"]);
  });
});
