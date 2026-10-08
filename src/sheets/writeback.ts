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
  /** Potential LR before permanent LR_V2 expenses. */
  humanResourceCapacity?: number;
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

export interface SheetStateShipSnapshot {
  country: string;
  ships: number;
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
  stateShips?: SheetStateShipSnapshot[];
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
    // Individual army and ship state are private to Owlbear and must never
    // leave the scene. Aggregate HP is intentionally retained for the public
    // state and faction rows.
    states: [],
    factions: [...(event.factions ?? [])].sort((a, b) => a.factionId.localeCompare(b.factionId)),
    stateArmies: [...(event.stateArmies ?? [])].sort((a, b) => a.country.localeCompare(b.country)),
    stateShips: [...(event.stateShips ?? [])].sort((a, b) => a.country.localeCompare(b.country)),
    militaryInfluenceOperations: [...(event.militaryInfluenceOperations ?? [])].sort((a, b) => a.requestId.localeCompare(b.requestId))
  };
}

interface HpAggregate {
  hp: number;
  maxHp: number;
}

function addArmyHp(aggregate: HpAggregate, health: { hp: number; maxHp: number }): void {
  aggregate.hp += health.hp;
  aggregate.maxHp += health.maxHp;
}

function factionHpSnapshots(state: CommandState["scene"], armies: CommandState["armies"]): SheetFactionSnapshot[] {
  const aggregates = new Map<string, HpAggregate>();
  for (const army of Object.values(armies)) {
    const aggregate = aggregates.get(army.sideId) ?? { hp: 0, maxHp: 0 };
    addArmyHp(aggregate, army.health);
    aggregates.set(army.sideId, aggregate);
  }
  return state.sides.flatMap((side) => {
    const country = state.states.find((candidate) => candidate.id === side.stateId)?.backendCountry?.trim();
    if (!country) return [];
    const aggregate = aggregates.get(side.id) ?? { hp: 0, maxHp: 0 };
    return [{ factionId: side.id, factionName: side.name, country, ...aggregate }];
  });
}

function stateHpSnapshots(state: CommandState["scene"], armies: CommandState["armies"]): SheetStateArmySnapshot[] {
  const sideStateIds = new Map(state.sides.map((side) => [side.id, side.stateId]));
  const aggregates = new Map<string, HpAggregate>();
  for (const army of Object.values(armies)) {
    const stateId = sideStateIds.get(army.sideId);
    if (!stateId) continue;
    const aggregate = aggregates.get(stateId) ?? { hp: 0, maxHp: 0 };
    addArmyHp(aggregate, army.health);
    aggregates.set(stateId, aggregate);
  }
  return state.states.flatMap((countryState) => {
    const country = countryState.backendCountry?.trim();
    if (!country) return [];
    const aggregate = aggregates.get(countryState.id) ?? { hp: 0, maxHp: 0 };
    return [{ country, ...aggregate }];
  });
}

/** Public ship totals only; individual ship identities never reach Sheets. */
function stateShipSnapshots(state: CommandState["scene"]): SheetStateShipSnapshot[] {
  const countryBySide = new Map(state.sides.map((side) => {
    const country = state.states.find((candidate) => candidate.id === side.stateId)?.backendCountry?.trim();
    return [side.id, country] as const;
  }));
  const counts = new Map<string, number>();
  for (const target of state.states) {
    if (target.backendCountry?.trim()) counts.set(target.backendCountry.trim(), 0);
  }
  for (const ship of Object.values(state.ships ?? {})) {
    const country = countryBySide.get(ship.sideId);
    if (country) counts.set(country, (counts.get(country) ?? 0) + 1);
  }
  return [...counts].map(([country, ships]) => ({ country, ships }));
}

function changedAggregates<T extends { hp: number; maxHp: number }>(
  previous: readonly T[],
  next: readonly T[],
  key: (value: T) => string
): T[] {
  const previousByKey = new Map(previous.map((value) => [key(value), value]));
  return next.filter((value) => {
    const prior = previousByKey.get(key(value));
    return !prior || prior.hp !== value.hp || prior.maxHp !== value.maxHp;
  });
}

/**
 * Builds the Sheets projection: aggregate HP for each mapped faction/state
 * and military influence operations. Individual army HP, army identifiers,
 * ship counts and all other unit state stay private to Owlbear.
 */
export function buildSheetWritebackEvent(
  previous: CommandState,
  next: CommandState,
  createdAt = new Date().toISOString()
): SheetWritebackEvent | undefined {
  const previousInfluenceRequestIds = new Set((previous.scene.militaryInfluenceAudit ?? []).map((entry) => entry.requestId));
  const militaryInfluenceOperations = (next.scene.militaryInfluenceAudit ?? []).filter((entry) => !previousInfluenceRequestIds.has(entry.requestId));
  const previousFactions = factionHpSnapshots(previous.scene, previous.armies);
  const nextFactions = factionHpSnapshots(next.scene, next.armies);
  const previousStates = stateHpSnapshots(previous.scene, previous.armies);
  const nextStates = stateHpSnapshots(next.scene, next.armies);
  const previousShips = stateShipSnapshots(previous.scene);
  const nextShips = stateShipSnapshots(next.scene);
  const factions = changedAggregates(previousFactions, nextFactions, (value) => value.factionId);
  const stateArmies = changedAggregates(previousStates, nextStates, (value) => value.country);
  const stateShips = nextShips.filter((item) => previousShips.find((old) => old.country === item.country)?.ships !== item.ships);

  if (militaryInfluenceOperations.length === 0 && factions.length === 0 && stateArmies.length === 0 && stateShips.length === 0) return undefined;

  return compactEvent({
    version: 1,
    eventId: randomId("sheet-sync"),
    createdAt,
    armies: [],
    removedArmyIds: [],
    states: [],
    factions,
    stateArmies,
    stateShips,
    militaryInfluenceOperations
  });
}

/**
 * Builds a complete aggregate snapshot for coordinator startup. This repairs
 * stale sheet cells without exporting any individual army or ship state.
 */
export function buildSheetWritebackSnapshotEvent(
  next: CommandState,
  createdAt = new Date().toISOString()
): SheetWritebackEvent | undefined {
  const factions = factionHpSnapshots(next.scene, next.armies);
  const stateArmies = stateHpSnapshots(next.scene, next.armies);
  const stateShips = stateShipSnapshots(next.scene);
  if (factions.length === 0 && stateArmies.length === 0 && stateShips.length === 0) return undefined;

  return compactEvent({
    version: 1,
    eventId: randomId("sheet-sync-snapshot"),
    createdAt,
    armies: [],
    removedArmyIds: [],
    states: [],
    factions,
    stateArmies,
    stateShips,
    militaryInfluenceOperations: []
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
  const factions = new Map<string, SheetFactionSnapshot>();
  const stateArmies = new Map<string, SheetStateArmySnapshot>();
  const stateShips = new Map<string, SheetStateShipSnapshot>();

  for (const operation of pending?.militaryInfluenceOperations ?? []) militaryInfluenceOperations.set(operation.requestId, operation);
  for (const faction of pending?.factions ?? []) factions.set(faction.factionId, faction);
  for (const state of pending?.stateArmies ?? []) stateArmies.set(state.country, state);
  for (const state of pending?.stateShips ?? []) stateShips.set(state.country, state);

  for (const operation of incoming.militaryInfluenceOperations ?? []) militaryInfluenceOperations.set(operation.requestId, operation);
  for (const faction of incoming.factions ?? []) factions.set(faction.factionId, faction);
  for (const state of incoming.stateArmies ?? []) stateArmies.set(state.country, state);
  for (const state of incoming.stateShips ?? []) stateShips.set(state.country, state);

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
      factions: [...factions.values()],
      stateArmies: [...stateArmies.values()],
      stateShips: [...stateShips.values()],
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
      factions: Array.isArray(pending.factions) ? pending.factions as SheetFactionSnapshot[] : [],
      stateArmies: Array.isArray(pending.stateArmies) ? pending.stateArmies as SheetStateArmySnapshot[] : [],
      stateShips: Array.isArray(pending.stateShips) ? pending.stateShips as SheetStateShipSnapshot[] : [],
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
      // AO is the available LR, distinct from potential recruitment capacity.
      humanResourceCapacity: snapshot.humanResourceCapacity ?? snapshot.humanResource,
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

