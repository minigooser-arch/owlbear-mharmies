import type { Side } from "../../shared/types";
import type { UiCommand } from "../state/useExtensionState";

export function SidesPage({ sides, onAction }: { sides: readonly Side[]; onAction(command: UiCommand): void }) {
  return (
    <section><div className="section-heading"><div><p className="eyebrow">Управление</p><h2>Стороны</h2></div></div>
      <div className="card-list">
        {sides.map((side) => (
          <article className="settings-card" key={side.id}>
            <span className="color-dot" style={{ background: side.color }} />
            <div><h3>{side.name}</h3><p>Игроков: {side.playerIds.length}</p></div>
            <button type="button" className="icon-button" aria-label={`Удалить ${side.name}`} onClick={() => onAction({ type: "DELETE_SIDE", sideId: side.id })}>×</button>
          </article>
        ))}
        <button type="button" className="button primary" onClick={() => onAction({ type: "CREATE_SIDE" })}>Добавить сторону</button>
      </div>
    </section>
  );
}
