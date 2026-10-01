import type {
  DemographyAuditEntry,
  LRTransaction,
  LRTransactionKind,
  SceneState,
  StateDemography
} from "../shared/types";

export interface HumanResourceDebitContext {
  requestId: string;
  actorPlayerId: string;
  kind: LRTransactionKind;
  armyId: string;
  armyName: string;
  cityId: string | null;
  cityName: string | null;
  hp: number;
  ratePerHp: number;
  turnNumber: number;
  createdAt: string;
}

export type HumanResourceDebitResult =
  | { ok: true; demography: StateDemography; transaction: LRTransaction }
  | { ok: false; reason: "STATE_REQUIRED" | "STATE_NOT_FOUND" | "INSUFFICIENT_HUMAN_RESOURCE" | "INVALID_AMOUNT" };

export function debitHumanResource(
  scene: SceneState,
  sideId: string,
  amount: number,
  context: HumanResourceDebitContext
): HumanResourceDebitResult {
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: "INVALID_AMOUNT" };
  const side = scene.sides.find((candidate) => candidate.id === sideId);
  if (!side?.stateId) return { ok: false, reason: "STATE_REQUIRED" };
  const demography = scene.demographics?.find((candidate) => candidate.stateId === side.stateId);
  if (!demography) return { ok: false, reason: "STATE_NOT_FOUND" };

  const existing = scene.lrTransactions?.find((candidate) => candidate.requestId === context.requestId);
  if (existing) return { ok: true, demography: structuredClone(demography), transaction: structuredClone(existing) };
  if (demography.humanResource < amount) return { ok: false, reason: "INSUFFICIENT_HUMAN_RESOURCE" };

  const balanceBefore = demography.humanResource;
  const balanceAfter = balanceBefore - amount;
  const state = scene.states.find((candidate) => candidate.id === side.stateId);
  const transaction: LRTransaction = {
    id: `lr-${context.requestId}`,
    requestId: context.requestId,
    createdAt: context.createdAt,
    turnNumber: context.turnNumber,
    actorPlayerId: context.actorPlayerId,
    sideId: side.id,
    sideName: side.name,
    cityId: context.cityId,
    cityName: context.cityName,
    armyId: context.armyId,
    armyName: context.armyName,
    kind: context.kind,
    hp: context.hp,
    ratePerHp: context.ratePerHp,
    amount,
    stateId: side.stateId,
    stateName: state?.name ?? null,
    factionId: side.id,
    factionName: side.name,
    balanceBefore,
    balanceAfter,
    status: "PENDING"
  };

  return {
    ok: true,
    demography: { ...demography, humanResource: balanceAfter },
    transaction
  };
}

export function applyDemographyCorrection(
  record: StateDemography,
  patch: Partial<Pick<StateDemography, "population" | "populationGrowthFactor" | "conscriptionLawId" | "conscriptionRate">>,
  reason: string,
  actorPlayerId: string,
  at: string
): { record: StateDemography; entry: DemographyAuditEntry } {
  const normalizedReason = reason.trim();
  if (!normalizedReason) throw new Error("DEMOGRAPHY_CORRECTION_REASON_REQUIRED");
  const next = { ...record };
  const changes: DemographyAuditEntry["changes"] = {};
  for (const key of ["population", "populationGrowthFactor", "conscriptionLawId", "conscriptionRate"] as const) {
    const value = patch[key];
    if (value === undefined || value === record[key]) continue;
    if (typeof value === "number" && (!Number.isFinite(value) || value < 0)) continue;
    (next as StateDemography)[key] = value as never;
    changes[key] = { before: record[key], after: value };
  }
  next.populationGrowthFactor = next.populationGrowthFactor > 0 ? next.populationGrowthFactor : record.populationGrowthFactor;
  next.conscriptionRate = Math.min(1, Math.max(0, next.conscriptionRate));
  next.humanResourceCapacity = Math.max(0, next.population * next.conscriptionRate);
  if (next.humanResourceCapacity !== record.humanResourceCapacity) {
    changes.humanResourceCapacity = { before: record.humanResourceCapacity, after: next.humanResourceCapacity };
  }
  return {
    record: next,
    entry: {
      id: `demography-${record.stateId}-${at}`,
      stateId: record.stateId,
      actorPlayerId,
      reason: normalizedReason,
      changes,
      createdAt: at
    }
  };
}
