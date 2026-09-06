import type { NavalBattleState, ShipState } from "../../shared/types";
import { endNavalShipTurn } from "./navalRoundFlow";

export function confirmNavalShipExit(
  battle: NavalBattleState,
  ships: Readonly<Record<string, ShipState>>,
  shipId: string
): NavalBattleState {
  if (battle.currentShipId !== shipId) {
    throw new Error("Ship is not active");
  }
  if (battle.exitedShipIds.includes(shipId)) {
    throw new Error("Ship already exited naval battle");
  }

  const next = structuredClone(battle);
  next.exitedShipIds.push(shipId);
  if (next.interceptions?.[shipId]) {
    next.interceptions = Object.fromEntries(
      Object.entries(next.interceptions).filter(([candidateId]) => candidateId !== shipId)
    );
  }
  next.revision += 1;
  return endNavalShipTurn(next, ships, shipId);
}
