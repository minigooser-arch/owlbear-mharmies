import { useEffect, useState } from "react";
import type { ArmyView, UiCommand } from "../state/useExtensionState";
import { formatMovementUnits, movementDenialMessage } from "../presentation/movement";

const STATUS: Record<ArmyView["status"], string> = {
  READY: "Готова",
  MOVING: "Движется",
  PAUSED: "На паузе",
  IN_BATTLE: "В бою"
};

interface ArmyCardProps {
  army: ArmyView;
  isGM: boolean;
  canEditRoute: boolean;
  canRequestDisband: boolean;
  onAction(command: UiCommand): void;
}

function clampHp(value: number, maxHp: number): number {
  return Math.max(0, Math.min(maxHp, Math.round(value)));
}

function ArmyHealthEditor({ army, onAction }: { army: ArmyView; onAction(command: UiCommand): void }) {
  const [draft, setDraft] = useState(String(army.healthHp));
  useEffect(() => setDraft(String(army.healthHp)), [army.healthHp]);
  const parsed = Number(draft);
  const canSubmit = Number.isInteger(parsed) && parsed >= 0 && parsed <= army.healthMaxHp && parsed !== army.healthHp;
  const setHp = (hp: number) => onAction({ type: "SET_ARMY_HP", armyId: army.id, hp: clampHp(hp, army.healthMaxHp) });
  return (
    <div className="hp-editor" aria-label="Управление HP">
      <div className="hp-editor-heading"><strong>HP армии</strong><span>{army.healthHp} / {army.healthMaxHp}</span></div>
      <div className="hp-quick-actions">
        <button type="button" aria-label="-5 HP" onClick={() => setHp(army.healthHp - 5)}>−5</button>
        <button type="button" aria-label="-1 HP" onClick={() => setHp(army.healthHp - 1)}>−1</button>
        <input
          aria-label={`Текущее HP ${army.name}`}
          type="number"
          min="0"
          max={army.healthMaxHp}
          step="1"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="button" aria-label="+1 HP" onClick={() => setHp(army.healthHp + 1)}>+1</button>
        <button type="button" aria-label="+5 HP" onClick={() => setHp(army.healthHp + 5)}>+5</button>
      </div>
      <button className="button subtle wide" type="button" disabled={!canSubmit} onClick={() => setHp(parsed)}>Установить HP</button>
    </div>
  );
}

export function ArmyCard({ army, isGM, canEditRoute, canRequestDisband, onAction }: ArmyCardProps) {
  const canChangeRoute = canEditRoute && (army.status === "READY" || army.status === "PAUSED");
  const invalidMessage = movementDenialMessage(army.routeInvalidReason);
  const encirclementDamage = Math.ceil(army.healthMaxHp * 0.1);
  const hasRoute = army.routeCellCount > 0;
  return (
    <article className={`army-card${!army.supplied ? " army-card-warning" : ""}`}>
      <div className="army-card-heading">
        <div className="army-identity">
          <h3>{army.name}</h3>
          <p>{army.sideName}</p>
        </div>
        <div className="status-stack">
          <span className={`status status-${army.status.toLowerCase()}`}>{STATUS[army.status]}</span>
          {army.atWar && <span className="status status-war">Война</span>}
        </div>
      </div>

      <div className="army-stat-row" aria-label="Параметры армии">
        <div className="army-stat"><span>♥ HP</span><strong>{army.healthHp} / {army.healthMaxHp}</strong></div>
        <div className="army-stat"><span>⬡ ОП</span><strong>{formatMovementUnits(army.movementRemainingUnits)} / {formatMovementUnits(army.movementMaxUnits)}</strong></div>
      </div>

      <div className="army-state-line">
        <span className={army.supplied ? "state-good" : "state-warning"}>{army.supplied ? "✓ Снабжение" : "⚠ Окружена"}</span>
        <span>{hasRoute ? `Маршрут: ${formatMovementUnits(army.routeCostUnits)} ОП` : "Маршрут не задан"}</span>
      </div>

      {!army.supplied && <p className="route-warning">В начале следующего хода: −{encirclementDamage} HP. Лечение недоступно.</p>}
      {army.disbandPending && <p className="route-warning">⚠ Будет распущена в начале следующего хода. Отменить роспуск нельзя.</p>}
      {army.routeRequiresReplan && <p className="route-warning">⚠ Старый маршрут нужно проложить заново по стратегической сетке.</p>}
      {invalidMessage && <p className="route-warning">⚠ {invalidMessage}</p>}

      {canChangeRoute && (
        <div className="card-actions primary-card-action" aria-label="Маршрут армии">
          <button className="button primary wide" type="button" onClick={() => onAction({ type: "EDIT_ROUTE", armyId: army.id })}>{hasRoute ? "Изменить маршрут" : "Проложить маршрут"}</button>
          {army.route.length > 0 && <button type="button" onClick={() => onAction({ type: "CLEAR_ROUTE", armyId: army.id })}>Очистить</button>}
        </div>
      )}

      {isGM && <ArmyHealthEditor army={army} onAction={onAction} />}

      {(isGM || canRequestDisband) && (
        <details className="army-more">
          <summary>Дополнительные действия</summary>
          <div className="army-control-groups">
            {isGM && army.status === "MOVING" && <div className="card-actions" aria-label="Движение армии"><button type="button" onClick={() => onAction({ type: "PAUSE_ARMY", armyId: army.id })}>Пауза</button><button type="button" onClick={() => onAction({ type: "STOP_ARMY", armyId: army.id })}>Стоп</button></div>}
            {canRequestDisband && !army.disbandPending && <div className="card-actions"><button className="button danger subtle" type="button" onClick={() => onAction({ type: "REQUEST_ARMY_DISBAND", armyId: army.id })}>Распустить армию</button></div>}
            {isGM && <div className="card-actions"><button type="button" onClick={() => onAction({ type: "UNREGISTER_ARMY", armyId: army.id })}>Снять регистрацию</button></div>}
          </div>
        </details>
      )}
    </article>
  );
}
