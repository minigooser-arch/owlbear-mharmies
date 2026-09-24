import { useEffect, useMemo, useState } from "react";
import type { StateEntity, StateRelations } from "../../shared/types";
import type { UiCommand } from "../state/useExtensionState";

type RelationFilter = "ALL" | "WAR" | "ACCESS";

function relation(stateRelations: StateRelations, from: string, to: string) {
  return stateRelations[from]?.[to] ?? { militaryAccess: false, atWar: false };
}

export function StateDiplomacyPage({ states, stateRelations, onAction }: {
  states: readonly StateEntity[];
  stateRelations: StateRelations;
  onAction(command: UiCommand): void;
}) {
  const [selectedStateId, setSelectedStateId] = useState(states[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RelationFilter>("ALL");
  const [expandedStateId, setExpandedStateId] = useState("");
  const selectedState = states.find((state) => state.id === selectedStateId) ?? states[0];
  const effectiveSelectedId = selectedState?.id ?? "";

  useEffect(() => {
    if (selectedStateId !== effectiveSelectedId) setSelectedStateId(effectiveSelectedId);
    if (expandedStateId && !states.some((state) => state.id === expandedStateId)) setExpandedStateId("");
  }, [effectiveSelectedId, expandedStateId, selectedStateId, states]);

  const counterpartRows = useMemo(() => {
    if (!selectedState) return [];
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return states.filter((state) => state.id !== selectedState.id).filter((counterpart) => {
      if (!counterpart.name.toLocaleLowerCase().includes(normalizedQuery)) return false;
      const outward = relation(stateRelations, selectedState.id, counterpart.id);
      const inward = relation(stateRelations, counterpart.id, selectedState.id);
      if (filter === "WAR") return outward.atWar || inward.atWar;
      if (filter === "ACCESS") return outward.militaryAccess || inward.militaryAccess;
      return true;
    });
  }, [filter, query, selectedState, stateRelations, states]);

  const heading = <div className="section-heading">
    <div><p className="eyebrow">Межгосударственные отношения</p><h2>Дипломатия государств</h2></div>
  </div>;
  if (states.length < 2 || !selectedState) {
    return <section className="state-diplomacy" aria-label="Межгосударственные отношения">
      {heading}
      <p className="empty">Для межгосударственных отношений нужно минимум два государства.</p>
    </section>;
  }

  return <section className="state-diplomacy" aria-label="Межгосударственные отношения">
      {heading}
      <div className="diplomacy-filterbar">
        <label>
          Государство
          <select aria-label="Государство для дипломатии" value={effectiveSelectedId} onChange={(event) => {
            setSelectedStateId(event.target.value);
            setExpandedStateId("");
          }}>
            {states.map((state) => <option key={state.id} value={state.id}>{state.name}</option>)}
          </select>
        </label>
        <label>
          Поиск
          <input aria-label="Поиск государств" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Название государства" />
        </label>
        <label>
          Показать
          <select aria-label="Фильтр отношений" value={filter} onChange={(event) => setFilter(event.target.value as RelationFilter)}>
            <option value="ALL">Все отношения</option>
            <option value="WAR">Война</option>
            <option value="ACCESS">Есть военный доступ</option>
          </select>
        </label>
      </div>
      <div className="card-list diplomacy-list">
        {counterpartRows.map((counterpart) => {
          const outward = relation(stateRelations, selectedState.id, counterpart.id);
          const inward = relation(stateRelations, counterpart.id, selectedState.id);
          const atWar = outward.atWar || inward.atWar;
          const expanded = expandedStateId === counterpart.id;
          const directions = [
            ...(outward.militaryAccess ? [`${selectedState.name} → ${counterpart.name}`] : []),
            ...(inward.militaryAccess ? [`${counterpart.name} → ${selectedState.name}`] : [])
          ];
          return <article className="diplomacy-row" key={counterpart.id}>
            <button
              className="diplomacy-row-trigger"
              type="button"
              aria-label={`Настроить отношения: ${counterpart.name}`}
              aria-expanded={expanded}
              onClick={() => setExpandedStateId(expanded ? "" : counterpart.id)}
            >
              <span className="diplomacy-row-main">
                <strong>{counterpart.name}</strong>
                <span>{atWar ? "Война" : "Мир"}</span>
              </span>
              <span className="diplomacy-row-summary">
                {directions.length ? `Доступ: ${directions.join("; ")}` : "Военного доступа нет"}
              </span>
              <span aria-hidden="true" className="diplomacy-row-chevron">{expanded ? "−" : "+"}</span>
            </button>
            {expanded ? <div className="diplomacy-controls">
              <label>
                <input type="checkbox" aria-label={`Доступ войскам ${selectedState.name} на территорию ${counterpart.name}`} checked={outward.militaryAccess} onChange={(event) => onAction({
                  type: "SET_STATE_MILITARY_ACCESS", fromStateId: selectedState.id, toStateId: counterpart.id, allowed: event.target.checked
                })} />
                Войска {selectedState.name} могут входить на территорию {counterpart.name}
              </label>
              <label>
                <input type="checkbox" aria-label={`Доступ войскам ${counterpart.name} на территорию ${selectedState.name}`} checked={inward.militaryAccess} onChange={(event) => onAction({
                  type: "SET_STATE_MILITARY_ACCESS", fromStateId: counterpart.id, toStateId: selectedState.id, allowed: event.target.checked
                })} />
                Войска {counterpart.name} могут входить на территорию {selectedState.name}
              </label>
              <label>
                <input type="checkbox" aria-label={`Война ${selectedState.name} — ${counterpart.name}`} checked={atWar} onChange={(event) => onAction({
                  type: "SET_STATE_WAR", leftStateId: selectedState.id, rightStateId: counterpart.id, atWar: event.target.checked
                })} />
                Состояние войны между государствами
              </label>
            </div> : null}
          </article>;
        })}
        {counterpartRows.length === 0 ? <p className="empty">По этим условиям государства не найдены.</p> : null}
      </div>
  </section>;
}
