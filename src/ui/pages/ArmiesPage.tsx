import { useMemo, useState } from "react";
import { ArmyCard } from "../components/ArmyCard";
import type { ArmyView, UiCommand } from "../state/useExtensionState";

interface ArmiesPageProps {
  armies: readonly ArmyView[];
  role: "GM" | "PLAYER";
  playerId: string;
  onAction(command: UiCommand): void;
}

export function ArmiesPage({ armies, role, playerId, onAction }: ArmiesPageProps) {
  const [query, setQuery] = useState("");
  const [side, setSide] = useState("ALL");
  const filtered = useMemo(
    () => armies.filter((army) =>
      (side === "ALL" || army.sideId === side) &&
      army.name.toLocaleLowerCase("ru").includes(query.toLocaleLowerCase("ru"))
    ),
    [armies, query, side]
  );
  const sides = [...new Map(armies.map((army) => [army.sideId, army.sideName])).entries()];
  return (
    <section aria-labelledby="armies-title">
      <div className="section-heading">
        <div><p className="eyebrow">Сцена</p><h2 id="armies-title">Армии</h2></div>
        <span className="count-pill" data-testid="army-count">{armies.length}</span>
      </div>
      <div className="filters">
        <input aria-label="Поиск армий" placeholder="Найти армию" value={query} onChange={(event) => setQuery(event.target.value)} />
        <select aria-label="Фильтр по стороне" value={side} onChange={(event) => setSide(event.target.value)}>
          <option value="ALL">Все стороны</option>
          {sides.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </div>
      <div className="card-list">
        {filtered.map((army) => <ArmyCard key={army.id} army={army} role={role} playerId={playerId} onAction={onAction} />)}
        {filtered.length === 0 && <p className="empty">Подходящих армий нет.</p>}
      </div>
    </section>
  );
}
