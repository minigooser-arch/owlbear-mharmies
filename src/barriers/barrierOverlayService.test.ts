import { expect, it } from "vitest";
import type { SceneItemRecord } from "../shared/types";
import { BarrierOverlayService, type BarrierOverlayPort } from "./barrierOverlayService";

class MemoryBarrierPort implements BarrierOverlayPort {
  items: SceneItemRecord[] = [];
  next = 0;
  async getItems() { return structuredClone(this.items); }
  async addItems(items: SceneItemRecord[]) { this.items.push(...structuredClone(items)); }
  async deleteItems(ids: readonly string[]) { this.items = this.items.filter((item) => !ids.includes(item.id)); }
  createId() { this.next += 1; return `barrier-${this.next}`; }
}

it("shows players only barriers marked for everyone and shows all to the GM", async () => {
  const sources = [
    { id: "secret", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], color: "#f00", visibility: "GM_ONLY" as const },
    { id: "public", points: [{ x: 2, y: 0 }, { x: 2, y: 2 }], color: "#0f0", visibility: "EVERYONE" as const }
  ];
  const playerPort = new MemoryBarrierPort();
  await new BarrierOverlayService(playerPort).reconcile(sources, false);
  expect(JSON.stringify(playerPort.items)).toContain('"barrierId":"public"');
  expect(JSON.stringify(playerPort.items)).not.toContain('"barrierId":"secret"');
  const gmPort = new MemoryBarrierPort();
  await new BarrierOverlayService(gmPort).reconcile(sources, true);
  expect(gmPort.items).toHaveLength(2);
});
