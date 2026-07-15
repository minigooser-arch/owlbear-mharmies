import { describe, expect, it, vi } from "vitest";
import type { CommandAck } from "../commands/commandGateway";
import { COMMAND_PROTOCOL_VERSION } from "../shared/types";
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
  version: 3,
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
  localOperations: string[] = [];
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
  async addLocalItem(item: SceneItemRecord) {
    this.localOperations.push(`add-one:${item.id}`);
    this.localItems.push(structuredClone(item));
  }
  async addLocalItems(items: readonly SceneItemRecord[]) {
    this.localOperations.push(`add:${items.map((item) => item.id).join(",")}`);
    this.localItems.push(...structuredClone(items));
  }
  async updateLocalItems(items: readonly SceneItemRecord[]) {
    this.localOperations.push(`update:${items.map((item) => item.id).join(",")}`);
    for (const update of items) {
      const index = this.localItems.findIndex((item) => item.id === update.id);
      if (index >= 0) this.localItems[index] = structuredClone(update);
    }
  }
  async deleteLocalItems(ids: readonly string[]) {
    this.localOperations.push(`delete:${ids.join(",")}`);
    this.localItems = this.localItems.filter((item) => !ids.includes(item.id));
  }
  createId() { this.nextId += 1; return `preview-${this.nextId}`; }
  async show(message: string) { this.notifications.push(message); }
  async activateTool(toolId: string) { this.restored.push(toolId); }
  async getGridDistance(from: { x: number; y: number }, to: { x: number; y: number }) {
    return Math.hypot(to.x - from.x, to.y - from.y);
  }
  async snapGridCenter(position: { x: number; y: number }) { return { ...position }; }
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

  it("starts a legacy army session at its snapped cell centre without moving the item", async () => {
    const port = new MemoryPort();
    port.snapGridCenter = vi.fn(async () => ({ x: 50, y: 50 }));
    const service = new RouteToolService(port, { send: async (command) => accepted(command) });

    await expect(service.loadSession("army-a")).resolves.toMatchObject({
      start: { x: 50, y: 50 }
    });
    expect(port.items.find((item) => item.id === "army-a")?.position).toEqual({ x: 2, y: 3 });
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

  it("rejects an unsnapped route before broadcasting it", async () => {
    const port = new MemoryPort();
    port.snapGridCenter = vi.fn(async (position) => ({
      x: Math.round((position.x - 50) / 100) * 100 + 50,
      y: Math.round((position.y - 50) / 100) * 100 + 50
    }));
    const send = vi.fn(async (command: ArmyCommand) => accepted(command));
    const service = new RouteToolService(port, { send });

    await expect(service.commitRoute("army-a", [{ x: 149, y: 50 }])).rejects.toEqual(
      expect.objectContaining({ code: "INVALID_COMMAND" })
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("rechecks the current route limit when committing a previously loaded session", async () => {
    const port = new MemoryPort();
    const send = vi.fn(async (command: ArmyCommand) => accepted(command));
    const service = new RouteToolService(port, { send });
    await service.loadSession("army-a");
    port.scene.settings.defaultMaxRouteDistanceCells = 1;

    await expect(service.commitRoute("army-a", [{ x: 4, y: 3 }])).rejects.toEqual(
      expect.objectContaining({ code: "ROUTE_LIMIT" })
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("rechecks current movement barriers when committing a previously loaded session", async () => {
    const port = new MemoryPort();
    const wall = port.items.find((item) => item.id === "wall");
    if (!wall) throw new Error("Missing test barrier item");
    const wallState = wall.metadata[METADATA_KEYS.barrier] as BarrierState | undefined;
    if (!wallState) throw new Error("Missing test barrier");
    wallState.blocksMovement = false;
    const send = vi.fn(async (command: ArmyCommand) => accepted(command));
    const service = new RouteToolService(port, { send });
    await service.loadSession("army-a");
    wallState.blocksMovement = true;
    wall.points = [{ x: 1, y: -10 }, { x: 1, y: 10 }];

    await expect(service.commitRoute("army-a", [{ x: 0, y: 3 }])).rejects.toEqual(
      expect.objectContaining({ code: "BARRIER" })
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects commit if the army is no longer READY", async () => {
    const port = new MemoryPort();
    const send = vi.fn(async (command: ArmyCommand) => accepted(command));
    const service = new RouteToolService(port, { send });
    await service.loadSession("army-a");
    const item = port.items.find((candidate) => candidate.id === "army-a");
    const state = item?.metadata[METADATA_KEYS.army] as ArmyState | undefined;
    if (!state) throw new Error("Missing test army");
    state.status = "MOVING";

    await expect(service.commitRoute("army-a", [{ x: 4, y: 3 }])).rejects.toEqual(
      expect.objectContaining({ code: "ARMY_NOT_READY" })
    );
    expect(send).not.toHaveBeenCalled();
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

  it("reconciles preview motion in one batch while preserving semantic IDs", async () => {
    const port = new MemoryPort();
    const service = new RouteToolService(port, { send: vi.fn() });
    const first = {
      armyId: "army-a",
      start: { x: 0, y: 0 },
      points: [{ x: 1, y: 0 }],
      preview: {
        point: { x: 2, y: 0 },
        valid: true,
        color: "#2e7d32",
        label: "Осталось: 5"
      }
    };

    await service.renderPreview(first);
    expect(port.localOperations).toEqual(["add:preview-1,preview-2,preview-3"]);
    const semanticIds = new Map(port.localItems.map((item) => {
      const metadata = item.metadata[METADATA_KEYS.routePreview] as Record<string, unknown>;
      return [`${metadata.kind}/${metadata.index ?? ""}`, item.id];
    }));
    port.localOperations = [];

    await service.renderPreview({
      ...first,
      preview: { ...first.preview, point: { x: 3, y: 0 }, label: "Осталось: 4" }
    });

    expect(port.localOperations).toEqual([
      `update:${semanticIds.get("LINE/")},${semanticIds.get("DISTANCE/")}`
    ]);
    expect(new Map(port.localItems.map((item) => {
      const metadata = item.metadata[METADATA_KEYS.routePreview] as Record<string, unknown>;
      return [`${metadata.kind}/${metadata.index ?? ""}`, item.id];
    }))).toEqual(semanticIds);
  });

  it("adds and removes only waypoint overlays affected by a preview edit", async () => {
    const port = new MemoryPort();
    const service = new RouteToolService(port, { send: vi.fn() });
    await service.renderPreview({
      armyId: "army-a",
      start: { x: 0, y: 0 },
      points: [{ x: 1, y: 0 }],
      preview: { point: { x: 2, y: 0 }, valid: true, color: "#2e7d32", label: "5" }
    });
    const firstIds = new Map(port.localItems.map((item) => {
      const metadata = item.metadata[METADATA_KEYS.routePreview] as Record<string, unknown>;
      return [`${metadata.kind}/${metadata.index ?? ""}`, item.id];
    }));
    port.localOperations = [];

    await service.renderPreview({
      armyId: "army-a",
      start: { x: 0, y: 0 },
      points: [{ x: 1, y: 0 }, { x: 2, y: 0 }],
      preview: { point: { x: 3, y: 0 }, valid: true, color: "#2e7d32", label: "4" }
    });

    expect(port.localOperations[0]).toBe("add:preview-4");
    expect(port.localItems.find((item) => item.id === firstIds.get("WAYPOINT/0"))).toBeDefined();
    const addedWaypoint = port.localItems.find((item) => {
      const metadata = item.metadata[METADATA_KEYS.routePreview] as Record<string, unknown>;
      return metadata.kind === "WAYPOINT" && metadata.index === 1;
    });
    expect(addedWaypoint?.id).toBe("preview-4");
    port.localOperations = [];

    await service.renderPreview({
      armyId: "army-a",
      start: { x: 0, y: 0 },
      points: [{ x: 1, y: 0 }],
      preview: { point: { x: 2, y: 0 }, valid: true, color: "#2e7d32", label: "5" }
    });

    expect(port.localOperations.at(-1)).toBe("delete:preview-4");
    expect(port.localItems.find((item) => item.id === firstIds.get("WAYPOINT/0"))).toBeDefined();
  });
});
