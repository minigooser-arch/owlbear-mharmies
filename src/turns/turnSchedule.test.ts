import { expect, it } from "vitest";
import { getDueTurnBoundary, getLatestStandardTurnBoundary, getNextStandardTurnBoundary } from "./turnSchedule";
import { DEFAULT_TURN_STATE } from "../shared/constants";

it("chooses Wednesday 15:00 Moscow from Tuesday", () => {
  expect(getNextStandardTurnBoundary(new Date("2026-09-01T10:00:00.000Z")).instant.toISOString()).toBe("2026-09-02T12:00:00.000Z");
});

it("chooses Sunday after Wednesday 15:00 Moscow has passed", () => {
  expect(getNextStandardTurnBoundary(new Date("2026-09-02T12:01:00.000Z")).instant.toISOString()).toBe("2026-09-06T12:00:00.000Z");
});

it("finds the latest due standard boundary", () => {
  expect(getLatestStandardTurnBoundary(new Date("2026-09-03T10:00:00.000Z"))?.instant.toISOString()).toBe("2026-09-02T12:00:00.000Z");
});

it("does not return a due boundary while paused", () => {
  expect(getDueTurnBoundary(new Date("2026-09-03T10:00:00.000Z"), { ...DEFAULT_TURN_STATE, autoTurnsPaused: true })).toBeNull();
});
