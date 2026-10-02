export const MILITARY_INFLUENCE_DELTAS = Object.freeze({
  LAND_BATTLE_VICTORY: 4,
  NAVAL_BATTLE_VICTORY: 4,
  DESTROY_ENEMY_ARMY: 3,
  DESTROY_ENEMY_SHIP: 3,
  SUCCESSFUL_CITY_DEFENSE: 3,
  SUCCESSFUL_CITY_OCCUPATION: 3,
  SHIP_TRANSFER: -15,
  MILITARY_UPGRADE_I: -20,
  APPOINT_COMMANDER_IN_CHIEF: -30,
  MILITARY_UPGRADE_II: -30,
  MILITARY_UPGRADE_III: -50
} as const);

export type MilitaryInfluenceReasonCode = keyof typeof MILITARY_INFLUENCE_DELTAS;

export interface MilitaryInfluenceOperationInput {
  requestId: string;
  factionId: string;
  factionName: string;
  country: string;
  reasonCode: MilitaryInfluenceReasonCode;
  delta: number;
  balanceBefore?: number;
  actorPlayerId?: string;
  turnNumber?: number;
  cityId?: string | null;
  cityName?: string | null;
}

export interface ValidatedMilitaryInfluenceOperation extends MilitaryInfluenceOperationInput {
  balanceAfter: number;
}

export function militaryInfluenceDelta(reasonCode: MilitaryInfluenceReasonCode, delta?: number): number {
  const expected = MILITARY_INFLUENCE_DELTAS[reasonCode];
  if (delta !== undefined && delta !== expected) throw new Error("MILITARY_INFLUENCE_DELTA_MISMATCH");
  return expected;
}

export function validateMilitaryInfluenceOperation(
  input: MilitaryInfluenceOperationInput
): ValidatedMilitaryInfluenceOperation {
  if (!input.requestId.trim() || !input.factionId.trim() || !input.factionName.trim() || !input.country.trim()) {
    throw new Error("INVALID_MILITARY_INFLUENCE_OPERATION");
  }
  if (input.balanceBefore !== undefined && (!Number.isInteger(input.balanceBefore) || input.balanceBefore < 0)) {
    throw new Error("INVALID_MILITARY_INFLUENCE_BALANCE");
  }
  const delta = militaryInfluenceDelta(input.reasonCode, input.delta);
  const balanceAfter = (input.balanceBefore ?? 0) + delta;
  if (balanceAfter < 0) throw new Error("INSUFFICIENT_MILITARY_INFLUENCE");
  return { ...input, delta, balanceAfter };
}


export type SheetMilitaryInfluenceOperation = MilitaryInfluenceOperationInput;

export interface SheetMilitaryInfluenceOperationResult {
  requestId: string;
  factionId: string;
  balanceBefore: number;
  balanceAfter: number;
  delta: number;
}
