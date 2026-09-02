import { compareOrdinal } from "../shared/ordering";
import type { ArmyState, BattleGroup } from "../shared/types";
import type { EnemyCollision } from "./collisionEngine";

export type ContactEdge = readonly [string, string];

export function nextBattleName(groups: readonly BattleGroup[]): string {
  const used = new Set(groups.map((group) => group.name));
  for (let index = 1; ; index += 1) {
    const candidate = `Бой ${index}`;
    if (!used.has(candidate)) return candidate;
  }
}

function connectedComponents(armyIds: readonly string[], edges: readonly ContactEdge[]): string[][] {
  const adjacency = new Map<string, Set<string>>();
  for (const armyId of armyIds) adjacency.set(armyId, new Set());
  for (const [left, right] of edges) {
    if (left === right) continue;
    if (!adjacency.has(left)) adjacency.set(left, new Set());
    if (!adjacency.has(right)) adjacency.set(right, new Set());
    adjacency.get(left)?.add(right);
    adjacency.get(right)?.add(left);
  }
  const visited = new Set<string>();
  const components: string[][] = [];
  for (const armyId of [...adjacency.keys()].sort()) {
    if (visited.has(armyId)) continue;
    const stack = [armyId];
    const component: string[] = [];
    visited.add(armyId);
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) continue;
      component.push(current);
      for (const neighbor of adjacency.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          stack.push(neighbor);
        }
      }
    }
    if (component.length >= 2) components.push(component.sort());
  }
  return components;
}


export function rebuildBattleGroups(
  armyIds: readonly string[],
  directEnemyContacts: readonly ContactEdge[],
  existingGroups: readonly BattleGroup[],
  createId: () => string
): BattleGroup[] {
  const components = connectedComponents(armyIds, directEnemyContacts).map((participantIds) => {
    const participantSet = new Set(participantIds);
    const overlapping = existingGroups.filter((group) =>
      group.participantIds.some((participantId) => participantSet.has(participantId))
    );
    const surviving = [...overlapping].sort((left, right) =>
      compareOrdinal(left.battleId, right.battleId)
    )[0];
    return { participantIds, overlapping, surviving };
  });
  const survivingGroups = components.flatMap(({ surviving }) =>
    surviving ? [surviving] : []
  );
  const rebuilt: BattleGroup[] = [];
  for (const { participantIds, overlapping, surviving } of components) {
    const revision =
      overlapping.length === 0
        ? 1
        : Math.max(...overlapping.map((group) => group.revision)) + 1;
    rebuilt.push({
      battleId: surviving?.battleId ?? createId(),
      name: surviving?.name ?? nextBattleName([...survivingGroups, ...rebuilt]),
      participantIds,
      revision
    });
  }
  return rebuilt.sort((left, right) => compareOrdinal(left.battleId, right.battleId));
}

export function joinReinforcements(
  groups: readonly BattleGroup[],
  directEnemyContacts: readonly ContactEdge[],
  createId: () => string
): BattleGroup[] {
  const armyIds = new Set(groups.flatMap((group) => group.participantIds));
  for (const [left, right] of directEnemyContacts) {
    armyIds.add(left);
    armyIds.add(right);
  }
  const retainedEdges: ContactEdge[] = groups.flatMap((group) => {
    const [first, ...rest] = group.participantIds;
    return first ? rest.map((participantId) => [first, participantId] as const) : [];
  });
  return rebuildBattleGroups(
    [...armyIds],
    [...retainedEdges, ...directEnemyContacts],
    groups,
    createId
  );
}

export function applyCollision(
  groups: readonly BattleGroup[],
  collision: EnemyCollision,
  createId: () => string
): BattleGroup[] {
  return joinReinforcements(groups, [[collision.armyAId, collision.armyBId]], createId);
}

export function mergeBattleGroups(
  groups: readonly BattleGroup[],
  battleIds: readonly string[]
): BattleGroup[] {
  const selected = groups.filter((group) => battleIds.includes(group.battleId));
  if (selected.length < 2) return [...groups];
  const surviving = [...selected].sort((left, right) =>
    compareOrdinal(left.battleId, right.battleId)
  )[0];
  if (!surviving) return [...groups];
  const participantIds = [...new Set(selected.flatMap((group) => group.participantIds))].sort();
  const merged: BattleGroup = {
    battleId: surviving.battleId,
    name: surviving.name,
    participantIds,
    revision: Math.max(...selected.map((group) => group.revision)) + 1
  };
  return [
    ...groups.filter((group) => !battleIds.includes(group.battleId)),
    merged
  ].sort((left, right) => compareOrdinal(left.battleId, right.battleId));
}

export function releaseBattleGroup(
  groups: readonly BattleGroup[],
  armies: ReadonlyMap<string, ArmyState>,
  battleId: string
): { groups: BattleGroup[]; armies: Map<string, ArmyState> } {
  const released = groups.find((group) => group.battleId === battleId);
  const nextArmies = new Map(armies);
  for (const participantId of released?.participantIds ?? []) {
    const state = nextArmies.get(participantId);
    if (!state) continue;
    const { battleGroupId, ...withoutBattleGroup } = state;
    void battleGroupId;
    nextArmies.set(participantId, { ...withoutBattleGroup, status: "PAUSED" });
  }
  return {
    groups: groups.filter((group) => group.battleId !== battleId),
    armies: nextArmies
  };
}
