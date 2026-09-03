import type { NavalBattleState, ShipState } from "../../shared/types";
import type { DetectionGraph } from "../../visibility/detectionGraph";

export interface NavalVisibilityInput {
  isGM: boolean;
  playerSideIds: readonly string[];
  ships: Readonly<Record<string, ShipState>>;
  detectionGraph: DetectionGraph;
  revealUntilTurn: Readonly<Record<string, Readonly<Record<string, number>>>>;
  currentTurn: number;
}

export function visibleShipIdsForPlayer(input: NavalVisibilityInput): Set<string> {
  const shipEntries = Object.entries(input.ships);
  if (input.isGM) return new Set(shipEntries.map(([shipId]) => shipId));

  const playerSideIds = new Set(input.playerSideIds);
  const visible = new Set(
    shipEntries
      .filter(([, ship]) => playerSideIds.has(ship.sideId))
      .map(([shipId]) => shipId)
  );

  for (const sideId of playerSideIds) {
    for (const shipId of input.detectionGraph.visibleTargetsBySide.get(sideId) ?? []) {
      if (input.ships[shipId]) visible.add(shipId);
    }
    for (const [shipId, expiresAtTurn] of Object.entries(input.revealUntilTurn[sideId] ?? {})) {
      if (expiresAtTurn > input.currentTurn && input.ships[shipId]) visible.add(shipId);
    }
  }

  return visible;
}

export interface ApplyBattleRevealInput {
  ships: Readonly<Record<string, ShipState>>;
  battle: Pick<NavalBattleState, "participantShipIds">;
  revealUntilTurn: Readonly<Record<string, Readonly<Record<string, number>>>>;
  currentTurn: number;
}

export function applyBattleRevealUntilNextTurn(
  input: ApplyBattleRevealInput
): Record<string, Record<string, number>> {
  const next: Record<string, Record<string, number>> = Object.fromEntries(
    Object.entries(input.revealUntilTurn).map(([sideId, reveals]) => [sideId, { ...reveals }])
  );
  const participantIds = [...new Set(input.battle.participantShipIds)]
    .filter((shipId) => input.ships[shipId] !== undefined);
  const expiresAtTurn = input.currentTurn + 1;

  for (const observerId of participantIds) {
    const observer = input.ships[observerId];
    if (!observer) continue;
    for (const targetId of participantIds) {
      const target = input.ships[targetId];
      if (!target || target.sideId === observer.sideId) continue;
      const sideReveals = next[observer.sideId] ?? {};
      sideReveals[targetId] = Math.max(sideReveals[targetId] ?? 0, expiresAtTurn);
      next[observer.sideId] = sideReveals;
    }
  }

  return next;
}
