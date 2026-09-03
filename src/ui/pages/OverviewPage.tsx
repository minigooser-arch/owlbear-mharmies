import type { WarState } from "../../shared/types";
import { TurnStatusCard } from "../components/TurnStatusCard";
import type { ArmyView, UiCommand } from "../state/useExtensionState";
import type { TurnState } from "../../shared/types";

export function OverviewPage({ armies, wars, turn, onAction }: {
  armies: readonly ArmyView[];
  wars: readonly WarState[];
  turn: TurnState;
  onAction(command: UiCommand): void;
}) {
  const moving = armies.filter((army) => army.status === "MOVING").length;
  const inBattle = armies.filter((army) => army.status === "IN_BATTLE").length;
  const encircled = armies.filter((army) => !army.supplied).length;
  const pendingDisband = armies.filter((army) => army.disbandPending).length;
  const invalidRoutes = armies.filter((army) => army.routeRequiresReplan || army.routeInvalidReason).length;
  const withoutRoute = armies.filter((army) => army.status !== "IN_BATTLE" && army.routeCellCount === 0).length;
  const attention = armies.filter((army) => !army.supplied || army.disbandPending || army.routeRequiresReplan || army.routeInvalidReason);
  const activeWars = wars.filter((war) => war.active);

  return (
    <section aria-labelledby="overview-title">
      <div className="section-heading wiki-page-heading"><div><p className="eyebrow">Оперативная сводка</p><h2 id="overview-title">Обзор</h2><p className="page-description">Текущий ход, состояние войск, проблемные маршруты и активные войны в одном месте.</p></div></div>
      <TurnStatusCard turn={turn} role="GM" onAction={onAction} />
      <div className="overview-metrics" aria-label="Состояние армий">
        <div><strong>{armies.length}</strong><span>армий</span></div>
        <div><strong>{moving}</strong><span>движутся</span></div>
        <div><strong>{inBattle}</strong><span>в бою</span></div>
        <div className={encircled > 0 ? "metric-warning" : ""}><strong>{encircled}</strong><span>окружены</span></div>
      </div>
      <div className="overview-grid">
        <article className="overview-panel">
          <div className="overview-panel-heading"><h3>Требуют внимания</h3><span>{attention.length}</span></div>
          {attention.length === 0 ? <p className="muted">Критичных состояний нет.</p> : (
            <div className="attention-list">{attention.map((army) => <div key={army.id}><strong>{army.name}</strong><span>{!army.supplied ? "Окружена" : army.disbandPending ? "Роспуск на следующий ход" : "Маршрут недействителен"}</span></div>)}</div>
          )}
        </article>
        <article className="overview-panel">
          <div className="overview-panel-heading"><h3>Подготовка хода</h3></div>
          <div className="overview-facts"><span>Без маршрута <strong>{withoutRoute}</strong></span><span>Проблемные маршруты <strong>{invalidRoutes}</strong></span><span>Ожидают роспуска <strong>{pendingDisband}</strong></span></div>
        </article>
        <article className="overview-panel overview-panel-wide">
          <div className="overview-panel-heading"><h3>Активные войны</h3><span>{activeWars.length}</span></div>
          {activeWars.length === 0 ? <p className="muted">Активных войн нет.</p> : <div className="war-summary-list">{activeWars.map((war) => <div key={war.id}><strong>{war.name}</strong><span>{war.participantFactionIds.length} фракц. · {war.participantStateIds.length} гос.</span></div>)}</div>}
        </article>
      </div>
    </section>
  );
}
