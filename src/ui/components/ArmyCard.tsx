import type { ArmyView, UiCommand } from "../state/useExtensionState";

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
  onAction(command: UiCommand): void;
}

export function ArmyCard({ army, isGM, canEditRoute, onAction }: ArmyCardProps) {
  const canChangeRoute = canEditRoute && army.status === "READY";
  return (
    <article className="army-card">
      <div className="army-card-heading">
        <div>
          <h3>{army.name}</h3>
          <p>{army.sideName}</p>
        </div>
        <span className={`status status-${army.status.toLowerCase()}`}>{STATUS[army.status]}</span>
      </div>
      <dl className="army-details">
        <div><dt>Точек маршрута</dt><dd>{army.route.length}</dd></div>
      </dl>
      {(canChangeRoute || isGM) && (
        <div className="army-control-groups">
          {canChangeRoute && (
            <div className="card-actions" aria-label="Маршрут армии">
              <button type="button" onClick={() => onAction({ type: "EDIT_ROUTE", armyId: army.id })}>Маршрут</button>
              {army.route.length > 0 && (
                <button type="button" onClick={() => onAction({ type: "CLEAR_ROUTE", armyId: army.id })}>Очистить</button>
              )}
            </div>
          )}
          {isGM && (
            <div className="card-actions" aria-label="Движение армии">
              {army.status === "READY" && (
                <button type="button" onClick={() => onAction({ type: "START_ARMY", armyId: army.id })}>Старт</button>
              )}
              {army.status === "MOVING" && (
                <button type="button" onClick={() => onAction({ type: "PAUSE_ARMY", armyId: army.id })}>Пауза</button>
              )}
              {army.status === "PAUSED" && (
                <button type="button" onClick={() => onAction({ type: "RESUME_ARMY", armyId: army.id })}>Продолжить</button>
              )}
              {army.status !== "READY" && (
                <button type="button" onClick={() => onAction({ type: "STOP_ARMY", armyId: army.id })}>Стоп</button>
              )}
            </div>
          )}
          {isGM && (
            <div className="card-actions">
              <button type="button" onClick={() => onAction({ type: "UNREGISTER_ARMY", armyId: army.id })}>Снять регистрацию</button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
