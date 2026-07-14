import type { ArmyView, UiCommand } from "../state/useExtensionState";

const STATUS: Record<ArmyView["status"], string> = {
  READY: "Готова",
  MOVING: "Движется",
  PAUSED: "На паузе",
  IN_BATTLE: "В бою"
};

interface ArmyCardProps {
  army: ArmyView;
  role: "GM" | "PLAYER";
  playerId: string;
  onAction(command: UiCommand): void;
}

export function ArmyCard({ army, role, playerId, onAction }: ArmyCardProps) {
  const canControl = role === "GM" || army.directOwnerPlayerId === playerId;
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
        <div><dt>Владелец</dt><dd>{army.directOwnerPlayerId ?? "Ведущий"}</dd></div>
      </dl>
      {canControl && (
        <div className="card-actions">
          {army.status === "MOVING" ? (
            <button type="button" onClick={() => onAction({ type: "PAUSE_ARMY", armyId: army.id })}>Пауза</button>
          ) : (
            <button type="button" onClick={() => onAction({ type: "START_ARMY", armyId: army.id })}>Старт</button>
          )}
          <button type="button" onClick={() => onAction({ type: "EDIT_ROUTE", armyId: army.id })}>Маршрут</button>
        </div>
      )}
    </article>
  );
}
