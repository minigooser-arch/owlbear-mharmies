import { useEffect, useState } from "react";
import type { ShipFacing } from "../../shared/types";
import type { ShipView, UiCommand } from "../state/useExtensionState";

const FACING_LABELS: Record<ShipFacing, string> = {
  NORTH: "Север",
  EAST: "Восток",
  SOUTH: "Юг",
  WEST: "Запад"
};

function clampHp(value: number, maxHp: number): number {
  return Math.max(0, Math.min(maxHp, Math.round(value)));
}

function ShipDetectionEditor({
  ship,
  onAction
}: {
  ship: ShipView;
  onAction(command: UiCommand): void;
}) {
  const [draft, setDraft] = useState(String(ship.effectiveDetectionRange));
  useEffect(() => setDraft(String(ship.effectiveDetectionRange)), [ship.effectiveDetectionRange]);
  const parsed = Number(draft);
  const canSubmit =
    draft.trim() !== "" &&
    Number.isFinite(parsed) &&
    parsed >= 0 &&
    parsed !== ship.effectiveDetectionRange;

  return (
    <div className="hp-editor" aria-label="Управление дальностью обнаружения корабля">
      <div className="hp-editor-heading">
        <strong>Дальность обнаружения</strong>
        <span>
          {ship.detectionOverride === null
            ? `Общая дальность: ${ship.effectiveDetectionRange} кл.`
            : `Индивидуальная: ${ship.effectiveDetectionRange} кл.`}
        </span>
      </div>
      <input
        aria-label={`Дальность обнаружения ${ship.name}`}
        type="number"
        min="0"
        step="any"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <button
        className="button subtle wide"
        type="button"
        disabled={!canSubmit}
        onClick={() => onAction({
          type: "SET_SHIP_DETECTION_OVERRIDE",
          shipId: ship.id,
          detectionOverride: parsed
        })}
      >
        Установить дальность обнаружения
      </button>
      <button
        className="button subtle wide"
        type="button"
        disabled={ship.detectionOverride === null}
        onClick={() => onAction({
          type: "SET_SHIP_DETECTION_OVERRIDE",
          shipId: ship.id,
          detectionOverride: null
        })}
      >
        Использовать общую дальность
      </button>
    </div>
  );
}

function ShipHealthEditor({
  ship,
  onAction
}: {
  ship: ShipView;
  onAction(command: UiCommand): void;
}) {
  const [draft, setDraft] = useState(String(ship.hp));
  useEffect(() => setDraft(String(ship.hp)), [ship.hp]);
  const parsed = Number(draft);
  const canSubmit =
    Number.isInteger(parsed) &&
    parsed >= 0 &&
    parsed <= ship.maxHp &&
    parsed !== ship.hp;
  const setHp = (hp: number) =>
    onAction({ type: "SET_SHIP_HP", shipId: ship.id, hp: clampHp(hp, ship.maxHp) });

  return (
    <div className="hp-editor" aria-label="Управление HP корабля">
      <div className="hp-editor-heading">
        <strong>HP корабля</strong>
        <span>{ship.hp} / {ship.maxHp}</span>
      </div>
      <div className="hp-quick-actions">
        <button type="button" aria-label="-5 HP корабля" onClick={() => setHp(ship.hp - 5)}>−5</button>
        <button type="button" aria-label="-1 HP корабля" onClick={() => setHp(ship.hp - 1)}>−1</button>
        <input
          aria-label={`Текущее HP ${ship.name}`}
          type="number"
          min="0"
          max={ship.maxHp}
          step="1"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="button" aria-label="+1 HP корабля" onClick={() => setHp(ship.hp + 1)}>+1</button>
        <button type="button" aria-label="+5 HP корабля" onClick={() => setHp(ship.hp + 5)}>+5</button>
      </div>
      <button
        className="button subtle wide"
        type="button"
        disabled={!canSubmit}
        onClick={() => setHp(parsed)}
      >
        Установить HP корабля
      </button>
    </div>
  );
}

export function ShipCard({
  ship,
  sideColor,
  isGM,
  canPlanRoute,
  embarkedArmyName,
  onAction
}: {
  ship: ShipView;
  sideColor: string;
  isGM: boolean;
  canPlanRoute: boolean;
  embarkedArmyName?: string;
  onAction(command: UiCommand): void;
}) {
  const destroyed = ship.hp <= 0;
  const inBattle = ship.status === "IN_NAVAL_BATTLE";
  const broadside = ship.normalDice > 0
    ? `${ship.normalDice}d6 · дальность ${ship.normalRangeMin === ship.normalRangeMax ? ship.normalRangeMin : `${ship.normalRangeMin}–${ship.normalRangeMax}`}`
    : "Обычный залп недоступен";
  const route = ship.plannedRouteCellCount > 0
    ? `Маршрут: ${ship.plannedRouteCellCount} кл.`
    : "Маршрут не задан";
  const routeUnavailable = destroyed || inBattle || ship.plannedRouteCellCount > 0 || ship.movementRemaining <= 0;
  const canControlTactical = canPlanRoute && !destroyed && inBattle && ship.isCurrentNavalTurn === true;
  const tacticalMovementDisabled =
    (ship.navalMovementRemaining ?? 0) <= 0 || ship.navalActionUsed === true;
  const statusClass = destroyed
    ? "status-destroyed"
    : inBattle
      ? "status-in_battle"
      : "status-ready";
  const statusText = destroyed
    ? "Уничтожен"
    : inBattle
      ? "В морском бою"
      : "Готов";

  return (
    <article className={`ship-card${inBattle ? " ship-card-battle" : ""}`}>
      <span className="ship-accent" style={{ background: sideColor }} aria-hidden="true" />
      <div className="ship-card-heading">
        <div className="ship-identity">
          <h3 style={{ color: sideColor }}>{ship.name}</h3>
          <p><strong>{ship.className}</strong> · {ship.sideName}</p>
        </div>
        <span className={`status ${statusClass}`}>
          {statusText}
        </span>
      </div>

      <div className="ship-stat-grid" aria-label={`Параметры корабля ${ship.name}`}>
        <div><span>Прочность</span><strong>{ship.hp} / {ship.maxHp} HP</strong>{ship.temporaryHp > 0 && <small>+{ship.temporaryHp} врем.</small>}</div>
        <div><span>Броня</span><strong>{ship.armor}</strong></div>
        <div><span>ОП</span><strong>{ship.movementRemaining} / {ship.movementMax} ОП</strong></div>
      </div>

      <div className="ship-facts">
        <span><strong>Курс</strong>{FACING_LABELS[ship.facing]}</span>
        <span><strong>Бортовой залп</strong>{broadside}</span>
        <span><strong>Переход</strong>{route}</span>
        {ship.embarkedArmyId && <span><strong>На борту</strong>{embarkedArmyName ?? "Перевозимая армия"}</span>}
      </div>

      {canControlTactical && (
        <div className="ship-tactical-panel" aria-label={`Тактическое управление ${ship.name}`}>
          <div className="ship-tactical-status">
            Раунд {ship.navalRoundNumber ?? "?"} · ОП {ship.navalMovementRemaining ?? 0}
          </div>
          <div className="card-actions ship-tactical-actions">
            <button
              className="button ghost"
              type="button"
              disabled={tacticalMovementDisabled}
              onClick={() => onAction({ type: "NAVAL_TURN_SHIP", shipId: ship.id, direction: "LEFT" })}
            >
              Повернуть влево
            </button>
            <button
              className="button primary"
              type="button"
              disabled={tacticalMovementDisabled}
              onClick={() => onAction({ type: "NAVAL_MOVE_FORWARD", shipId: ship.id })}
            >
              Вперёд
            </button>
            <button
              className="button ghost"
              type="button"
              disabled={tacticalMovementDisabled}
              onClick={() => onAction({ type: "NAVAL_TURN_SHIP", shipId: ship.id, direction: "RIGHT" })}
            >
              Повернуть вправо
            </button>
          </div>
          <button
            className="button subtle wide"
            type="button"
            onClick={() => onAction({ type: "END_NAVAL_SHIP_TURN", shipId: ship.id })}
          >
            Завершить ход
          </button>
        </div>
      )}

      {canPlanRoute && (
        <div className="card-actions ship-route-actions">
          <button
            className="button primary"
            type="button"
            disabled={routeUnavailable}
            onClick={() => onAction({ type: "EDIT_SHIP_ROUTE", shipId: ship.id })}
          >
            Проложить переход
          </button>
        </div>
      )}

      {isGM && (
        <details className="army-more ship-management">
          <summary>Управление</summary>
          <div className="army-control-groups">
            <ShipHealthEditor ship={ship} onAction={onAction} />
            <ShipDetectionEditor ship={ship} onAction={onAction} />
            <div className="card-actions">
              <button className="button danger subtle" type="button" onClick={() => onAction({ type: "UNREGISTER_SHIP", shipId: ship.id })}>
                Снять регистрацию
              </button>
            </div>
          </div>
        </details>
      )}
    </article>
  );
}