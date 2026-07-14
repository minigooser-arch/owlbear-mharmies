import { expect, it } from "vitest";
import type { SceneItemRecord } from "../shared/types";
import { RouteOverlayService, type RouteOverlayPort } from "./routeOverlayService";

class MemoryOverlayPort implements RouteOverlayPort {
  items: SceneItemRecord[] = [];
  next = 0;
  async getItems() { return structuredClone(this.items); }
  async addItems(items: SceneItemRecord[]) { this.items.push(...structuredClone(items)); }
  async deleteItems(ids: readonly string[]) { this.items = this.items.filter((item) => !ids.includes(item.id)); }
  createId() { this.next += 1; return `overlay-${this.next}`; }
}

it("renders only the player's side routes as non-interactive local items", async () => {
  const port = new MemoryOverlayPort();
  await new RouteOverlayService(port).reconcile(
    [
      { armyId: "a", sideId: "A", color: "#f00", start: { x: 0, y: 0 }, waypoints: [{ x: 2, y: 0 }] },
      { armyId: "b", sideId: "B", color: "#00f", start: { x: 5, y: 0 }, waypoints: [{ x: 7, y: 0 }] }
    ],
    { isGM: false, playerSideIds: ["A"] }
  );
  expect(port.items.some((item) => item.metadata["com.letopis.army-control/route-overlay"])).toBe(true);
  expect(port.items.every((item) => item.disableHit === true)).toBe(true);
  expect(JSON.stringify(port.items)).not.toContain('"armyId":"b"');
});
