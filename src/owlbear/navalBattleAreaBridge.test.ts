import { expect, it } from "vitest";
import type { GridCellCoord } from "../shared/types";
import {
  buildRequestBackedNavalBattleStart,
  parseNavalBattleAreaDraft
} from "./navalBattleAreaBridge";

it("accepts only the current GM's well-formed local area draft", () => {
  expect(parseNavalBattleAreaDraft({
    playerId: "gm",
    requestId: "request-1",
    cells: [{ x: 1, y: 2 }, { x: 3, y: 4 }]
  }, "gm")).toEqual({
    requestId: "request-1",
    cells: [{ x: 1, y: 2 }, { x: 3, y: 4 }]
  });

  expect(parseNavalBattleAreaDraft({
    playerId: "other-gm",
    requestId: "request-1",
    cells: [{ x: 1, y: 2 }]
  }, "gm")).toBeUndefined();
  expect(parseNavalBattleAreaDraft({ playerId: "gm", requestId: "", cells: [] }, "gm")).toBeUndefined();
});

it("builds request-backed start with mandatory initiator and target participants", () => {
  const areaCells: GridCellCoord[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
  expect(buildRequestBackedNavalBattleStart({
    battleId: "battle-1",
    requestId: "request-1",
    initiatingShipId: "red-ship",
    targetShipId: "blue-ship",
    participantShipIds: ["escort", "red-ship", "escort"],
    areaCells
  })).toEqual({
    type: "START_NAVAL_BATTLE",
    battleId: "battle-1",
    navalRequestId: "request-1",
    initiatingShipId: "red-ship",
    participantShipIds: ["red-ship", "blue-ship", "escort"],
    areaCells
  });
});
