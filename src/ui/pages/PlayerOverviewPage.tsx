import type { TurnState } from "../../shared/types";
import { TurnStatusCard } from "../components/TurnStatusCard";
import type { ArmyView, UiCommand } from "../state/useExtensionState";

/** Only uses the already-authorized player snapshot; never discovers hidden enemy armies. */
export function PlayerOverviewPage({ armies, turn, onOpenForces, onOpenArmy, onAction }: {
  armies: readonly ArmyView[];
  turn: TurnState;
  onOpenForces(): void;
  onOpenArmy(armyId: string): void;
  onAction(command: UiCommand): void;
}) {
  const inBattle = armies.filter((army) => army.status === "IN_BATTLE").length;
  const unsupplied = armies.filter((army) => !army.supplied).length;
  const toReview = armies.filter((army) => !army.supplied || army.routeRequiresReplan || army.routeInvalidReason || army.disbandPending);
  return (
    <section className="wiki-page" aria-labelledby="player-overview-title">
      <div className="section-heading wiki-page-heading">
        <div>
          <p className="eyebrow">Оперативная сводка</p>
          <h2 id="player-overview-title">Мой штаб</h2>
          <p className="page-description">Следующий ход, состояние доступных вам соединений и срочные действия.</p>
        </div>
      </div>
      <TurnStatusCard turn={turn} role="PLAYER" onAction={onAction} />
      <div className="overview-metrics" aria-label="Состояние доступных армий">
        <div><strong>{armies.length}</strong><span>армий</span></div>
        <div><strong>{armies.filter((army) => army.status === "MOVING").length}</strong><span>движутся</span></div>
        <div><strong>{inBattle}</strong><span>в бою</span></div>
        <div className={unsupplied > 0 ? "metric-warning" : ""}><strong>{unsupplied}</strong><span>без снабжения</span></div>
      </div>
      <article className="overview-panel">
        <div className="overview-panel-heading">
          <h3>Нужны ваши действия</h3><span>{toReview.length}</span>
        </div>
        {toReview.length === 0 ? <p className="muted">Критичных состояний среди доступных армий нет.</p> :
          <div className="attention-list">
            {toReview.map((army) =>
              <button className="attention-link" type="button" key={army.id} onClick={() => onOpenArmy(army.id)}>
                <strong>{army.name}</strong>
                <span>{!army.supplied ? "Нет снабжения" : army.disbandPending ? "Ожидает роспуска" : "Проверьте маршрут"} →</span>
              </button>
            )}
          </div>
        }
        <button className="button primary wide overview-main-action" type="button" onClick={onOpenForces}>Открыть войска</button>
      </article>
    </section>
  );
}
