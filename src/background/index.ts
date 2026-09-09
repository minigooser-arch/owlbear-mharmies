import OBR from "@owlbear-rodeo/sdk";
import { registerNavalInterceptionContextMenu } from "../owlbear/navalInterceptionContextMenu";
import { registerRouteContextMenu } from "../owlbear/routeContextMenu";
import type { SceneItemRecord } from "../shared/types";
import { startBackgroundApplication } from "./application";
import { RouteContextMenuService } from "./routeContextMenuService";

OBR.onReady(() => {
  void startBackgroundApplication().then(async (application) => {
    try {
      const contextMenuPort = {
        create: (entry: Parameters<typeof OBR.contextMenu.create>[0]) => OBR.contextMenu.create(entry),
        remove: (id: string) => OBR.contextMenu.remove(id)
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
      window.addEventListener("beforeunload", () => {
        void Promise.allSettled([
          removeInterceptionContextMenu(),
          removeRouteContextMenu()
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
