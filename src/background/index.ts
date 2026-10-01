import OBR from "@owlbear-rodeo/sdk";
import { registerNavalInterceptionContextMenu } from "../owlbear/navalInterceptionContextMenu";
import { registerEntityContextMenu } from "../owlbear/entityContextMenu";
import { registerRouteContextMenu } from "../owlbear/routeContextMenu";
import type { SceneItemRecord } from "../shared/types";
import { METADATA_KEYS } from "../shared/constants";
import { migrateSceneState } from "../storage/migrations";
import { startBackgroundApplication } from "./application";
import { RouteContextMenuService } from "./routeContextMenuService";


async function syncCityMarkerMetadata(): Promise<void> {
  if (typeof OBR.scene?.isReady !== "function") return;
  if (!(await OBR.scene.isReady())) return;
  const sceneMetadata = await OBR.scene.getMetadata();
  const migrated = migrateSceneState(sceneMetadata[METADATA_KEYS.scene] ?? { version: 5 });
  if (!migrated.ok) return;
  const cityByMarker = new Map(
    (migrated.value.strategicCities ?? [])
      .flatMap((city) => city.markerItemId ? [[city.markerItemId, city.id] as const] : [])
  );
  const items = await OBR.scene.items.getItems();
  const changed = items.filter((item) => {
    const expected = cityByMarker.get(item.id);
    const current = item.metadata[METADATA_KEYS.cityMarker];
    return expected !== current;
  });
  if (changed.length === 0) return;
  await OBR.scene.items.updateItems(changed, (draft) => {
    for (const item of draft) {
      const cityId = cityByMarker.get(item.id);
      if (cityId) item.metadata[METADATA_KEYS.cityMarker] = cityId;
      else item.metadata[METADATA_KEYS.cityMarker] = undefined;
    }
  });
}

OBR.onReady(() => {
  void startBackgroundApplication().then(async (application) => {
    try {
      const contextMenuPort = {
        create: (entry: Parameters<typeof OBR.contextMenu.create>[0]) => OBR.contextMenu.create(entry),
        remove: (id: string) => OBR.contextMenu.remove(id),
        getSceneItem: async (itemId: string) => {
          const items = await OBR.scene.items.getItems([itemId]);
          return items[0];
        }
      };
      const routeContextMenuService = new RouteContextMenuService({
        getLocalItems: async () => await OBR.scene.local.getItems() as unknown as SceneItemRecord[],
        getSceneItems: async () => await OBR.scene.items.getItems() as unknown as SceneItemRecord[],
        getActiveTool: () => OBR.tool.getActiveTool(),
        setToolMetadata: (toolId, metadata) => OBR.tool.setMetadata(toolId, metadata),
        activateTool: (toolId) => OBR.tool.activateTool(toolId),
        activateMode: (toolId, modeId) => OBR.tool.activateMode(toolId, modeId),
        show: async (message, variant) => { await OBR.notification.show(message, variant); }
      });
      const iconUrl = `${import.meta.env.BASE_URL}icon-1.2.png`;
      const removeInterceptionContextMenu = await registerNavalInterceptionContextMenu(
        contextMenuPort,
        application,
        iconUrl
      );
      const removeRouteContextMenu = await registerRouteContextMenu(
        contextMenuPort,
        routeContextMenuService,
        iconUrl
      );
      const removeEntityContextMenu = await registerEntityContextMenu({
        ...contextMenuPort,
        setPlayerMetadata: (update) => OBR.player.setMetadata(update),
        openAction: async () => {
          if (!(await OBR.action.isOpen())) await OBR.action.open();
        },
        show: async (message, variant) => { await OBR.notification.show(message, variant); }
      }, iconUrl);
      await syncCityMarkerMetadata();
      const removeCityMarkerSync = typeof OBR.scene?.onMetadataChange === "function"
        ? OBR.scene.onMetadataChange(() => {
            void syncCityMarkerMetadata().catch((error) => console.error("City marker metadata sync failed", error));
          })
        : () => undefined;
      window.addEventListener("beforeunload", () => {
        void Promise.allSettled([
          removeInterceptionContextMenu(),
          removeRouteContextMenu(),
          removeEntityContextMenu(),
          Promise.resolve(removeCityMarkerSync())
        ]).finally(() => application.stop());
      }, { once: true });
    } catch (error) {
      await application.stop().catch(() => undefined);
      throw error;
    }
  }).catch((error: unknown) => {
    console.error("Letopis Armies background startup failed", error);
    void OBR.notification.show(
      "Не удалось запустить фоновый процесс армий. Перезагрузите расширение.",
      "ERROR"
    ).catch(() => undefined);
  });
});
