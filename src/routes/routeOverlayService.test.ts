import { expect, it } from "vitest";
import type { ArmyStatus, SceneItemRecord } from "../shared/types";
import {
  RouteOverlayService,
  type RouteOverlayPort,
  type RouteOverlayViewer
} from "./routeOverlayService";

class MemoryOverlayPort implements RouteOverlayPort {
  items: SceneItemRecord[] = [];
  operations: string[] = [];
  next = 0;
  async getLocalItems() { return structuredClone(this.items); }
  async addLocalItems(items: readonly SceneItemRecord[]) {
    this.operations.push(`add:${items.map((item) => item.id).join(",")}`);
    this.items.push(...structuredClone(items));
  }
  async updateLocalItems(items: readonly SceneItemRecord[]) {
    this.operations.push(`update:${items.map((item) => item.id).join(",")}`);
    for (const update of items) {
      const index = this.items.findIndex((item) => item.id === update.id);
      if (index >= 0) this.items[index] = structuredClone(update);
    }
  }
  async deleteLocalItems(ids: readonly string[]) {
    this.operations.push(`delete:${ids.join(",")}`);
    this.items = this.items.filter((item) => !ids.includes(item.id));
  }
  createId() { this.next += 1; return `overlay-${this.next}`; }
}

function viewer(kind: "GM" | "LEADER" | "MEMBER" | "OTHER"): RouteOverlayViewer {
  return {
    isGM: kind === "GM",
    memberSideIds: kind === "LEADER" || kind === "MEMBER" ? ["red"] : [],
    leaderSideIds: kind === "LEADER" ? ["red"] : []
  };
}

it.each([
  ["GM", "READY", true],
  ["LEADER", "READY", true],
  ["MEMBER", "READY", false],
  ["OTHER", "READY", false],
  ["GM", "MOVING", true],
  ["LEADER", "MOVING", true],
  ["MEMBER", "MOVING", true],
  ["OTHER", "MOVING", false],
  ["MEMBER", "PAUSED", true],
  ["MEMBER", "IN_BATTLE", true]
] as const)("filters %s viewer for %s route", async (viewerKind, status, visible) => {
  const port = new MemoryOverlayPort();
  await new RouteOverlayService(port).reconcile(
    [
      {
        armyId: "a",
        sideId: "red",
        status: status as ArmyStatus,
        color: "#f00",
        start: { x: 0, y: 0 },
        waypoints: [{ x: 2, y: 0 }]
      }
    ],
    viewer(viewerKind)
  );
  expect(port.items.length > 0).toBe(visible);
  expect(port.items.every((item) => item.disableHit === true)).toBe(true);
});

it("renders no overlay for an empty route", async () => {
  const port = new MemoryOverlayPort();
  await new RouteOverlayService(port).reconcile(
    [{
      armyId: "a",
      sideId: "red",
      status: "MOVING",
      color: "#f00",
      start: { x: 0, y: 0 },
      waypoints: []
    }],
    viewer("GM")
  );
  expect(port.items).toEqual([]);
});

it("does not rewrite an identical persistent route", async () => {
  const port = new MemoryOverlayPort();
  const service = new RouteOverlayService(port);
  const routes = [{
    armyId: "a",
    sideId: "red",
    status: "MOVING" as const,
    color: "#f00",
    start: { x: 0, y: 0 },
    waypoints: [{ x: 2, y: 0 }]
  }];
  await service.reconcile(routes, viewer("GM"));
  const ids = port.items.map((item) => item.id);
  port.operations = [];

  await service.reconcile(routes, viewer("GM"));

  expect(port.operations).toEqual([]);
  expect(port.items.map((item) => item.id)).toEqual(ids);
});

it("updates route geometry and colour without changing semantic IDs", async () => {
  const port = new MemoryOverlayPort();
  const service = new RouteOverlayService(port);
  await service.reconcile([{
    armyId: "a",
    sideId: "red",
    status: "MOVING",
    color: "#f00",
    start: { x: 0, y: 0 },
    waypoints: [{ x: 2, y: 0 }]
  }], viewer("GM"));
  const ids = port.items.map((item) => item.id);
  port.operations = [];

  await service.reconcile([{
    armyId: "a",
    sideId: "red",
    status: "MOVING",
    color: "#00f",
    start: { x: 1, y: 1 },
    waypoints: [{ x: 3, y: 1 }]
  }], viewer("GM"));

  expect(port.items.map((item) => item.id)).toEqual(ids);
  expect(port.operations).toEqual([`update:${ids.join(",")}`]);
});
