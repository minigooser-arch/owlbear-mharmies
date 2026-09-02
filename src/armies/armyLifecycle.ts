import type { ArmyState, BattleGroup } from "../shared/types";

export interface DestroyArmyResult {
  armies: Record<string, ArmyState>;
  battleGroups: BattleGroup[];
}

export function destroyArmy(
  armies: Readonly<Record<string, ArmyState>>,
  battleGroups: readonly BattleGroup[],
  armyId: string
): DestroyArmyResult {
  let nextArmies = Object.fromEntries(Object.entries(armies).filter(([id]) => id !== armyId));
  const dissolvedSurvivorIds = new Set<string>();

  const nextGroups = battleGroups.flatMap((group) => {
    if (!group.participantIds.includes(armyId)) return [group];
    const participantIds = group.participantIds.filter((participantId) => participantId !== armyId);
    if (participantIds.length < 2) {
      for (const participantId of participantIds) dissolvedSurvivorIds.add(participantId);
      return [];
    }
    return [{
      ...group,
      participantIds,
      revision: group.revision + 1
    }];
  });

  if (dissolvedSurvivorIds.size > 0) {
    nextArmies = Object.fromEntries(Object.entries(nextArmies).map(([id, army]) => {
      if (!dissolvedSurvivorIds.has(id)) return [id, army];
      const { battleGroupId: _battleGroupId, ...withoutBattleGroup } = army;
      return [id, {
        ...withoutBattleGroup,
        status: "PAUSED" as const,
        revision: army.revision + 1
      }];
    }));
  }

  return { armies: nextArmies, battleGroups: nextGroups };
}
