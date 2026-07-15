import { expect, it } from "vitest";
import type { SceneItemRecord } from "../shared/types";
import { BarrierOverlayService, type BarrierOverlayPort } from "./barrierOverlayService";

class MemoryBarrierPort implements BarrierOverlayPort {
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

it("keeps an identical barrier and updates geometry or colour under the same ID", async () => {
  const port = new MemoryBarrierPort();
  const service = new BarrierOverlayService(port);
  const source = {
    id: "public",
    points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    color: "#f00",
    visibility: "EVERYONE" as const
  };
  await service.reconcile([source], false);
  const id = port.items[0]?.id;
  port.operations = [];

  await service.reconcile([source], false);
  expect(port.operations).toEqual([]);

  await service.reconcile([{
    ...source,
    points: [{ x: 0, y: 0 }, { x: 3, y: 2 }],
    color: "#00f"
  }], false);
  expect(port.operations).toEqual([`update:${id}`]);
  expect(port.items).toMatchObject([{
    id,
    points: [{ x: 0, y: 0 }, { x: 3, y: 2 }],
    strokeColor: "#00f"
  }]);
});

it("deletes only the barrier that becomes hidden", async () => {
  const port = new MemoryBarrierPort();
  port.items.push({
    id: "keep",
    type: "LABEL",
    position: { x: 0, y: 0 },
    metadata: { other: true }
  });
  const service = new BarrierOverlayService(port);
  await service.reconcile([{
    id: "secret",
    points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    color: "#f00",
    visibility: "EVERYONE"
  }], false);
  const barrierId = port.items.find((item) => item.id !== "keep")?.id;
  port.operations = [];

  await service.reconcile([{
    id: "secret",
    points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    color: "#f00",
    visibility: "GM_ONLY"
  }], false);

  expect(port.items.map((item) => item.id)).toEqual(["keep"]);
  expect(port.operations).toEqual([`delete:${barrierId}`]);
});
