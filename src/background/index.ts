import OBR from "@owlbear-rodeo/sdk";
import { startBackgroundApplication } from "./application";

OBR.onReady(() => {
  void startBackgroundApplication().then((application) => {
    window.addEventListener("beforeunload", () => application.stop(), { once: true });
  });
});
