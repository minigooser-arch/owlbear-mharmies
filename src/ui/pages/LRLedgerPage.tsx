import type { LRTransaction } from "../../shared/types";
import type { UiCommand } from "../state/useExtensionState";

export function LRLedgerPage({ transactions, onAction }: { transactions: readonly LRTransaction[]; onAction(command: UiCommand): void }) {
  const pending = transactions.filter((entry) => entry.status === "PENDING");
  return <section aria-labelledby="lr-ledger-title" className="wiki-page">
    <div className="section-heading wiki-page-heading"><div><p className="eyebrow">Финансы</p><h2 id="lr-ledger-title">Журнал ЛР</h2><p className="page-description">Список операций для переноса мастером во внешнюю таблицу.</p></div><span className="count-pill">Ожидают: {pending.length}</span></div>
    {transactions.length === 0 ? <p className="empty empty-panel">Транзакций пока нет.</p> : <div className="card-list">
      {transactions.map((entry) => <article className="wiki-card registration-card" key={entry.id}>
        <div className="registration-copy"><strong>{entry.kind === "HEALING" ? "Лечение" : entry.kind === "COMPLETION" ? "Завершение комплектации" : "Комплектация армии"}</strong><span>{entry.armyName} · {entry.sideName}</span><small>{entry.cityName ?? "Без города"} · {entry.hp} HP × {entry.ratePerHp.toLocaleString("ru-RU")} ЛР = {entry.amount.toLocaleString("ru-RU")} ЛР</small><small>{entry.status === "RECORDED" ? `Внесено: ${entry.recordedAt ?? ""}` : "Не внесено во внешнюю таблицу"}</small></div>
        {entry.status === "PENDING" ? <button className="button primary" type="button" onClick={() => onAction({ type: "MARK_LR_TRANSACTION_RECORDED", transactionId: entry.id })}>Отметить внесённой</button> : null}
      </article>)}
    </div>}
  </section>;
}
