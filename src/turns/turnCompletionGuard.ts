import type { ArmyState, SceneState } from "../shared/types";

export type TurnBlocker =
  | "LAND_BATTLE_ACTIVE"
  | "NAVAL_BATTLE_ACTIVE"
  | "MOVEMENT_RESOLUTION_PENDING"
  | "FORCED_EXIT_PENDING"
  | "SUPPLY_CHECK_PENDING"
  | "ENCIRCLEMENT_PENDING"
  | "TERRITORIAL_SCORE_PENDING";

export function getTurnCompletionBlockers(
  scene: SceneState,
  armies: Readonly<Record<string, ArmyState>> = {}
): TurnBlocker[] {
  const blockers: TurnBlocker[] = [];

  if (scene.battleGroups.length > 0) blockers.push("LAND_BATTLE_ACTIVE");
  if (scene.activeNavalBattle?.status === "ACTIVE") blockers.push("NAVAL_BATTLE_ACTIVE");
  // Forced exits intentionally continue over several turns as their movement budget resets.
  const forcedExitArmyIds = new Set((scene.forcedExitStates ?? []).map((entry) => entry.armyId));
  const hasUnfinishedPlannedMovement = Object.entries(armies).some(([armyId, army]) =>
    army.status === "MOVING" && !forcedExitArmyIds.has(armyId)
  );
  if (scene.turn.phase === "MOVEMENT" || hasUnfinishedPlannedMovement) {
    blockers.push("MOVEMENT_RESOLUTION_PENDING");
  }

  const checkpoint = scene.turnCheckpoint;
  if (checkpoint?.turnNumber === scene.turn.turnNumber + 1) {
    if (!checkpoint.forcedExitDone) blockers.push("FORCED_EXIT_PENDING");
    if (!checkpoint.supplyDone) blockers.push("SUPPLY_CHECK_PENDING");
    if (!checkpoint.encirclementDone) blockers.push("ENCIRCLEMENT_PENDING");
    if (!checkpoint.territorialScoreDone) blockers.push("TERRITORIAL_SCORE_PENDING");
  }

  return blockers;
}

export function preCheckpointTurnBlockers(
  scene: SceneState,
  armies: Readonly<Record<string, ArmyState>> = {}
): TurnBlocker[] {
  return getTurnCompletionBlockers(scene, armies).filter(
    (blocker) =>
      blocker === "LAND_BATTLE_ACTIVE" ||
      blocker === "NAVAL_BATTLE_ACTIVE" ||
      blocker === "MOVEMENT_RESOLUTION_PENDING"
  );
}
