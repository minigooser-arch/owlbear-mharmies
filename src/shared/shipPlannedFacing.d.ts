import type { ShipFacing } from "./types";

declare module "./types" {
  interface ShipState {
    /** Optional terminal strategic facing applied when the movement phase resolves. */
    plannedFacing?: ShipFacing | null;
  }
}

export {};
