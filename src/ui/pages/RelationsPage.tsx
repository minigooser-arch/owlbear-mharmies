import type { Side, SideRelation } from "../../shared/types";
import type { UiCommand } from "../state/useExtensionState";

export function RelationsPage({ sides, relations, onAction }: { sides: readonly Side[]; relations: Readonly<Record<string, Record<string, SideRelation>>>; onAction(command: UiCommand): void }) {
  return (
    <section><div className="section-heading"><div><p className="eyebrow">Дипломатия</p><h2>Отношения</h2></div></div>
      <div className="card-list">
        {sides.flatMap((left, index) => sides.slice(index + 1).map((right) => (
          <article className="relation-row" key={`${left.id}-${right.id}`}>
            <span>{left.name}</span><span>↔</span><span>{right.name}</span>
            <select aria-label={`${left.name} и ${right.name}`} value={relations[left.id]?.[right.id] ?? "NEUTRAL"} onChange={(event) => onAction({ type: "SET_RELATION", leftSideId: left.id, rightSideId: right.id, relation: event.target.value as SideRelation })}>
              <option value="ALLY">Союз</option><option value="NEUTRAL">Нейтралитет</option><option value="ENEMY">Война</option>
            </select>
          </article>
        )))}
      </div>
    </section>
  );
}
