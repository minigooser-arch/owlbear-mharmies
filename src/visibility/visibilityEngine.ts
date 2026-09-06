import type { BattleGroup } from "../shared/types";
import type { DetectionGraph } from "./detectionGraph";

export interface VisibleArmy {
  id: string;
  sideId: string;
}

export interface PlayerVisibilityInput {
  isGM: boolean;
  playerSideIds: readonly string[];
  armies: readonly VisibleArmy[];
  detectionGraph: DetectionGraph;
  battleGroups: readonly BattleGroup[];
}

export function visibleArmyIdsForPlayer(input: PlayerVisibilityInput): Set<string> {
  if (input.isGM) return new Set(input.armies.map((army) => army.id));

  const sideIds = new Set(input.playerSideIds);
  const armyIds = new Set(input.armies.map((army) => army.id));
  const visible = new Set(
    input.armies.filter((army) => sideIds.has(army.sideId)).map((army) => army.id)
  );
  for (const sideId of sideIds) {
    for (const targetId of input.detectionGraph.visibleTargetsBySide.get(sideId) ?? []) {
      if (armyIds.has(targetId)) visible.add(targetId);
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const group of input.battleGroups) {
      if (!group.participantIds.some((participantId) => visible.has(participantId))) continue;
      for (const participantId of group.participantIds) {
        if (!visible.has(participantId)) {
          visible.add(participantId);
          changed = true;
        }
      }
    }
  }
  return visible;
}
