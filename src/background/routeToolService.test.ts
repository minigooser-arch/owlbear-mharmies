import { describe, expect, it, vi } from "vitest";
import type { CommandAck } from "../commands/commandGateway";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE, METADATA_KEYS } from "../shared/constants";
import { COMMAND_PROTOCOL_VERSION } from "../shared/types";
import type {
  ArmyCommand, ArmyState, BarrierState, ItemUpdate, SceneItemRecord, SceneState
} from "../shared/types";
import { RouteToolService, type RouteToolServicePort } from "./routeToolService";

const scene: SceneState = {
  version: 5,
  revision: 4,
  settings: { ...DEFAULT_SETTINGS },
  sides: [{ id: "red", name: "Красные", color: "#f00", playerIds: ["leader", "member"], leaderPlayerIds: ["leader"], stateId: null }],
  states: [],
  relations: {}, battleGroups: [],
  terrain: structuredClone(DEFAULT_TERRAIN),
  gridMap: {
    version: 1, revision: 0,
    cells: { "1,0": { terrainId: "road", impassable: false, factionTerritoryIds: ["red"], recognizedStateId: null, deFactoStateId: null } }
  },
  wars: [],
  turn: structuredClone(DEFAULT_TURN_STATE)
};

const army: ArmyState = {
  version: 3,
  registered: true,
  sideId: "red",
  status: "READY",
  overrides: {},
  route: [],
  plannedRoute: { startCell: { x: 0, y: 0 }, executeOnTurn: 0, cells: [], totalCostUnits: 0, validatedRevision: 4, requiresReplan: false },
  movement: { maxUnits: 10, remainingUnits: 10, enteredRouteCellCount: 0 },
  health: { hp: 50, maxHp: 50 }, supply: { supplied: true, checkedOnTurn: 1 },
  disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
  currentWaypointIndex: 0,
  segmentProgressCells: 0,
  ignoresMovementBarriers: false,
  ignoresVisionBarriers: false,
  revision: 1
};

const barrier: BarrierState = {
  version: 1, revision: 0, blocksMovement: true, blocksVision: false, visibility: "GM_ONLY", color: "#000"
};

function armyItem(): SceneItemRecord {
  return { id: "army-a", type: "IMAGE", name: "army-a", position: { x: 50, y: 50 }, metadata: { [METADATA_KEYS.army]: structuredClone(army) } };
}

class MemoryPort implements RouteToolServicePort {
  role: "GM" | "PLAYER" = "PLAYER";
  playerId = "leader";
  connectionId = "connection-leader";
  scene = structuredClone(scene);
  items: SceneItemRecord[] = [
    armyItem(),
    { id: "wall", type: "CURVE", position: { x: 0, y: 0 }, points: [{ x: 300, y: 0 }, { x: 300, y: 100 }], metadata: { [METADATA_KEYS.barrier]: structuredClone(barrier) } }
  ];
  localItems: SceneItemRecord[] = [];
  restored: string[] = [];
  localOperations: string[] = [];
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
  async addLocalItem(item: SceneItemRecord) { this.localOperations.push(`add-one:${item.id}`); this.localItems.push(structuredClone(item)); }
  async addLocalItems(items: readonly SceneItemRecord[]) { this.localOperations.push(`add:${items.map((item) => item.id).join(",")}`); this.localItems.push(...structuredClone(items)); }
  async updateLocalItems(items: readonly SceneItemRecord[]) {
    this.localOperations.push(`update:${items.map((item) => item.id).join(",")}`);
    for (const update of items) {
      const index = this.localItems.findIndex((item) => item.id === update.id);
      if (index >= 0) this.localItems[index] = structuredClone(update);
    }
  }
  async deleteLocalItems(ids: readonly string[]) { this.localOperations.push(`delete:${ids.join(",")}`); this.localItems = this.localItems.filter((item) => !ids.includes(item.id)); }
  createId() { this.nextId += 1; return `preview-${this.nextId}`; }
  async show() { return; }
  async activateTool(toolId: string) { this.restored.push(toolId); }
  async getGridDistance(from: { x: number; y: number }, to: { x: number; y: number }) { return Math.hypot(to.x - from.x, to.y - from.y) / 100; }
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

describe("RouteToolService", () => {
  it("loads strategic movement context for the side leader", async () => {
    const port = new MemoryPort();
    const service = new RouteToolService(port, { send: async (command) => accepted(command) });
    await expect(service.loadSession("army-a")).resolves.toMatchObject({
      armyId: "army-a",
      start: { x: 50, y: 50 },
      startCell: { x: 0, y: 0 },
      gridDpi: 100,
      sideId: "red",
      movementUnits: 10,
      maxUnits: 10,
      barriers: [{ barrierId: "wall" }]
    });
  });

  it("rejects an ordinary member", async () => {
    const port = new MemoryPort();
    port.playerId = "member";
    const service = new RouteToolService(port, { send: vi.fn() });
    await expect(service.loadSession("army-a")).rejects.toEqual(expect.objectContaining({ code: "NOT_SIDE_LEADER" }));
  });

  it("sends SET_ROUTE with current revision and strategic cells", async () => {
    const port = new MemoryPort();
    const send = vi.fn(async (command: ArmyCommand) => accepted(command));
    const service = new RouteToolService(port, { send });
    await service.commitRoute("army-a", [{ x: 150, y: 50 }], { x: 0, y: 0 }, [{ x: 1, y: 0 }]);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      type: "SET_ROUTE", armyId: "army-a", route: [{ x: 150, y: 50 }],
      startCell: { x: 0, y: 0 }, cells: [{ x: 1, y: 0 }], expectedRevision: 4
    }));
  });

  it("rejects unsnapped scene coordinates before broadcasting", async () => {
    const port = new MemoryPort();
    const send = vi.fn(async (command: ArmyCommand) => accepted(command));
    const service = new RouteToolService(port, { send });
    await expect(service.commitRoute("army-a", [{ x: 149, y: 50 }], { x: 0, y: 0 }, [{ x: 1, y: 0 }]))
      .rejects.toEqual(expect.objectContaining({ code: "INVALID_COMMAND" }));
    expect(send).not.toHaveBeenCalled();
  });

  it("re-authorizes READY state at commit time", async () => {
    const port = new MemoryPort();
    const send = vi.fn(async (command: ArmyCommand) => accepted(command));
    const service = new RouteToolService(port, { send });
    await service.loadSession("army-a");
    const state = port.items[0]?.metadata[METADATA_KEYS.army] as ArmyState;
    state.status = "MOVING";
    await expect(service.commitRoute("army-a", [{ x: 150, y: 50 }], { x: 0, y: 0 }, [{ x: 1, y: 0 }]))
      .rejects.toEqual(expect.objectContaining({ code: "ARMY_NOT_READY" }));
    expect(send).not.toHaveBeenCalled();
  });

  it("renders movement cost labels and clears only route previews", async () => {
    const port = new MemoryPort();
    port.localItems.push({ id: "keep", type: "LABEL", position: { x: 0, y: 0 }, metadata: { other: true } });
    const service = new RouteToolService(port, { send: vi.fn() });
    await service.renderPreview({
      armyId: "army-a", start: { x: 50, y: 50 }, startCell: { x: 0, y: 0 },
      points: [{ x: 150, y: 50 }], cells: [{ x: 1, y: 0 }], stepCostUnits: [1],
      totalCostUnits: 1, remainingUnits: 9, maxUnits: 10,
      preview: { point: { x: 250, y: 50 }, cell: { x: 2, y: 0 }, valid: false, color: "#d32f2f", label: "Непроходимая клетка", totalCostUnits: 1, remainingUnits: 9, reason: "IMPASSABLE" }
    });
    const labels = port.localItems.filter((item) => item.type === "LABEL").map((item) => item.text);
    expect(labels).toContain("1 · 0,5 ОП");
    expect(labels).toContain("Непроходимая клетка");
    await service.clearPreview();
    expect(port.localItems.map((item) => item.id)).toEqual(["keep"]);
  });
});
