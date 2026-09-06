import OBR from "@owlbear-rodeo/sdk";
import { registerNavalInterceptionContextMenu } from "../owlbear/navalInterceptionContextMenu";
import { startBackgroundApplication } from "./application";

OBR.onReady(() => {
  void startBackgroundApplication().then(async (application) => {
    try {
      const removeInterceptionContextMenu = await registerNavalInterceptionContextMenu(
        {
          create: (entry) => OBR.contextMenu.create(entry),
          remove: (id) => OBR.contextMenu.remove(id)
        },
        application,
        `${import.meta.env.BASE_URL}icon-1.2.png`
      );
      window.addEventListener("beforeunload", () => {
        void removeInterceptionContextMenu()
          .catch(() => undefined)
          .finally(() => application.stop());
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
