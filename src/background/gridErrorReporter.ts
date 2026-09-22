import { notificationMessage, type NotificationPort } from "../owlbear/notifications";
import { GridStorageError } from "../storage/gridChunkCodec";

/** Share one reporter across background loops; notify once per code per scene. */
export function createGridErrorReporter(
  port: NotificationPort,
  log: (error: unknown, context: string) => void = (error, context) => {
    console.error(`Letopis Armies background failed: ${context}`, error);
  }
) {
  const reported = new Set<string>();
  return {
    reset: () => reported.clear(),
    report: (error: unknown, context: string): void => {
      log(error, context);
      if (!(error instanceof GridStorageError) || reported.has(error.code)) return;
      reported.add(error.code);
      void port.show(notificationMessage(error.code), "ERROR").catch((failure: unknown) => {
        reported.delete(error.code);
        log(failure, "grid-notification");
      });
    }
  };
}
