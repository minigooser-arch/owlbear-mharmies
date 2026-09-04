import type { NavalBattleState, ShipState } from "../../shared/types";

export type NavalActiveShipOverrideResult =
  | { ok: true; battle: NavalBattleState }
  | { ok: false; reason: string };

export function setActiveNavalShipOverride(
  battle: NavalBattleState,
  ships: Readonly<Record<string, ShipState>>,
  shipId: string
): NavalActiveShipOverrideResult {
  if (battle.status !== "ACTIVE") return { ok: false, reason: "NO_ACTIVE_NAVAL_BATTLE" };
  if (battle.currentShipId === shipId) return { ok: false, reason: "INVALID_NAVAL_TACTICAL_ACTION" };
  if (!battle.participantShipIds.includes(shipId) || !battle.initiative.some((entry) => entry.shipId === shipId)) {
    return { ok: false, reason: "SHIP_NOT_IN_NAVAL_BATTLE" };
  }

  const ship = ships[shipId];
  if (!ship) return { ok: false, reason: "SHIP_NOT_FOUND" };
  if (ship.status !== "IN_NAVAL_BATTLE" || ship.battleId !== battle.id) {
    return { ok: false, reason: "SHIP_NOT_IN_NAVAL_BATTLE" };
  }
  if (ship.hp <= 0) return { ok: false, reason: "SHIP_DESTROYED" };
  if (battle.exitedShipIds.includes(shipId)) return { ok: false, reason: "SHIP_ALREADY_EXITED" };
  if (battle.completedShipIdsThisRound.includes(shipId)) {
    return { ok: false, reason: "INVALID_NAVAL_TACTICAL_ACTION" };
  }

  const next = structuredClone(battle);
  next.currentShipId = shipId;
  next.revision += 1;
  return { ok: true, battle: next };
}
