import { expect, it } from "vitest";
import type { ArmyStatus, SceneItemRecord } from "../shared/types";
import {
  RouteOverlayService,
  type RouteOverlayPort,
  type RouteOverlayViewer
} from "./routeOverlayService";

class MemoryOverlayPort implements RouteOverlayPort {
  items: SceneItemRecord[] = [];
  next = 0;
  async getItems() { return structuredClone(this.items); }
  async addItems(items: SceneItemRecord[]) { this.items.push(...structuredClone(items)); }
  async deleteItems(ids: readonly string[]) { this.items = this.items.filter((item) => !ids.includes(item.id)); }
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
