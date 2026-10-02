import type { CommandState } from "../commands/commandProcessorCore";
import type { SceneState, StateDemography } from "../shared/types";

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

export interface SheetWritebackEvent {
  version: 1;
  eventId: string;
  createdAt: string;
  armies: SheetArmySnapshot[];
  removedArmyIds: string[];
  states: SheetStateWriteback[];
  factions?: SheetFactionSnapshot[];
  stateArmies?: SheetStateArmySnapshot[];
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

function factionIdentityForSide(scene: SceneState, sideId: string): {
  stateId: string | null;
  country: string | null;
  factionId: string | null;
  factionName: string | null;
} {
  const side = scene.sides.find((candidate) => candidate.id === sideId);
  const stateId = side?.stateId ?? null;
  const state = stateId ? scene.states.find((candidate) => candidate.id === stateId) : undefined;
  return {
    stateId,
    country: state?.backendCountry?.trim() || null,
    factionId: side?.id ?? null,
    factionName: side?.name?.trim() || null
  };
}

function countryForSide(scene: SceneState, sideId: string): { stateId: string | null; country: string | null } {
  const identity = factionIdentityForSide(scene, sideId);
  return { stateId: identity.stateId, country: identity.country };
}

function shipCountsByCountry(scene: SceneState): Map<string, number> {
  const counts = new Map<string, number>();
  for (const ship of Object.values(scene.ships ?? {})) {
    if ((ship as { registered?: boolean }).registered === false) continue;
    const { country } = countryForSide(scene, ship.sideId);
    if (!country) continue;
    counts.set(country, (counts.get(country) ?? 0) + 1);
  }
  return counts;
}

function sameArmyProjection(
  previous: SheetArmySnapshot | undefined,
  next: SheetArmySnapshot
): boolean {
  return previous?.stateId === next.stateId &&
    previous?.country === next.country &&
    previous?.hp === next.hp &&
    previous?.maxHp === next.maxHp;
}

function compactEvent(event: SheetWritebackEvent): SheetWritebackEvent {
  return {
    version: 1,
    eventId: event.eventId,
    createdAt: event.createdAt,
    armies: [...event.armies].sort((a, b) => a.armyId.localeCompare(b.armyId)),
    removedArmyIds: [...new Set(event.removedArmyIds)].sort(),
    states: [...event.states].sort((a, b) => a.country.localeCompare(b.country)),
    factions: [...(event.factions ?? [])].sort((a, b) => a.factionId.localeCompare(b.factionId)),
    stateArmies: [...(event.stateArmies ?? [])].sort((a, b) => a.country.localeCompare(b.country))
  };
}

/**
 * Builds only the public projection requested for Sheets:
 * current army HP/maxHP and active ship counts by backend country.
 * Movement, position, AP, supply, routes and statuses are deliberately excluded.
 */
export function buildSheetWritebackEvent(
  previous: CommandState,
  next: CommandState,
  createdAt = new Date().toISOString()
): SheetWritebackEvent | undefined {
  const armies = new Map<string, SheetArmySnapshot>();
  const removedArmyIds = new Set<string>();
  const affectedFactions = new Set<string>();
  const affectedCountries = new Set<string>();

  const identityForArmy = (scene: SceneState, army: CommandState["armies"][string]) => {
    const identity = factionIdentityForSide(scene, army.sideId);
    return {
      ...identity,
      hp: army.health.hp,
      maxHp: army.health.maxHp
    };
  };

  const armyIds = new Set([...Object.keys(previous.armies), ...Object.keys(next.armies)]);
  for (const armyId of armyIds) {
    const previousArmy = previous.armies[armyId];
    const nextArmy = next.armies[armyId];

    if (!nextArmy) {
      if (previousArmy) {
        removedArmyIds.add(armyId);
        const oldIdentity = identityForArmy(previous.scene, previousArmy);
        if (oldIdentity.factionId) affectedFactions.add(oldIdentity.factionId);
        if (oldIdentity.country) affectedCountries.add(oldIdentity.country);
      }
      continue;
    }

    const identity = identityForArmy(next.scene, nextArmy);
    const projection: SheetArmySnapshot = {
      armyId,
      stateId: identity.stateId,
      country: identity.country,
      hp: identity.hp,
      maxHp: identity.maxHp
    };

    if (!previousArmy) {
      armies.set(armyId, projection);
      if (identity.factionId) affectedFactions.add(identity.factionId);
      if (identity.country) affectedCountries.add(identity.country);
      continue;
    }

    const previousIdentity = identityForArmy(previous.scene, previousArmy);
    const previousProjection: SheetArmySnapshot = {
      armyId,
      stateId: previousIdentity.stateId,
      country: previousIdentity.country,
      hp: previousIdentity.hp,
      maxHp: previousIdentity.maxHp
    };

    if (!sameArmyProjection(previousProjection, projection)) {
      armies.set(armyId, projection);
      if (identity.factionId) affectedFactions.add(identity.factionId);
      if (previousIdentity.factionId) affectedFactions.add(previousIdentity.factionId);
      if (identity.country) affectedCountries.add(identity.country);
      if (previousIdentity.country) affectedCountries.add(previousIdentity.country);
    }
  }

  const aggregate = (scene: SceneState) => {
    const factions = new Map<string, SheetFactionSnapshot>();
    const states = new Map<string, SheetStateArmySnapshot>();
    for (const army of Object.values(next.armies)) {
      const identity = factionIdentityForSide(scene, army.sideId);
      if (!identity.factionId || !identity.factionName || !identity.country) continue;
      const faction = factions.get(identity.factionId) ?? {
        factionId: identity.factionId,
        factionName: identity.factionName,
        country: identity.country,
        hp: 0,
        maxHp: 0
      };
      faction.hp += army.health.hp;
      faction.maxHp += army.health.maxHp;
      factions.set(identity.factionId, faction);
      const state = states.get(identity.country) ?? { country: identity.country, hp: 0, maxHp: 0 };
      state.hp += army.health.hp;
      state.maxHp += army.health.maxHp;
      states.set(identity.country, state);
    }
    return { factions, states };
  };
  const nextAggregate = aggregate(next.scene);
  const factions = [...affectedFactions].flatMap((factionId) => {
    const snapshot = nextAggregate.factions.get(factionId);
    if (snapshot) return [snapshot];
    const side = next.scene.sides.find((candidate) => candidate.id === factionId)
      ?? previous.scene.sides.find((candidate) => candidate.id === factionId);
    const country = side?.stateId
      ? (next.scene.states.find((candidate) => candidate.id === side.stateId)
        ?? previous.scene.states.find((candidate) => candidate.id === side.stateId))?.backendCountry?.trim()
      : undefined;
    return side && country ? [{ factionId, factionName: side.name, country, hp: 0, maxHp: 0 }] : [];
  });
  const stateArmies = [...affectedCountries].flatMap((country) => {
    const snapshot = nextAggregate.states.get(country);
    return snapshot ? [snapshot] : [{ country, hp: 0, maxHp: 0 }];
  });

  const previousShips = shipCountsByCountry(previous.scene);
  const nextShips = shipCountsByCountry(next.scene);
  const countries = new Set([...previousShips.keys(), ...nextShips.keys()]);
  const states: SheetStateWriteback[] = [];
  for (const country of countries) {
    const previousCount = previousShips.get(country) ?? 0;
    const nextCount = nextShips.get(country) ?? 0;
    if (previousCount !== nextCount) states.push({ country, ships: nextCount });
  }

  if (armies.size === 0 && removedArmyIds.size === 0 && states.length === 0 && factions.length === 0 && stateArmies.length === 0) return undefined;
  for (const armyId of removedArmyIds) armies.delete(armyId);

  return compactEvent({
    version: 1,
    eventId: randomId("sheet-sync"),
    createdAt,
    armies: [...armies.values()],
    removedArmyIds: [...removedArmyIds],
    states,
    factions,
    stateArmies
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
  const armies = new Map<string, SheetArmySnapshot>();
  const removed = new Set<string>();
  const states = new Map<string, SheetStateWriteback>();
  const factions = new Map<string, SheetFactionSnapshot>();
  const stateArmies = new Map<string, SheetStateArmySnapshot>();

  for (const army of pending?.armies ?? []) armies.set(army.armyId, army);
  for (const armyId of pending?.removedArmyIds ?? []) removed.add(armyId);
  for (const state of pending?.states ?? []) states.set(state.country, state);
  for (const faction of pending?.factions ?? []) factions.set(faction.factionId, faction);
  for (const state of pending?.stateArmies ?? []) stateArmies.set(state.country, state);

  for (const army of incoming.armies) {
    armies.set(army.armyId, army);
    removed.delete(army.armyId);
  }
  for (const armyId of incoming.removedArmyIds) {
    armies.delete(armyId);
    removed.add(armyId);
  }
  for (const state of incoming.states) states.set(state.country, state);
  for (const faction of incoming.factions ?? []) factions.set(faction.factionId, faction);
  for (const state of incoming.stateArmies ?? []) stateArmies.set(state.country, state);

  return {
    version: 1,
    pending: compactEvent({
      version: 1,
      // A merged queue is a new snapshot. A fresh eventId lets an in-flight
      // writeback distinguish the old payload from newer state.
      eventId: incoming.eventId,
      createdAt: incoming.createdAt,
      armies: [...armies.values()],
      removedArmyIds: [...removed],
      states: [...states.values()],
      factions: [...factions.values()],
      stateArmies: [...stateArmies.values()]
    })
  };
}

export function readSheetWritebackQueue(metadata: Record<string, unknown>, key: string): SheetWritebackQueue | undefined {
  const raw = metadata[key];
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const value = raw as Partial<SheetWritebackQueue>;
  if (value.version !== 1 || !value.pending || typeof value.pending !== "object") return undefined;
  return value as SheetWritebackQueue;
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
