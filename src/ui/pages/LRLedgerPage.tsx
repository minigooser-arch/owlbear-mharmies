import { useMemo, useState } from "react";
import type { LRTransaction } from "../../shared/types";
import type { UiCommand } from "../state/useExtensionState";

export function formatLRTransactionForSheet(entry: LRTransaction): string {
  return [
    entry.stateId ?? "",
    entry.stateName ?? "",
    entry.factionId ?? entry.sideId,
    entry.factionName ?? entry.sideName,
    entry.armyId,
    entry.kind,
    entry.hp,
    entry.amount,
    entry.balanceBefore ?? "",
    entry.balanceAfter ?? "",
    entry.turnNumber,
    entry.createdAt,
    entry.status
  ].join("\t");
}

function formatBalance(value: number | undefined): string {
  return value === undefined ? "—" : value.toLocaleString("ru-RU");
}

export function LRLedgerPage({ transactions, onAction }: { transactions: readonly LRTransaction[]; onAction(command: UiCommand): void }) {
  const [stateFilter, setStateFilter] = useState("");
  const [factionFilter, setFactionFilter] = useState("");
  const [kindFilter, setKindFilter] = useState<LRTransaction["kind"] | "">("");
  const filtered = useMemo(() => transactions.filter((entry) =>
    (!stateFilter || entry.stateId === stateFilter) &&
    (!factionFilter || (entry.factionId ?? entry.sideId) === factionFilter) &&
    (!kindFilter || entry.kind === kindFilter)
  ), [transactions, stateFilter, factionFilter, kindFilter]);
  const pending = transactions.filter((entry) => entry.status === "PENDING");
  return <section aria-labelledby="lr-ledger-title" className="wiki-page">
    <div className="section-heading wiki-page-heading"><div><p className="eyebrow">Финансы</p><h2 id="lr-ledger-title">Журнал ЛР</h2><p className="page-description">Список операций для переноса мастером во внешнюю таблицу.</p></div><span className="count-pill">Ожидают: {pending.length}</span></div>
    {transactions.length > 0 && <div className="form-grid lr-filters"><label>Государство<input value={stateFilter} onChange={(event) => setStateFilter(event.target.value)} placeholder="Все" /></label><label>Фракция<input value={factionFilter} onChange={(event) => setFactionFilter(event.target.value)} placeholder="Все" /></label><label>Тип<select value={kindFilter} onChange={(event) => setKindFilter(event.target.value as LRTransaction["kind"] | "")}><option value="">Все операции</option><option value="FORMATION">Создание/комплектация</option><option value="COMPLETION">Завершение</option><option value="HEALING">Лечение</option></select></label></div>}
    {filtered.length === 0 ? <p className="empty empty-panel">Транзакций по выбранным фильтрам нет.</p> : <div className="card-list">
      {filtered.map((entry) => <article className="wiki-card registration-card" key={entry.id}>
        <div className="registration-copy"><strong>{entry.kind === "HEALING" ? "Лечение" : entry.kind === "COMPLETION" ? "Завершение комплектации" : "Комплектация армии"}</strong><span>{entry.armyName} · {entry.factionName ?? entry.sideName} · {entry.stateName ?? entry.stateId ?? "Государство не указано"}</span><small>{entry.cityName ?? "Без города"} · {entry.hp} HP × {entry.ratePerHp.toLocaleString("ru-RU")} ЛР = {entry.amount.toLocaleString("ru-RU")} ЛР</small><small>Баланс: {formatBalance(entry.balanceBefore)} → {formatBalance(entry.balanceAfter)}</small><small>{entry.status === "RECORDED" ? `Внесено: ${entry.recordedAt ?? ""}` : "Не внесено во внешнюю таблицу"}</small><code className="lr-sheet-row">{formatLRTransactionForSheet(entry)}</code></div>
        <div className="card-actions">{entry.status === "PENDING" ? <button className="button primary" type="button" onClick={() => onAction({ type: "MARK_LR_TRANSACTION_RECORDED", transactionId: entry.id })}>Отметить внесённой</button> : null}<button className="button subtle" type="button" onClick={() => void navigator.clipboard?.writeText(formatLRTransactionForSheet(entry))}>Копировать строку</button></div>
      </article>)}
    </div>}
  </section>;
}
