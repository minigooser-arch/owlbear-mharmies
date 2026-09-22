import { expect, it, vi } from "vitest";
import { createGridErrorReporter } from "./gridErrorReporter";
import { GridStorageError } from "../storage/gridChunkCodec";
import { notificationMessage } from "../owlbear/notifications";

it("deduplicates grid failures across background loops and resets for another scene", async () => {
  const show = vi.fn(async () => undefined);
  const log = vi.fn();
  const reporter = createGridErrorReporter({ show }, log);
  reporter.report(new GridStorageError("GRID_CHUNK_MISSING"), "visibility");
  reporter.report(new GridStorageError("GRID_CHUNK_MISSING"), "heartbeat");
  await Promise.resolve();
  expect(show).toHaveBeenCalledTimes(1);
  expect(show).toHaveBeenCalledWith(notificationMessage("GRID_CHUNK_MISSING"), "ERROR");
  reporter.reset();
  reporter.report(new GridStorageError("GRID_CHUNK_MISSING"), "visibility");
  expect(show).toHaveBeenCalledTimes(2);
  reporter.report(new Error("network"), "visibility");
  expect(show).toHaveBeenCalledTimes(2);
  expect(log).toHaveBeenCalledTimes(4);
});
