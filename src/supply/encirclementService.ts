import { clearDestroyedArmySceneReferences, destroyArmy } from "../armies/armyLifecycle";
import { applyEncirclementDamage } from "../health/armyHealth";
import type { ArmyState, SceneState } from "../shared/types";

export interface EncirclementCheckpointDomain {
  scene: SceneState;
  armies: Readonly<Record<string, ArmyState>>;
}

export interface EncirclementCheckpointResult {
  scene: SceneState;
  armies: Record<string, ArmyState>;
}

/**
 * Applies the encirclement effect after supply has been authoritatively checked for the turn.
 *
 * The scene checkpoint is the idempotency key. Replaying the same turn after the effect was
 * completed is a no-op, so partial persistence retries cannot remove HP twice.
 */
export function applyEncirclementCheckpoint(
  current: EncirclementCheckpointDomain,
  turnNumber: number
): EncirclementCheckpointResult {
  if (!Number.isInteger(turnNumber) || turnNumber < 1) {
    throw new Error("INVALID_TURN_NUMBER");
  }

  const checkpoint = current.scene.turnCheckpoint;
  if (
    !checkpoint ||
    checkpoint.turnNumber !== turnNumber ||
    !checkpoint.supplyDone ||
    checkpoint.encirclementDone
  ) {
    return {
      scene: current.scene,
      armies: { ...current.armies }
    };
  }

  const scene = structuredClone(current.scene);
  let armies = structuredClone(current.armies) as Record<string, ArmyState>;

  for (const armyId of Object.keys(armies)) {
    const army = armies[armyId];
    if (!army || army.supply.supplied || army.health.hp <= 0) continue;

    const damaged = applyEncirclementDamage(army);
    if (damaged.health.hp > 0) {
      armies[armyId] = damaged;
      continue;
    }

    const destroyed = destroyArmy(armies, scene.battleGroups, armyId);
    armies = destroyed.armies;
    scene.battleGroups = destroyed.battleGroups;
    clearDestroyedArmySceneReferences(scene, armyId);
  }

  scene.turnCheckpoint = {
    ...checkpoint,
    encirclementDone: true
  };

  return { scene, armies };
}
