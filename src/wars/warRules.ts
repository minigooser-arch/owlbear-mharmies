import type { CellState, WarState } from "../shared/types";

/**
 * Legacy informational helper. It must never be used as movement authorization because it
 * cannot answer which exact state pair is at war.
 */
export function isFactionAtWar(wars: readonly WarState[], factionId: string): boolean {
  return wars.some((war) => war.active && war.participantFactionIds.includes(factionId));
}

export type FactionCellAccessResult =
  | { allowed: true }
  | { allowed: false; reason: "IMPASSABLE" | "OUTSIDE_FACTION_TERRITORY" };

/**
 * Legacy faction-territory validator kept until stateMovementAccess replaces it.
 * Participation in any war intentionally does not bypass territory restrictions.
 */
export function canFactionEnterCell(input: {
  factionId: string;
  cellState: CellState;
  wars: readonly WarState[];
}): FactionCellAccessResult {
  if (input.cellState.impassable) return { allowed: false, reason: "IMPASSABLE" };
  if (!input.cellState.factionTerritoryIds.includes(input.factionId)) {
    return { allowed: false, reason: "OUTSIDE_FACTION_TERRITORY" };
  }
  return { allowed: true };
}
