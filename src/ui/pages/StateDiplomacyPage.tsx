import type { StateEntity, StateRelations } from "../../shared/types";
import type { UiCommand } from "../state/useExtensionState";

function relation(stateRelations: StateRelations, from: string, to: string) {
  return stateRelations[from]?.[to] ?? { militaryAccess: false, atWar: false };
}

export function StateDiplomacyPage({ states, stateRelations, onAction }: {
  states: readonly StateEntity[];
  stateRelations: StateRelations;
  onAction(command: UiCommand): void;
}) {
  const pairs = states.flatMap((left, index) => states.slice(index + 1).map((right) => [left, right] as const));
  return <section>
    <div className="section-heading"><div><p className="eyebrow">Межгосударственные отношения</p><h2>Дипломатия государств</h2></div></div>
    <div className="card-list side-list">
      {pairs.map(([left, right]) => {
        const leftToRight = relation(stateRelations, left.id, right.id);
        const rightToLeft = relation(stateRelations, right.id, left.id);
        return <article className="side-card" key={`${left.id}/${right.id}`}>
          <h3>{left.name} — {right.name}</h3>
          <label><input type="checkbox" aria-label={`Проход ${left.name} → ${right.name}`} checked={leftToRight.militaryAccess} onChange={(event) => onAction({ type: "SET_STATE_MILITARY_ACCESS", fromStateId: left.id, toStateId: right.id, allowed: event.target.checked })} />Проход {left.name} → {right.name}</label>
          <label><input type="checkbox" aria-label={`Проход ${right.name} → ${left.name}`} checked={rightToLeft.militaryAccess} onChange={(event) => onAction({ type: "SET_STATE_MILITARY_ACCESS", fromStateId: right.id, toStateId: left.id, allowed: event.target.checked })} />Проход {right.name} → {left.name}</label>
          <label><input type="checkbox" aria-label={`Война ${left.name} ↔ ${right.name}`} checked={leftToRight.atWar || rightToLeft.atWar} onChange={(event) => onAction({ type: "SET_STATE_WAR", leftStateId: left.id, rightStateId: right.id, atWar: event.target.checked })} />Война {left.name} ↔ {right.name}</label>
        </article>;
      })}
      {pairs.length === 0 && <p className="empty">Для межгосударственных отношений нужно минимум два государства.</p>}
    </div>
  </section>;
}
