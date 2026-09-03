import type { NavalBattleState, ShipState } from "../../shared/types";
import { SHIP_CLASSES } from "../ships/shipClasses";

function eligibleShipIds(
  battle: NavalBattleState,
  ships: Readonly<Record<string, ShipState>>
): string[] {
  const participantIds = new Set(battle.participantShipIds);
  const exitedIds = new Set(battle.exitedShipIds);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const entry of battle.initiative) {
    const shipId = entry.shipId;
    if (seen.has(shipId) || !participantIds.has(shipId) || exitedIds.has(shipId)) continue;
    const ship = ships[shipId];
    if (!ship || ship.hp <= 0) continue;
    seen.add(shipId);
    result.push(shipId);
  }
  return result;
}

function resetPerRoundState(
  battle: NavalBattleState,
  ships: Readonly<Record<string, ShipState>>,
  eligibleIds: readonly string[]
): void {
  battle.completedShipIdsThisRound = [];
  battle.movementRemainingByShip = Object.fromEntries(
    eligibleIds.map((shipId) => {
      const ship = ships[shipId];
      if (!ship) throw new Error(`Missing eligible ship ${shipId}`);
      return [shipId, SHIP_CLASSES[ship.classId].movement];
    })
  );
  battle.actionUsedByShip = Object.fromEntries(eligibleIds.map((shipId) => [shipId, false]));
  battle.currentShipId = eligibleIds[0] ?? null;
}

function requireActiveShip(battle: NavalBattleState, shipId: string): void {
  if (battle.currentShipId !== shipId) throw new Error("Ship is not active");
}

function finishTurnMutable(
  next: NavalBattleState,
  ships: Readonly<Record<string, ShipState>>,
  shipId: string
): void {
  if (!next.completedShipIdsThisRound.includes(shipId)) {
    next.completedShipIdsThisRound.push(shipId);
  }

  const eligibleIds = eligibleShipIds(next, ships);
  const completed = new Set(next.completedShipIdsThisRound);
  const nextShipId = eligibleIds.find((candidate) => !completed.has(candidate));
  if (nextShipId) {
    next.currentShipId = nextShipId;
    return;
  }

  next.roundNumber += 1;
  resetPerRoundState(next, ships, eligibleIds);
}

export function startNavalRound(
  battle: NavalBattleState,
  ships: Readonly<Record<string, ShipState>>
): NavalBattleState {
  const next = structuredClone(battle);
  resetPerRoundState(next, ships, eligibleShipIds(next, ships));
  next.revision += 1;
  return next;
}

export function spendNavalMovement(
  battle: NavalBattleState,
  shipId: string,
  amount: number
): NavalBattleState {
  requireActiveShip(battle, shipId);
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("Invalid naval movement cost");
  if (battle.actionUsedByShip[shipId]) throw new Error("Naval action already used");
  const remaining = battle.movementRemainingByShip[shipId];
  if (remaining === undefined || amount > remaining) throw new Error("Insufficient naval movement");

  const next = structuredClone(battle);
  next.movementRemainingByShip[shipId] = remaining - amount;
  next.revision += 1;
  return next;
}

export function endNavalShipTurn(
  battle: NavalBattleState,
  ships: Readonly<Record<string, ShipState>>,
  shipId: string
): NavalBattleState {
  requireActiveShip(battle, shipId);
  const next = structuredClone(battle);
  finishTurnMutable(next, ships, shipId);
  next.revision += 1;
  return next;
}

export function useNavalAction(
  battle: NavalBattleState,
  ships: Readonly<Record<string, ShipState>>,
  shipId: string
): NavalBattleState {
  requireActiveShip(battle, shipId);
  if (battle.actionUsedByShip[shipId]) throw new Error("Naval action already used");

  const next = structuredClone(battle);
  next.actionUsedByShip[shipId] = true;
  finishTurnMutable(next, ships, shipId);
  next.revision += 1;
  return next;
}
