// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LRTransaction } from "../../shared/types";
import { formatLRTransactionForSheet, LRLedgerPage } from "./LRLedgerPage";

const transaction: LRTransaction = {
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
  amount: 25000,
  stateId: "state-1",
  stateName: "Россия",
  factionId: "red",
  factionName: "Красные",
  balanceBefore: 100000,
  balanceAfter: 75000,
  status: "PENDING"
};

describe("LRLedgerPage", () => {
  it("formats a transaction as the sheet column order", () => {
    expect(formatLRTransactionForSheet(transaction)).toBe("state-1\tРоссия\tred\tКрасные\tarmy-1\tFORMATION\t5\t25000\t100000\t75000\t3\t2026-09-28T10:00:00.000Z\tPENDING");
  });

  it("filters rows and marks a pending row recorded", () => {
    const onAction = vi.fn();
    render(<LRLedgerPage transactions={[transaction, { ...transaction, id: "tx-2", stateId: "state-2" }]} onAction={onAction} />);
    fireEvent.change(screen.getByLabelText("Государство"), { target: { value: "state-1" } });
    expect(screen.getByText(/1-я армия/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Отметить внесённой" }));
    expect(onAction).toHaveBeenCalledWith({ type: "MARK_LR_TRANSACTION_RECORDED", transactionId: "tx-1" });
  });
});
