import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  measureOperation,
  performanceSnapshot,
  recordPerformance,
  resetPerformance
} from "./metrics";

describe("local performance metrics", () => {
  beforeEach(() => resetPerformance());

  it("keeps aggregate counters and computes p95 without retaining unbounded samples", () => {
    for (let i = 1; i <= 200; i++) recordPerformance("sdk.items", i);
    const result = performanceSnapshot()[0];

    expect(result).toMatchObject({
      name: "sdk.items",
      calls: 200,
      averageMs: 100.5,
      maxMs: 200
    });
    expect(result?.p95Ms).toBe(194);
  });

  it("records failed operations without replacing the original error", async () => {
    const failure = new Error("SDK unavailable");
    const operation = vi.fn(async () => { throw failure; });

    await expect(measureOperation("sdk.failed", operation)).rejects.toBe(failure);

    expect(performanceSnapshot()[0]).toMatchObject({
      name: "sdk.failed",
      calls: 1
    });
  });

  it("ignores invalid samples and can reset data", () => {
    recordPerformance("bad", Number.NaN);
    recordPerformance("bad", -1);
    expect(performanceSnapshot()).toEqual([]);
    recordPerformance("good", 3);
    resetPerformance();
    expect(performanceSnapshot()).toEqual([]);
  });
});
