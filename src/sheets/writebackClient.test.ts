import { describe, expect, it, vi } from "vitest";
import {
  SHEET_WRITEBACK_TOKEN_STORAGE_KEY,
  SheetWritebackClient,
  readSheetWritebackToken,
  saveSheetWritebackToken,
  clearSheetWritebackToken
} from "./writebackClient";

describe("sheet writeback local secret", () => {
  it("stores the token outside SceneSettings", () => {
    const storage = new Map<string, string>();
    const localStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => { storage.delete(key); }
    };
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: localStorage });
    saveSheetWritebackToken(" secret ");
    expect(storage.get(SHEET_WRITEBACK_TOKEN_STORAGE_KEY)).toBe("secret");
    expect(readSheetWritebackToken()).toBe("secret");
    clearSheetWritebackToken();
    expect(readSheetWritebackToken()).toBe("");
    vi.restoreAllMocks();
  });
});


describe("sheet writeback transport", () => {
  it("uses a simple text/plain POST so Apps Script does not receive an OPTIONS preflight", async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(init?.headers).toEqual({ "Content-Type": "text/plain;charset=utf-8" });
      const body = JSON.parse(String(init?.body));
      expect(body.token).toBe("secret");
      return {
        ok: true,
        json: async () => ({ ok: true, result: { states: [] } })
      } as Response;
    });
    const client = new SheetWritebackClient("https://example.test", "secret", fetcher as typeof fetch);
    await expect(client.getStates([])).resolves.toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("binds the browser fetch function to the global object", async () => {
    const originalFetch = globalThis.fetch;
    const detachedSensitiveFetch = function(this: unknown) {
      expect(this).toBe(globalThis);
      return Promise.resolve({
        ok: true,
        json: async () => ({ ok: true, result: { states: [] } })
      } as Response);
    } as typeof fetch;
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: detachedSensitiveFetch });
    try {
      const client = new SheetWritebackClient("https://example.test", "secret");
      await expect(client.getStates([])).resolves.toEqual([]);
    } finally {
      Object.defineProperty(globalThis, "fetch", { configurable: true, value: originalFetch });
    }
  });
});

