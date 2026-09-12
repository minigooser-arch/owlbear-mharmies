import type { WarState } from "../shared/types";

/**
 * Legacy snapshot/display compatibility only.
 *
 * This helper must never be used for movement, annexation, border access, or diplomacy.
 * Authoritative political rules use exact pairwise StateRelations instead.
 */
export function isFactionAtWar(wars: readonly WarState[], factionId: string): boolean {
  return wars.some((war) => war.active && war.participantFactionIds.includes(factionId));
}
