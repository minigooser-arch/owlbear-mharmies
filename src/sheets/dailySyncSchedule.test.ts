import { describe, expect, it } from "vitest";
import { dueDailySheetSyncDate } from "./dailySyncSchedule";

describe("Moscow nightly sheet reconciliation", () => {
  it("does not run before 01:00 MSK", () => {
    expect(dueDailySheetSyncDate(new Date("2026-10-08T21:59:59Z"), "2026-10-07")).toBeNull();
  });

  it("becomes due at 01:00 MSK even after previous missed days", () => {
    expect(dueDailySheetSyncDate(new Date("2026-10-08T22:00:00Z"), "2026-10-04"))
      .toBe("2026-10-09");
  });

  it("runs once per local date, including after browser restart", () => {
    const now = new Date("2026-10-09T00:13:00Z");
    expect(dueDailySheetSyncDate(now, "2026-10-09")).toBeNull();
    expect(dueDailySheetSyncDate(now, "2026-10-08")).toBe("2026-10-09");
  });

  it("validates dates", () => {
    expect(dueDailySheetSyncDate(new Date("invalid"), null)).toBeNull();
  });
});
