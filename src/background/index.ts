import OBR from "@owlbear-rodeo/sdk";
import { startBackgroundApplication } from "./application";

OBR.onReady(() => {
  void startBackgroundApplication().then((application) => {
    window.addEventListener("beforeunload", () => void application.stop(), { once: true });
  }).catch((error: unknown) => {
    console.error("Letopis Armies background startup failed", error);
    void OBR.notification.show(
      "Не удалось запустить фоновый процесс армий. Перезагрузите расширение.",
      "ERROR"
    ).catch(() => undefined);
  });
});
