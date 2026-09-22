import { utf8Size } from "../storage/gridChunkCodec";

export function splitBatches<T>(values: readonly T[], maxBytes = 48 * 1024, maxItems = 64): T[][] {
  const batches: T[][] = [];
  let batch: T[] = [], bytes = 2;
  for (const value of values) {
    const size = utf8Size(value);
    if (size + 2 > maxBytes) throw new Error("SDK_ITEM_TOO_LARGE");
    if (batch.length && (batch.length >= maxItems || bytes + size + 1 > maxBytes)) {
      batches.push(batch); batch = []; bytes = 2;
    }
    bytes += size + (batch.length ? 1 : 0);
    batch.push(value);
  }
  if (batch.length) batches.push(batch);
  return batches;
}

export async function sendBatches<T>(values: readonly T[], send: (batch: T[]) => Promise<void>): Promise<void> {
  for (const batch of splitBatches(values)) await send(batch);
}
