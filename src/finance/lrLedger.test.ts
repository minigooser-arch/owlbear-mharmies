import { describe, expect, it } from "vitest";
import { appendLRTransaction, markLRTransactionRecorded } from "./lrLedger";

describe("LR ledger", () => {
  it("appends an immutable pending transaction with a stable snapshot", () => {
    const next = appendLRTransaction([], {
      id: "tx-1",
      requestId: "request-1",
      createdAt: "2026-09-28T10:00:00.000Z",
      turnNumber: 3,
      actorPlayerId: "player-1",
      sideId: "red",
      sideName: "Красные",
      cityId: "city-1",
      cityName: "Москва",
      armyId: "army-1",
      armyName: "1-я армия",
      kind: "FORMATION",
      hp: 5,
      ratePerHp: 5000,
      amount: 25000
    });

    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ id: "tx-1", requestId: "request-1", status: "PENDING", amount: 25000 });
  });

  it("deduplicates a retried request and marks the transaction recorded", () => {
    const entry = {
      id: "tx-1",
      requestId: "request-1",
      createdAt: "2026-09-28T10:00:00.000Z",
      turnNumber: 3,
      actorPlayerId: "player-1",
      sideId: "red",
      sideName: "Красные",
      cityId: "city-1",
      cityName: "Москва",
      armyId: "army-1",
      armyName: "1-я армия",
      kind: "HEALING" as const,
      hp: 2,
      ratePerHp: 5000,
      amount: 10000
    };
    const once = appendLRTransaction([], entry);
    const twice = appendLRTransaction(once, { ...entry, id: "tx-2" });
    const recorded = markLRTransactionRecorded(twice, "tx-1", "gm-1", "2026-09-28T11:00:00.000Z");

    expect(twice).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ status: "RECORDED", recordedByPlayerId: "gm-1" });
  });
});
