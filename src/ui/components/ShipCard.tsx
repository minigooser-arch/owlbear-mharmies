import type { ShipFacing } from "../../shared/types";
import type { ShipView, UiCommand } from "../state/useExtensionState";

const FACING_LABELS: Record<ShipFacing, string> = {
  NORTH: "Север",
  EAST: "Восток",
  SOUTH: "Юг",
  WEST: "Запад"
};

export function ShipCard({
  ship,
  sideColor,
  isGM,
  embarkedArmyName,
  onAction
}: {
  ship: ShipView;
  sideColor: string;
  isGM: boolean;
  embarkedArmyName?: string;
  onAction(command: UiCommand): void;
}) {
  const inBattle = ship.status === "IN_NAVAL_BATTLE";
  const broadside = ship.normalDice > 0
    ? `${ship.normalDice}d6 · дальность ${ship.normalRangeMin === ship.normalRangeMax ? ship.normalRangeMin : `${ship.normalRangeMin}–${ship.normalRangeMax}`}`
    : "Обычный залп недоступен";
  const route = ship.plannedRouteCellCount > 0
    ? `Маршрут: ${ship.plannedRouteCellCount} кл.`
    : "Маршрут не задан";

  return (
    <article className={`ship-card${inBattle ? " ship-card-battle" : ""}`}>
      <span className="ship-accent" style={{ background: sideColor }} aria-hidden="true" />
      <div className="ship-card-heading">
        <div className="ship-identity">
          <h3 style={{ color: sideColor }}>{ship.name}</h3>
          <p><strong>{ship.className}</strong> · {ship.sideName}</p>
        </div>
        <span className={`status ${inBattle ? "status-in_battle" : "status-ready"}`}>
          {inBattle ? "В морском бою" : "Готов"}
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

      {isGM && (
        <details className="army-more ship-management">
          <summary>Управление</summary>
          <div className="card-actions">
            <button className="button danger subtle" type="button" onClick={() => onAction({ type: "UNREGISTER_SHIP", shipId: ship.id })}>
              Снять регистрацию
            </button>
          </div>
        </details>
      )}
    </article>
  );
}
