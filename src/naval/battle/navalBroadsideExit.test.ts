import { expect, it } from "vitest";
import type { GridCellCoord, NavalBattleState, ShipState } from "../../shared/types";
import { createRegisteredShip } from "../ships/shipLifecycle";
import { validateBroadsideTarget, type BroadsideSectorResolver } from "./navalBroadside";

function ship(sideId: string): ShipState {
  return createRegisteredShip(sideId, "CRUISER", "NORTH");
}

function battle(): NavalBattleState {
  return {
    version: 1,
    id: "battle",
    requestId: null,
    initiatorSideId: "red",
    areaCells: [],
    participantShipIds: ["attacker", "target"],
    snapshots: {},
    initiative: [
      { shipId: "attacker", initialRoll: 20, bonus: 2, total: 22, tieBreakRolls: [] },
      { shipId: "target", initialRoll: 10, bonus: 0, total: 10, tieBreakRolls: [] }
    ],
    roundNumber: 1,
    currentShipId: "attacker",
    completedShipIdsThisRound: [],
    movementRemainingByShip: { attacker: 3, target: 3 },
    actionUsedByShip: { attacker: false, target: false },
    exitedShipIds: ["target"],
    status: "ACTIVE",
    events: [],
    startedOnTurn: 4,
    startedAt: 1,
    revision: 1
  };
}

const sector: BroadsideSectorResolver = () => true;
const attackerCell: GridCellCoord = { x: 5, y: 5 };
const targetCell: GridCellCoord = { x: 7, y: 5 };

it("does not allow a broadside to target a ship that has already exited the naval battle", () => {
  expect(validateBroadsideTarget({
    battle: battle(),
    attackerId: "attacker",
    targetId: "target",
    attacker: ship("red"),
    target: ship("blue"),
    attackerCell,
    targetCell,
    sectorResolver: sector,
    distanceCells: () => 2,
    hasLineOfSight: () => true
  })).toEqual({ ok: false, reason: "TARGET_EXITED" });
});
