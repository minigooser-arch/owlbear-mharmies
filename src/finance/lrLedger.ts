import type { LRTransaction } from "../shared/types";

export type NewLRTransaction = Omit<LRTransaction, "status" | "recordedByPlayerId" | "recordedAt">;

export function appendLRTransaction(
  transactions: readonly LRTransaction[],
  entry: NewLRTransaction
): LRTransaction[] {
  if (transactions.some((candidate) => candidate.requestId === entry.requestId)) {
    return transactions.map((candidate) => structuredClone(candidate));
  }
  return [
    ...transactions.map((candidate) => structuredClone(candidate)),
    { ...structuredClone(entry), status: "PENDING" }
  ];
}

export function markLRTransactionRecorded(
  transactions: readonly LRTransaction[],
  transactionId: string,
  recordedByPlayerId: string,
  recordedAt: string
): LRTransaction[] {
  return transactions.map((transaction) => transaction.id === transactionId
    ? { ...structuredClone(transaction), status: "RECORDED", recordedByPlayerId, recordedAt }
    : structuredClone(transaction));
}
