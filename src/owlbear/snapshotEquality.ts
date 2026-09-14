import type {
  ArmyView,
  PartyPlayerView,
  RawExtensionSnapshot
} from "../ui/state/useExtensionState";
import type { BattleGroup, Side, StateEntity } from "../shared/types";

function unorderedValuesEqual(left: readonly unknown[], right: readonly unknown[]): boolean {
  if (left.length !== right.length) return false;
  const matched = new Set<number>();
  for (const leftValue of left) {
    const match = right.findIndex((rightValue, index) => !matched.has(index) && semanticValueEqual(leftValue, rightValue));
    if (match < 0) return false;
    matched.add(match);
  }
  return true;
}

export function semanticValueEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left === null || right === null) return false;
  if (typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => semanticValueEqual(value, right[index]));
  }
  if (left instanceof Set || right instanceof Set) {
    if (!(left instanceof Set) || !(right instanceof Set)) return false;
    return unorderedValuesEqual([...left], [...right]);
  }
  if (left instanceof Map || right instanceof Map) {
    if (!(left instanceof Map) || !(right instanceof Map) || left.size !== right.size) return false;
    return unorderedValuesEqual([...left.entries()].map(([key, value]) => ({ key, value })), [...right.entries()].map(([key, value]) => ({ key, value })));
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  if (!semanticValueEqual(leftKeys, rightKeys)) return false;
  return leftKeys.every((key) => semanticValueEqual(leftRecord[key], rightRecord[key]));
}

function entityCollectionEqual<T>(left: readonly T[], right: readonly T[], id: (value: T) => string, equal: (leftValue: T, rightValue: T) => boolean): boolean {
  if (left.length !== right.length) return false;
  const rightById = new Map(right.map((value) => [id(value), value]));
  if (rightById.size !== right.length) return false;
  const leftIds = new Set<string>();
  for (const value of left) {
    const valueId = id(value);
    if (leftIds.has(valueId)) return false;
    leftIds.add(valueId);
    const counterpart = rightById.get(valueId);
    if (counterpart === undefined || !equal(value, counterpart)) return false;
  }
  return true;
}

function optionalEntityCollectionEqual<T>(left: readonly T[] | undefined, right: readonly T[] | undefined, id: (value: T) => string): boolean {
  return entityCollectionEqual(left ?? [], right ?? [], id, semanticValueEqual);
}
function playerEqual(left: PartyPlayerView, right: PartyPlayerView): boolean {
  return left.id === right.id && left.name === right.name && left.color === right.color && left.role === right.role && left.connected === right.connected;
}
function armyEqual(left: ArmyView, right: ArmyView): boolean { return semanticValueEqual(left, right); }
function sideEqual(left: Side, right: Side): boolean {
  return left.id === right.id && left.name === right.name && left.color === right.color && left.stateId === right.stateId && semanticValueEqual(new Set(left.playerIds), new Set(right.playerIds)) && semanticValueEqual(new Set(left.leaderPlayerIds), new Set(right.leaderPlayerIds));
}
function stateEqual(left: StateEntity, right: StateEntity): boolean { return semanticValueEqual(left, right); }
function battleEqual(left: BattleGroup, right: BattleGroup): boolean {
  return left.battleId === right.battleId && left.name === right.name && semanticValueEqual(new Set(left.participantIds), new Set(right.participantIds));
}

export function semanticSnapshotEqual(left: RawExtensionSnapshot, right: RawExtensionSnapshot): boolean {
  return left.ready === right.ready
    && left.sceneReady === right.sceneReady
    && left.futureSchema === right.futureSchema
    && left.role === right.role
    && left.playerId === right.playerId
    && entityCollectionEqual(left.players, right.players, (player) => player.id, playerEqual)
    && semanticValueEqual(left.memberSideIds, right.memberSideIds)
    && semanticValueEqual(left.leaderSideIds, right.leaderSideIds)
    && entityCollectionEqual(left.armies, right.armies, (army) => army.id, armyEqual)
    && optionalEntityCollectionEqual(left.ships, right.ships, (ship) => ship.id)
    && optionalEntityCollectionEqual(left.navalRequestTargets, right.navalRequestTargets, (target) => target.id)
    && optionalEntityCollectionEqual(left.pendingNavalBattleRequests, right.pendingNavalBattleRequests, (request) => request.id)
    && optionalEntityCollectionEqual(left.transportEmbarkTargets, right.transportEmbarkTargets, (target) => target.id)
    && optionalEntityCollectionEqual(left.pendingTransportEmbarkRequests, right.pendingTransportEmbarkRequests, (request) => request.id)
    && semanticValueEqual(left.navalBattleAreaDraft, right.navalBattleAreaDraft)
    && semanticValueEqual(left.activeNavalBattle, right.activeNavalBattle)
    && entityCollectionEqual(left.sides, right.sides, (side) => side.id, sideEqual)
    && entityCollectionEqual(left.states, right.states, (state) => state.id, stateEqual)
    && semanticValueEqual(left.relations, right.relations)
    && semanticValueEqual(left.stateRelations, right.stateRelations)
    && entityCollectionEqual(left.battleGroups, right.battleGroups, (battle) => battle.battleId, battleEqual)
    && semanticValueEqual(left.settings, right.settings)
    && semanticValueEqual(left.terrain, right.terrain)
    && semanticValueEqual(left.wars, right.wars)
    && semanticValueEqual(left.turn, right.turn);
}
