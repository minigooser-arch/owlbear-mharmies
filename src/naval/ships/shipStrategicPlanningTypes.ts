import type { ShipFacing } from "../../shared/types";

declare module "../../shared/types" {
  interface ShipState {
    /** Optional terminal facing executed at the end of the strategic movement phase. */
    plannedFacing?: ShipFacing | null;
  }

  interface CommandEnvelope {
    /** Used only by SET_SHIP_ROUTE to request a terminal strategic turn. */
    finalFacing?: ShipFacing;
  }
}

export {};
