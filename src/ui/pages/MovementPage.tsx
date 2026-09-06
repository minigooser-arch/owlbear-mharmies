import type { ArmyView, UiCommand } from "../state/useExtensionState";
import type { TurnState } from "../../shared/types";
import { TurnStatusCard } from "../components/TurnStatusCard";
import { formatMovementUnits, movementDenialMessage } from "../presentation/movement";

export function MovementPage({ armies, turn, isGM, leaderSideIds, onAction }: { armies: readonly ArmyView[]; turn: TurnState; isGM: boolean; leaderSideIds: ReadonlySet<string>; onAction(command: UiCommand): void }) {
  return (
    <section aria-labelledby="turn-page-title">
      <div className="section-heading wiki-page-heading"><div><p className="eyebrow">Подготовка</p><h2 id="turn-page-title">Текущий ход</h2><p className="page-description">Проверьте маршруты соединений и подготовьте войска к следующей смене хода.</p></div></div>
      <TurnStatusCard turn={turn} role={isGM ? "GM" : "PLAYER"} onAction={onAction} />
      {isGM && <div className="command-grid"><button onClick={() => onAction({ type: "PAUSE_ALL" })}>Пауза всех</button><button onClick={() => onAction({ type: "STOP_ALL" })}>Остановить все</button></div>}
      <div className="movement-list">
        {armies.map((army) => {
          const reason = movementDenialMessage(army.routeInvalidReason);
          const canPlan = army.status === "READY" && (isGM || leaderSideIds.has(army.sideId));
          return <article className="movement-row" key={army.id}>
            <div><h3>{army.name}</h3><p>{army.sideName}{army.atWar ? " · Война" : ""}</p></div>
            <div className="movement-row-stats"><strong>{formatMovementUnits(army.movementRemainingUnits)} / {formatMovementUnits(army.movementMaxUnits)} ОП</strong><span>{army.routeCellCount > 0 ? `${army.routeCellCount} кл. · ${formatMovementUnits(army.routeCostUnits)} ОП` : "Без маршрута"}</span></div>
            {reason && <p className="route-warning">⚠ {reason}</p>}
            {army.routeRequiresReplan && <p className="route-warning">⚠ Требуется перепланировать маршрут.</p>}
            {canPlan && <button type="button" onClick={() => onAction({ type: "EDIT_ROUTE", armyId: army.id })}>{army.routeCellCount > 0 ? "Изменить маршрут" : "Проложить маршрут"}</button>}
          </article>;
        })}
        {armies.length === 0 && <p className="empty empty-panel">Нет доступных армий для планирования.</p>}
      </div>
    </section>
  );
}
