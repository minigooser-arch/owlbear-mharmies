import { expect, it } from "vitest";
import type { BarrierRecord } from "../storage/metadataRepository";
import { extractBarrierSegments } from "./application";

it("extracts only requested blocking polylines into barrier segments", () => {
  const records: BarrierRecord[] = [
    {
      item: {
        id: "wall",
        type: "CURVE",
        position: { x: 0, y: 0 },
        metadata: {},
        points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]
      },
      state: {
        version: 1,
        revision: 1,
        blocksMovement: true,
        blocksVision: false,
        visibility: "GM_ONLY",
        color: "#f00"
      }
    }
  ];
  expect(extractBarrierSegments(records, "movement")).toHaveLength(2);
  expect(extractBarrierSegments(records, "vision")).toEqual([]);
});
