import { expect, it } from "vitest";
import { splitBatches } from "./boundedBatches";
import { utf8Size } from "../storage/gridChunkCodec";

it("batches Unicode payloads by bytes and item count preserving order", () => {
  const input = Array.from({ length: 200 }, (_, i) => ({ id: String(i), text: "я".repeat(500) }));
  const batches = splitBatches(input);
  expect(batches.length).toBeGreaterThan(4);
  expect(batches.flat()).toEqual(input);
  for (const batch of batches) { expect(utf8Size(batch)).toBeLessThanOrEqual(48 * 1024); expect(batch.length).toBeLessThanOrEqual(64); }
  expect(splitBatches([])).toEqual([]);
});
it("rejects oversized individual records before batching any writes", () => {
  expect(() => splitBatches(["small", "x".repeat(50 * 1024)])).toThrow("SDK_ITEM_TOO_LARGE");
});
