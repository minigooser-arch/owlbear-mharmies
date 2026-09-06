import { expect, it } from "vitest";
import {
  METADATA_KEYS,
  NAVAL_BATTLE_AREA_DRAFT_CHANNEL
} from "../shared/constants";
import type { SceneItemRecord } from "../shared/types";
import { NavalBattleAreaToolService } from "./navalBattleAreaToolService";

function portHarness() {
  const broadcasts: Array<{ channel: string; data: unknown }> = [];
  let localItems: SceneItemRecord[] = [];
  return {
    port: {
      getPlayerIdentity: async () => ({ id: "gm", role: "GM" as const, connectionId: "gm-c" }),
      getGridDpi: async () => 100,
      show: async () => undefined,
      send: async (channel: string, data: unknown) => { broadcasts.push({ channel, data }); },
      getLocalItems: async () => localItems,
      addLocalItems: async (items: readonly SceneItemRecord[]) => { localItems = [...localItems, ...items]; },
      updateLocalItems: async (items: readonly SceneItemRecord[]) => {
        const byId = new Map(items.map((item) => [item.id, item]));
        localItems = localItems.map((item) => byId.get(item.id) ?? item);
      },
      deleteLocalItems: async (ids: readonly string[]) => {
        const removed = new Set(ids);
        localItems = localItems.filter((item) => !removed.has(item.id));
      },
      createId: () => `local-${localItems.length + 1}`
    },
    broadcasts,
    get localItems() { return localItems; }
  };
}

it("publishes a GM-owned area draft without writing scene state", async () => {
  const harness = portHarness();
  const service = new NavalBattleAreaToolService(harness.port);

  await service.publishDraft("request-1", [{ x: 0, y: 0 }, { x: 1, y: 0 }]);

  expect(harness.broadcasts).toEqual([{
    channel: NAVAL_BATTLE_AREA_DRAFT_CHANNEL,
    data: {
      playerId: "gm",
      requestId: "request-1",
      cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }]
    }
  }]);
});

it("renders and clears only local battle-area preview overlays", async () => {
  const harness = portHarness();
  const service = new NavalBattleAreaToolService(harness.port);

  await service.renderPreview([{ x: 2, y: 3 }]);
  expect(harness.localItems).toHaveLength(1);
  expect(harness.localItems[0]?.metadata[METADATA_KEYS.navalBattleAreaPreview]).toEqual({ cellKey: "2,3" });

  await service.clearPreview();
  expect(harness.localItems).toEqual([]);
});
