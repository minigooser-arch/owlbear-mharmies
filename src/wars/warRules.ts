import type { CellState, WarState } from "../shared/types";

export function isFactionAtWar(wars: readonly WarState[], factionId: string): boolean {
  return wars.some((war) => war.active && war.participantFactionIds.includes(factionId));
}

export type FactionCellAccessResult =
  | { allowed: true }
  | { allowed: false; reason: "IMPASSABLE" | "OUTSIDE_FACTION_TERRITORY" };

export function canFactionEnterCell(input: {
  factionId: string;
  cellState: CellState;
  wars: readonly WarState[];
}): FactionCellAccessResult {
  if (input.cellState.impassable) return { allowed: false, reason: "IMPASSABLE" };
  if (isFactionAtWar(input.wars, input.factionId)) return { allowed: true };
  if (!input.cellState.factionTerritoryIds.includes(input.factionId)) {
    return { allowed: false, reason: "OUTSIDE_FACTION_TERRITORY" };
  }
  return { allowed: true };
}
