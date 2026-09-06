import { expect, it } from "vitest";
import type { SceneItemRecord } from "../shared/types";
import { buildSelectedShipRegistrationPayload } from "./registration";

it("turns the selected image into a canonical REGISTER_SHIP command", () => {
  const items: SceneItemRecord[] = [{
    id: "ship-token",
    type: "IMAGE",
    name: "Аврора",
    position: { x: 0, y: 0 },
    metadata: {}
  }];

  expect(buildSelectedShipRegistrationPayload({
    selection: ["ship-token"],
    items,
    sideId: "red",
    classId: "CRUISER",
    facing: "EAST"
  })).toEqual({
    type: "REGISTER_SHIP",
    itemId: "ship-token",
    sideId: "red",
    classId: "CRUISER",
    facing: "EAST"
  });
});
