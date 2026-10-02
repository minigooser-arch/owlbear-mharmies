import type { SceneSettings } from "../shared/types";
import {
  type SheetSpendBatchResult,
  type SheetSpendOperation,
  type SheetStateSnapshot,
  type SheetWritebackEvent,
  type SheetWritebackQueue,
  mergeSheetWritebackQueue,
  readSheetWritebackQueue
} from "./writeback";
import { EXTENSION_ID, METADATA_KEYS } from "../shared/constants";
import type {
  SheetMilitaryInfluenceOperation,
  SheetMilitaryInfluenceOperationResult
} from "./militaryInfluence";

export const SHEET_WRITEBACK_TOKEN_STORAGE_KEY = `${EXTENSION_ID}/sheet-writeback-token`;

export function readSheetWritebackToken(): string {
  try {
    return globalThis.localStorage?.getItem(SHEET_WRITEBACK_TOKEN_STORAGE_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function saveSheetWritebackToken(token: string): void {
  try {
    const normalized = token.trim();
    if (!normalized) globalThis.localStorage?.removeItem(SHEET_WRITEBACK_TOKEN_STORAGE_KEY);
    else globalThis.localStorage?.setItem(SHEET_WRITEBACK_TOKEN_STORAGE_KEY, normalized);
  } catch {
    // Settings UI remains usable in restricted storage contexts.
  }
}

export function clearSheetWritebackToken(): void {
  try {
    globalThis.localStorage?.removeItem(SHEET_WRITEBACK_TOKEN_STORAGE_KEY);
  } catch {
    // Ignore restricted-storage environments.
  }
}

export function sheetWritebackConfigured(settings: SceneSettings): boolean {
  return Boolean(settings.sheetWritebackUrl?.trim());
}

export function sheetWritebackAuthorized(settings: SceneSettings): boolean {
  return sheetWritebackConfigured(settings) && Boolean(readSheetWritebackToken());
}

export class SheetWritebackError extends Error {
  constructor(
    readonly code: string,
    message = code
  ) {
    super(message);
    this.name = "SheetWritebackError";
  }
}

interface ApiResponse<T> {
  ok: boolean;
  error?: string;
  result?: T;
}

export class SheetWritebackClient {
  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
    private readonly timeoutMs = 8_000
  ) {}

  private async request<T>(payload: Record<string, unknown>): Promise<T> {
    if (!this.url.trim()) throw new SheetWritebackError("SHEET_WRITEBACK_URL_MISSING");
    if (!this.token.trim()) throw new SheetWritebackError("SHEET_WRITEBACK_TOKEN_MISSING");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetcher(this.url, {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ ...payload, token: this.token }),
        signal: controller.signal
      });
    } catch (error) {
      throw new SheetWritebackError(
        error instanceof DOMException && error.name === "AbortError"
          ? "SHEET_WRITEBACK_TIMEOUT"
          : "SHEET_WRITEBACK_NETWORK",
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) throw new SheetWritebackError(`SHEET_WRITEBACK_HTTP_${response.status}`);
    let body: ApiResponse<T>;
    try {
      body = await response.json() as ApiResponse<T>;
    } catch {
      throw new SheetWritebackError("SHEET_WRITEBACK_INVALID_RESPONSE");
    }
    if (!body.ok) throw new SheetWritebackError(body.error ?? "SHEET_WRITEBACK_REJECTED");
    if (body.result === undefined) throw new SheetWritebackError("SHEET_WRITEBACK_EMPTY_RESULT");
    return body.result;
  }

  getStates(countries: readonly string[]): Promise<SheetStateSnapshot[]> {
    const unique = [...new Set(countries.map((country) => country.trim()).filter(Boolean))];
    return this.request<{ states: SheetStateSnapshot[] }>({
      action: "GET_STATES",
      countries: unique
    }).then((result) => result.states);
  }

  spendLR(operations: readonly SheetSpendOperation[]): Promise<SheetSpendBatchResult> {
    const firstOperation = operations[0];
    return this.request<SheetSpendBatchResult>({
      action: "SPEND_LR_BATCH",
      batchRequestId: firstOperation ? `batch-${firstOperation.requestId}` : "batch-empty",
      operations
    });
  }

  syncState(event: SheetWritebackEvent): Promise<void> {
    return this.request<null>({
      action: "SYNC_STATE",
      event
    }).then(() => undefined);
  }

  adjustMilitaryInfluence(
    operations: readonly SheetMilitaryInfluenceOperation[]
  ): Promise<SheetMilitaryInfluenceOperationResult[]> {
    return this.request<{ operations: SheetMilitaryInfluenceOperationResult[] }>({
      action: "ADJUST_MILITARY_INFLUENCE_BATCH",
      operations
    }).then((result) => result.operations);
  }

  static readQueue(metadata: Record<string, unknown>): SheetWritebackQueue | undefined {
    return readSheetWritebackQueue(metadata, METADATA_KEYS.sheetWritebackQueue);
  }

  static mergeQueue(
    metadata: Record<string, unknown>,
    event: SheetWritebackEvent
  ): SheetWritebackQueue {
    return mergeSheetWritebackQueue(
      readSheetWritebackQueue(metadata, METADATA_KEYS.sheetWritebackQueue),
      event
    );
  }
}

