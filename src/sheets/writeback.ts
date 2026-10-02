import type { CommandState } from "../commands/commandProcessorCore";
import type { SceneState, StateDemography } from "../shared/types";
import type { MilitaryInfluenceAuditEntry } from "../shared/types";

export interface SheetArmySnapshot {
  armyId: string;
  stateId: string | null;
  country: string | null;
  hp: number;
  maxHp: number;
}

export interface SheetStateSnapshot {
  country: string;
  population: number;
  humanResource: number;
  conscriptionRate?: number;
}

export interface SheetStateWriteback {
  country: string;
  ships: number;
}

export interface SheetFactionSnapshot {
  factionId: string;
  factionName: string;
  country: string;
  hp: number;
  maxHp: number;
}

export interface SheetStateArmySnapshot {
  country: string;
  hp: number;
  maxHp: number;
}

export type SheetMilitaryInfluenceOperation = MilitaryInfluenceAuditEntry;

export interface SheetWritebackEvent {
  version: 1;
  eventId: string;
  createdAt: string;
  armies: SheetArmySnapshot[];
  removedArmyIds: string[];
  states: SheetStateWriteback[];
  factions?: SheetFactionSnapshot[];
  stateArmies?: SheetStateArmySnapshot[];
  militaryInfluenceOperations?: SheetMilitaryInfluenceOperation[];
}

export interface SheetWritebackQueue {
  version: 1;
  pending: SheetWritebackEvent;
}

export interface SheetSpendOperation {
  requestId: string;
  country: string;
  amount: number;
  hp: number;
  ratePerHp: number;
  kind: "FORMATION" | "COMPLETION" | "HEALING";
  armyId: string;
  armyName: string;
  actorPlayerId: string;
  turnNumber: number;
  cityId: string | null;
  cityName: string | null;
}

export interface SheetSpendOperationResult {
  requestId: string;
  populationBefore: number;
  populationAfter: number;
  humanResourceBefore: number;
  humanResourceAfter: number;
  stateName: string;
}

export interface SheetSpendBatchResult {
  operations: SheetSpendOperationResult[];
  states: SheetStateSnapshot[];
}

function randomId(prefix: string): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `${prefix}-${crypto.randomUUID()}`;
    }
  } catch {
    // Fall back below in restricted test/browser contexts.
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function compactEvent(event: SheetWritebackEvent): SheetWritebackEvent {
  return {
    version: 1,
    eventId: event.eventId,
    createdAt: event.createdAt,
    armies: [],
    removedArmyIds: [],
    // Army and ship state are private to Owlbear and must never leave the scene.
    states: [],
    factions: [],
    stateArmies: [],
    militaryInfluenceOperations: [...(event.militaryInfluenceOperations ?? [])].sort((a, b) => a.requestId.localeCompare(b.requestId))
  };
}

/**
 * Builds the only projection requested for Sheets: military influence
 * operations. Army HP, ship counts and all other unit state stay private to
 * Owlbear.
 */
export function buildSheetWritebackEvent(
  previous: CommandState,
  next: CommandState,
  createdAt = new Date().toISOString()
): SheetWritebackEvent | undefined {
  const previousInfluenceRequestIds = new Set((previous.scene.militaryInfluenceAudit ?? []).map((entry) => entry.requestId));
  const militaryInfluenceOperations = (next.scene.militaryInfluenceAudit ?? []).filter((entry) => !previousInfluenceRequestIds.has(entry.requestId));

  if (militaryInfluenceOperations.length === 0) return undefined;

  return compactEvent({
    version: 1,
    eventId: randomId("sheet-sync"),
    createdAt,
    armies: [],
    removedArmyIds: [],
    states: [],
    factions: [],
    stateArmies: [],
    militaryInfluenceOperations
  });
}

/**
 * Merges a new projection into the single durable pending snapshot.
 * This is intentionally not a historical queue: only the latest value for
 * each army/country survives, which keeps scene metadata small.
 */
export function mergeSheetWritebackQueue(
  existing: SheetWritebackQueue | undefined,
  incoming: SheetWritebackEvent
): SheetWritebackQueue {
  const pending = existing?.pending;
  const militaryInfluenceOperations = new Map<string, SheetMilitaryInfluenceOperation>();

  for (const operation of pending?.militaryInfluenceOperations ?? []) militaryInfluenceOperations.set(operation.requestId, operation);

  for (const operation of incoming.militaryInfluenceOperations ?? []) militaryInfluenceOperations.set(operation.requestId, operation);

  return {
    version: 1,
    pending: compactEvent({
      version: 1,
      // A merged queue is a new snapshot. A fresh eventId lets an in-flight
      // writeback distinguish the old payload from newer state.
      eventId: incoming.eventId,
      createdAt: incoming.createdAt,
      armies: [],
      removedArmyIds: [],
      states: [],
      factions: [],
      stateArmies: [],
      militaryInfluenceOperations: [...militaryInfluenceOperations.values()]
    })
  };
}

export function readSheetWritebackQueue(metadata: Record<string, unknown>, key: string): SheetWritebackQueue | undefined {
  const raw = metadata[key];
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const value = raw as Partial<SheetWritebackQueue>;
  if (value.version !== 1 || !value.pending || typeof value.pending !== "object") return undefined;
  const pending = value.pending as Partial<SheetWritebackEvent>;
  return {
    version: 1,
    pending: compactEvent({
      version: 1,
      eventId: String(pending.eventId ?? "legacy-queue"),
      createdAt: String(pending.createdAt ?? new Date(0).toISOString()),
      armies: [],
      removedArmyIds: [],
      states: [],
      factions: [],
      stateArmies: [],
      militaryInfluenceOperations: Array.isArray(pending.militaryInfluenceOperations)
        ? pending.militaryInfluenceOperations as SheetMilitaryInfluenceOperation[]
        : []
    })
  };
}

export function applySheetStateSnapshots(
  scene: SceneState,
  snapshots: readonly SheetStateSnapshot[]
): SceneState {
  if (snapshots.length === 0) return scene;
  if (!scene.demographics) throw new Error("SHEET_DEMOGRAPHY_NOT_INITIALIZED");

  const demographics = scene.demographics.map((record) => {
    const state = scene.states.find((candidate) => candidate.id === record.stateId);
    const country = state?.backendCountry?.trim();
    if (!country) return record;
    const snapshot = snapshots.find((candidate) => candidate.country === country);
    if (!snapshot) return record;
    const next: StateDemography = {
      ...record,
      population: snapshot.population,
      humanResource: snapshot.humanResource,
      // In the Sheets-authoritative mode AR is the available LR and therefore
      // also the current capacity. The local nonlinear formula is not used.
      humanResourceCapacity: snapshot.humanResource,
      ...(snapshot.conscriptionRate !== undefined
        ? { conscriptionRate: snapshot.conscriptionRate }
        : {})
    };
    return next;
  });

  const requestedCountries = new Set(snapshots.map((snapshot) => snapshot.country));
  for (const country of requestedCountries) {
    const state = scene.states.find((candidate) => candidate.backendCountry?.trim() === country);
    const record = state ? scene.demographics.find((candidate) => candidate.stateId === state.id) : undefined;
    if (!state || !record) throw new Error(`SHEET_DEMOGRAPHY_NOT_FOUND:${country}`);
  }

  return { ...scene, demographics };
}

export function pendingLRTransactions(
  previous: CommandState,
  next: CommandState
): SheetSpendOperation[] {
  const previousIds = new Set(
    (previous.scene.lrTransactions ?? []).map((transaction) => transaction.requestId)
  );
  const operations: SheetSpendOperation[] = [];

  for (const transaction of next.scene.lrTransactions ?? []) {
    if (previousIds.has(transaction.requestId) || transaction.status !== "PENDING") continue;
    const side = next.scene.sides.find((candidate) => candidate.id === transaction.sideId);
    const stateId = side?.stateId ?? transaction.stateId ?? null;
    const state = stateId ? next.scene.states.find((candidate) => candidate.id === stateId) : undefined;
    const country = state?.backendCountry?.trim() || null;
    if (!country) throw new Error(`SHEET_STATE_COUNTRY_MISSING:${transaction.requestId}`);
    operations.push({
      requestId: transaction.requestId,
      country,
      amount: transaction.amount,
      hp: transaction.hp,
      ratePerHp: transaction.ratePerHp,
      kind: transaction.kind,
      armyId: transaction.armyId,
      armyName: transaction.armyName,
      actorPlayerId: transaction.actorPlayerId,
      turnNumber: transaction.turnNumber,
      cityId: transaction.cityId,
      cityName: transaction.cityName
    });
  }
  return operations;
}

