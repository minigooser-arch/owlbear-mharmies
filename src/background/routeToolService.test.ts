import { describe, expect, it, vi } from "vitest";
import type { CommandAck } from "../commands/commandGateway";
import { DEFAULT_SETTINGS, METADATA_KEYS } from "../shared/constants";
import type {
  ArmyCommand,
  ArmyState,
  BarrierState,
  ItemUpdate,
  SceneItemRecord,
  SceneState
} from "../shared/types";
import {
  RouteToolService,
  type RouteToolServicePort
} from "./routeToolService";

const scene: SceneState = {
  version: 2,
  revision: 4,
  settings: { ...DEFAULT_SETTINGS, defaultMaxRouteDistanceCells: 7 },
  sides: [{
    id: "red",
    name: "Красные",
    color: "#f00",
    playerIds: ["leader", "member"],
    leaderPlayerIds: ["leader"]
  }],
  relations: {},
  battleGroups: []
};

const army: ArmyState = {
  version: 1,
  registered: true,
  sideId: "red",
  status: "READY",
  overrides: {},
  route: [],
  currentWaypointIndex: 0,
  segmentProgressCells: 0,
  ignoresMovementBarriers: false,
  ignoresVisionBarriers: false,
  revision: 1
};

const barrier: BarrierState = {
  version: 1,
  revision: 0,
  blocksMovement: true,
  blocksVision: false,
  visibility: "GM_ONLY",
  color: "#000"
};

function image(id: string): SceneItemRecord {
  return {
    id,
    type: "IMAGE",
    name: id,
    position: { x: 2, y: 3 },
    metadata: { [METADATA_KEYS.army]: structuredClone(army) }
  };
}

class MemoryPort implements RouteToolServicePort {
  role: "GM" | "PLAYER" = "PLAYER";
  playerId = "leader";
  connectionId = "connection-leader";
  scene = structuredClone(scene);
  items: SceneItemRecord[] = [
    image("army-a"),
    {
      id: "wall",
      type: "CURVE",
      position: { x: 0, y: 0 },
      points: [{ x: 1, y: -1 }, { x: 1, y: 1 }],
      metadata: { [METADATA_KEYS.barrier]: structuredClone(barrier) }
    }
  ];
  localItems: SceneItemRecord[] = [];
  restored: string[] = [];
  notifications: string[] = [];
  nextId = 0;

  async getPlayerIdentity() {
    return { id: this.playerId, role: this.role, connectionId: this.connectionId };
  }
  async getSceneMetadata() { return { [METADATA_KEYS.scene]: structuredClone(this.scene) }; }
  async patchSceneMetadata() { return; }
  async getSceneItems() { return structuredClone(this.items); }
  async updateSceneItem(id: string, update: ItemUpdate) {
    const item = this.items.find((candidate) => candidate.id === id);
    if (item) Object.assign(item, structuredClone(update));
  }
  async getLocalItems() { return structuredClone(this.localItems); }
  async addLocalItem(item: SceneItemRecord) { this.localItems.push(structuredClone(item)); }
  async deleteLocalItems(ids: readonly string[]) {
    this.localItems = this.localItems.filter((item) => !ids.includes(item.id));
  }
  createId() { this.nextId += 1; return `preview-${this.nextId}`; }
  async show(message: string) { this.notifications.push(message); }
  async activateTool(toolId: string) { this.restored.push(toolId); }
}

function accepted(command: ArmyCommand): CommandAck {
  return {
    requestId: command.requestId,
    status: "ACCEPTED",
    coordinatorConnectionId: "coordinator",
    recipientConnectionId: command.senderConnectionId
  };
}

describe("RouteToolService", () => {
  it("loads a route session for a side leader with movement barriers", async () => {
    const port = new MemoryPort();
    const service = new RouteToolService(port, { send: async (command) => accepted(command) });

    await expect(service.loadSession("army-a")).resolves.toMatchObject({
      armyId: "army-a",
      start: { x: 2, y: 3 },
      maxCells: 7,
      barriers: [{ barrierId: "wall", from: { x: 1, y: -1 }, to: { x: 1, y: 1 } }]
    });
  });

  it("rejects an ordinary member and an army from another side", async () => {
    const port = new MemoryPort();
    port.playerId = "member";
    const service = new RouteToolService(port, { send: vi.fn() });

    await expect(service.loadSession("army-a")).rejects.toEqual(
      expect.objectContaining({ code: "NOT_SIDE_LEADER" })
    );
  });

  it("re-authorizes and sends SET_ROUTE with the current scene revision", async () => {
    const port = new MemoryPort();
    const send = vi.fn(async (command: ArmyCommand) => accepted(command));
    const service = new RouteToolService(port, { send });

    await service.commitRoute("army-a", [{ x: 4, y: 3 }]);

    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      type: "SET_ROUTE",
      armyId: "army-a",
      route: [{ x: 4, y: 3 }],
      senderPlayerId: "leader",
      senderConnectionId: "connection-leader",
      expectedRevision: 4
    }));
  });

  it("renders and clears only local route previews", async () => {
    const port = new MemoryPort();
    port.localItems.push({
      id: "keep",
      type: "LABEL",
      position: { x: 0, y: 0 },
      metadata: { other: true }
    });
    const service = new RouteToolService(port, { send: vi.fn() });

    await service.renderPreview({
      armyId: "army-a",
      start: { x: 0, y: 0 },
      points: [{ x: 1, y: 0 }],
      preview: { point: { x: 2, y: 0 }, valid: true, color: "#2e7d32", label: "Осталось: 5" }
    });

    expect(port.localItems.some((item) => item.id === "keep")).toBe(true);
    expect(port.localItems.filter((item) => item.metadata[METADATA_KEYS.routePreview]).length).toBeGreaterThan(0);
    expect(port.localItems
      .filter((item) => item.metadata[METADATA_KEYS.routePreview])
      .every((item) => Object.keys(item.metadata).length === 1)).toBe(true);

    await service.clearPreview();
    expect(port.localItems.map((item) => item.id)).toEqual(["keep"]);
  });
});
