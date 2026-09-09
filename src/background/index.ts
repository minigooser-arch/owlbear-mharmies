import OBR from "@owlbear-rodeo/sdk";
import { registerNavalInterceptionContextMenu } from "../owlbear/navalInterceptionContextMenu";
import { registerRouteContextMenu } from "../owlbear/routeContextMenu";
import { startBackgroundApplication } from "./application";

OBR.onReady(() => {
  void startBackgroundApplication().then(async (application) => {
    try {
      const contextMenuPort = {
        create: (entry: Parameters<typeof OBR.contextMenu.create>[0]) => OBR.contextMenu.create(entry),
        remove: (id: string) => OBR.contextMenu.remove(id)
      };
      const iconUrl = `${import.meta.env.BASE_URL}icon-1.2.png`;
      const removeInterceptionContextMenu = await registerNavalInterceptionContextMenu(
        contextMenuPort,
        application,
        iconUrl
      );
      const removeRouteContextMenu = await registerRouteContextMenu(
        contextMenuPort,
        application,
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
