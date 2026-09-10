import { expect, it } from "vitest";
import { createRegisteredShip } from "../naval/ships/shipLifecycle";
import { METADATA_KEYS } from "../shared/constants";
import type { SceneItemRecord } from "../shared/types";
import { localCloneMetadataForSource } from "./localCloneReconciler";

it("treats a planned final facing as an existing ship route order", () => {
  const ship = {
    ...createRegisteredShip("red", "BATTLESHIP", "NORTH"),
    plannedFacing: "EAST" as const
  };
  const source: SceneItemRecord = {
    id: "ship",
    type: "IMAGE",
    position: { x: 50, y: 50 },
    metadata: { [METADATA_KEYS.ship]: ship }
  };

  expect(localCloneMetadataForSource(source)).toEqual({
    sourceItemId: "ship",
    hasRoute: true
  });
});
