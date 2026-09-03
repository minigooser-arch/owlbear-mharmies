import type { NavalInitiativeEntry } from "../../shared/types";

export type RollD20 = () => number;

function checkedD20(rollD20: RollD20): number {
  const roll = rollD20();
  if (!Number.isInteger(roll) || roll < 1 || roll > 20) {
    throw new Error("Invalid d20 roll");
  }
  return roll;
}

function resolveTie(
  entries: NavalInitiativeEntry[],
  rollD20: RollD20
): NavalInitiativeEntry[] {
  if (entries.length <= 1) return entries;

  const groups = new Map<number, NavalInitiativeEntry[]>();
  for (const entry of entries) {
    const tieBreakRoll = checkedD20(rollD20);
    entry.tieBreakRolls.push(tieBreakRoll);
    const group = groups.get(tieBreakRoll) ?? [];
    group.push(entry);
    groups.set(tieBreakRoll, group);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => right - left)
    .flatMap(([, group]) => resolveTie(group, rollD20));
}

export function rollNavalInitiative(
  participantShipIds: readonly string[],
  initiatingShipId: string,
  rollD20: RollD20
): NavalInitiativeEntry[] {
  const uniqueParticipantShipIds = [...new Set(participantShipIds)];
  if (!uniqueParticipantShipIds.includes(initiatingShipId)) {
    throw new Error("Initiating ship must participate");
  }

  const entries = uniqueParticipantShipIds.map((shipId): NavalInitiativeEntry => {
    const initialRoll = checkedD20(rollD20);
    const bonus = shipId === initiatingShipId ? 2 : 0;
    return {
      shipId,
      initialRoll,
      bonus,
      total: initialRoll + bonus,
      tieBreakRolls: []
    };
  });

  const groups = new Map<number, NavalInitiativeEntry[]>();
  for (const entry of entries) {
    const group = groups.get(entry.total) ?? [];
    group.push(entry);
    groups.set(entry.total, group);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => right - left)
    .flatMap(([, group]) => resolveTie(group, rollD20));
}
