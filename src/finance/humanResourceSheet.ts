import type { LRTransaction, SceneState, StateDemography } from "../shared/types";

export interface HumanResourceSheetState {
  country: string;
  population: number;
  humanResource: number;
}

export interface HumanResourceSheetOperation {
  country: string;
  requestId?: string;
  amount: number;
  kind?: string;
  hp?: number;
  stateId?: string;
  stateName?: string;
  armyId?: string;
  armyName?: string;
  cityId?: string | null;
  cityName?: string | null;
  actorPlayerId?: string;
  turnNumber?: number;
}

export interface HumanResourceSheetAppliedOperation extends HumanResourceSheetOperation {
  populationBefore: number;
  populationAfter: number;
  humanResourceBefore: number;
  humanResourceAfter: number;
}

export interface HumanResourceSheetSnapshot {
  states: HumanResourceSheetState[];
  appliedAt?: string;
}

export interface HumanResourceSheetSpendResult {
  requestId: string;
  states: HumanResourceSheetState[];
  operations: HumanResourceSheetAppliedOperation[];
  appliedAt: string;
}

export interface HumanResourceSheetRefundResult {
  requestId: string;
  states: HumanResourceSheetState[];
  operations: HumanResourceSheetAppliedOperation[];
  appliedAt: string;
}

interface ApiSuccess {
  ok: true;
  requestId?: string;
  states?: HumanResourceSheetState[];
  operations?: HumanResourceSheetAppliedOperation[];
  appliedAt?: string;
}

interface ApiFailure {
  ok: false;
  code: string;
  message?: string;
  states?: HumanResourceSheetState[];
}

export type HumanResourceSheetApiResponse = ApiSuccess | ApiFailure;

export interface HumanResourceSheetGatewayOptions {
  url: string;
  token: string;
  fetcher?: typeof fetch;
}

export class HumanResourceSheetError extends Error {
  constructor(
    readonly code: string,
    message = code,
    readonly states: readonly HumanResourceSheetState[] = []
  ) {
    super(message);
    this.name = "HumanResourceSheetError";
  }
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function parseState(value: unknown): HumanResourceSheetState | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  if (typeof raw.country !== "string" || !raw.country.trim()) return undefined;
  if (!finiteNonNegative(raw.population) || !finiteNonNegative(raw.humanResource)) return undefined;
  return {
    country: raw.country.trim(),
    population: raw.population,
    humanResource: raw.humanResource
  };
}

function parseAppliedOperation(value: unknown): HumanResourceSheetAppliedOperation | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  if (typeof raw.country !== "string" || !raw.country.trim() ||
      !finiteNonNegative(raw.amount) ||
      !finiteNonNegative(raw.populationBefore) ||
      !finiteNonNegative(raw.populationAfter) ||
      !finiteNonNegative(raw.humanResourceBefore) ||
      !finiteNonNegative(raw.humanResourceAfter)) return undefined;
  return {
    country: raw.country.trim(),
    ...(typeof raw.requestId === "string" ? { requestId: raw.requestId } : {}),
    amount: raw.amount,
    ...(typeof raw.kind === "string" ? { kind: raw.kind } : {}),
    ...(finiteNonNegative(raw.hp) ? { hp: raw.hp } : {}),
    ...(typeof raw.stateId === "string" ? { stateId: raw.stateId } : {}),
    ...(typeof raw.stateName === "string" ? { stateName: raw.stateName } : {}),
    ...(typeof raw.armyId === "string" ? { armyId: raw.armyId } : {}),
    ...(typeof raw.armyName === "string" ? { armyName: raw.armyName } : {}),
    ...(raw.cityId === null || typeof raw.cityId === "string" ? { cityId: raw.cityId } : {}),
    ...(raw.cityName === null || typeof raw.cityName === "string" ? { cityName: raw.cityName } : {}),
    ...(typeof raw.actorPlayerId === "string" ? { actorPlayerId: raw.actorPlayerId } : {}),
    ...(Number.isInteger(raw.turnNumber) ? { turnNumber: raw.turnNumber } : {}),
    populationBefore: raw.populationBefore,
    populationAfter: raw.populationAfter,
    humanResourceBefore: raw.humanResourceBefore,
    humanResourceAfter: raw.humanResourceAfter
  };
}

function parseResponse(value: unknown): HumanResourceSheetApiResponse {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, code: "INVALID_RESPONSE" };
  }
  const raw = value as Record<string, unknown>;
  if (raw.ok !== true) {
    return {
      ok: false,
      code: typeof raw.code === "string" ? raw.code : "UNKNOWN_ERROR",
      message: typeof raw.message === "string" ? raw.message : undefined,
      states: Array.isArray(raw.states) ? raw.states.map(parseState).filter((item): item is HumanResourceSheetState => item !== undefined) : []
    };
  }
  return {
    ok: true,
    ...(typeof raw.requestId === "string" ? { requestId: raw.requestId } : {}),
    states: Array.isArray(raw.states) ? raw.states.map(parseState).filter((item): item is HumanResourceSheetState => item !== undefined) : [],
    operations: Array.isArray(raw.operations)
      ? raw.operations.map(parseAppliedOperation).filter((item): item is HumanResourceSheetAppliedOperation => item !== undefined)
      : [],
    appliedAt: typeof raw.appliedAt === "string" ? raw.appliedAt : undefined
  };
}

export class HumanResourceSheetGateway {
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: HumanResourceSheetGatewayOptions) {
    this.fetcher = options.fetcher ?? fetch;
  }

  get configured(): boolean {
    return Boolean(this.options.url.trim() && this.options.token.trim());
  }

  async snapshot(): Promise<HumanResourceSheetSnapshot> {
    const response = await this.post({ action: "snapshot" });
    if (!response.ok) throw new HumanResourceSheetError(response.code, response.message, response.states ?? []);
    return {
      states: response.states ?? [],
      ...(response.appliedAt ? { appliedAt: response.appliedAt } : {})
    };
  }

  async spendBatch(
    requestId: string,
    operations: readonly HumanResourceSheetOperation[]
  ): Promise<HumanResourceSheetSpendResult> {
    const response = await this.post({
      action: "spendLRBatch",
      requestId,
      operations
    });
    if (!response.ok) throw new HumanResourceSheetError(response.code, response.message, response.states ?? []);
    return {
      requestId: response.requestId ?? requestId,
      states: response.states ?? [],
      operations: response.operations ?? [],
      appliedAt: response.appliedAt ?? new Date().toISOString()
    };
  }

  async refundBatch(
    requestId: string,
    originalRequestId: string,
    operations: readonly HumanResourceSheetOperation[]
  ): Promise<HumanResourceSheetRefundResult> {
    const response = await this.post({
      action: "refundLRBatch",
      requestId,
      originalRequestId,
      operations
    });
    if (!response.ok) throw new HumanResourceSheetError(response.code, response.message, response.states ?? []);
    return {
      requestId: response.requestId ?? requestId,
      states: response.states ?? [],
      operations: response.operations ?? [],
      appliedAt: response.appliedAt ?? new Date().toISOString()
    };
  }

  private async post(payload: Record<string, unknown>): Promise<HumanResourceSheetApiResponse> {
    if (!this.configured) throw new HumanResourceSheetError("HUMAN_RESOURCE_SHEET_NOT_CONFIGURED");
    let response: Response;
    try {
      response = await this.fetcher(this.options.url, {
        method: "POST",
        body: JSON.stringify({ token: this.options.token, ...payload })
      });
    } catch (error) {
      throw new HumanResourceSheetError(
        "HUMAN_RESOURCE_SHEET_UNAVAILABLE",
        error instanceof Error ? error.message : String(error)
      );
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new HumanResourceSheetError("HUMAN_RESOURCE_SHEET_INVALID_RESPONSE");
    }
    const parsed = parseResponse(body);
    if (!response.ok && parsed.ok) {
      return { ok: false, code: `HTTP_${response.status}` };
    }
    return parsed;
  }
}

export interface HumanResourceSpend {
  stateId: string;
  country: string;
  amount: number;
  stateName: string;
}

export function humanResourceSpendsBetween(
  before: SceneState,
  after: SceneState
): HumanResourceSpend[] {
  const beforeByState = new Map((before.demographics ?? []).map((record) => [record.stateId, record]));
  const afterByState = new Map((after.demographics ?? []).map((record) => [record.stateId, record]));
  const statesById = new Map(after.states.map((state) => [state.id, state]));
  const spends: HumanResourceSpend[] = [];
  for (const [stateId, afterRecord] of afterByState) {
    const beforeRecord = beforeByState.get(stateId);
    if (!beforeRecord) continue;
    const amount = beforeRecord.humanResource - afterRecord.humanResource;
    if (!Number.isFinite(amount) || amount <= 1e-9) continue;
    const state = statesById.get(stateId);
    const country = state?.backendCountry?.trim();
    if (!country) throw new HumanResourceSheetError("STATE_BACKEND_COUNTRY_MISSING", state?.name ?? stateId);
    spends.push({
      stateId,
      country,
      amount,
      stateName: state?.name ?? stateId
    });
  }
  return spends;
}

export function applyHumanResourceSheetSnapshot(
  scene: SceneState,
  snapshot: HumanResourceSheetSnapshot
): SceneState {
  if (!scene.demographics || snapshot.states.length === 0) return scene;
  const byCountry = new Map(snapshot.states.map((state) => [state.country.trim().toLowerCase(), state]));
  const demographics = scene.demographics.map((record) => {
    const state = scene.states.find((candidate) => candidate.id === record.stateId);
    const country = state?.backendCountry?.trim().toLowerCase();
    const sheet = country ? byCountry.get(country) : undefined;
    if (!sheet) return record;
    return {
      ...record,
      population: sheet.population,
      humanResource: sheet.humanResource,
      humanResourceCapacity: Math.max(record.humanResourceCapacity, sheet.humanResource)
    };
  });
  return JSON.stringify(demographics) === JSON.stringify(scene.demographics)
    ? scene
    : { ...scene, demographics };
}

export function markHumanResourceTransactionsRecorded(
  scene: SceneState,
  transactions: readonly HumanResourceSheetAppliedOperation[],
  recordedByPlayerId: string,
  recordedAt: string
): SceneState {
  if (!scene.lrTransactions || transactions.length === 0) return scene;
  const byRequestId = new Map(
    transactions
      .filter((transaction) => transaction.requestId)
      .map((transaction) => [
        transaction.requestId as string,
        transaction
      ])
  );
  const lrTransactions: LRTransaction[] = scene.lrTransactions.map((transaction) => {
    const confirmed = byRequestId.get(transaction.requestId);
    if (!confirmed) return structuredClone(transaction);
    return {
      ...structuredClone(transaction),
      balanceBefore: confirmed.humanResourceBefore,
      balanceAfter: confirmed.humanResourceAfter,
      status: "RECORDED",
      recordedByPlayerId,
      recordedAt
    };
  });
  return { ...scene, lrTransactions };
}

export function authoritativeDemographyFromSheet(
  record: StateDemography,
  sheet: HumanResourceSheetState
): StateDemography {
  return {
    ...record,
    population: sheet.population,
    humanResource: sheet.humanResource,
    humanResourceCapacity: Math.max(record.humanResourceCapacity, sheet.humanResource)
  };
}
