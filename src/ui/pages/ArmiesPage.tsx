import { useMemo, useState } from "react";
import type { Side } from "../../shared/types";
import { ArmyCard } from "../components/ArmyCard";
import type { ArmyView, UiCommand } from "../state/useExtensionState";

interface ArmiesPageProps {
  armies: readonly ArmyView[];
  sides: readonly Side[];
  role: "GM" | "PLAYER";
  playerId: string;
  leaderSideIds: ReadonlySet<string>;
  memberSideIds: ReadonlySet<string>;
  onAction(command: UiCommand): void;
}

export function ArmiesPage({
  armies,
  sides,
  role,
  leaderSideIds,
  memberSideIds,
  onAction
}: ArmiesPageProps) {
  const [query, setQuery] = useState("");
  const [filterSideId, setFilterSideId] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "MOVING" | "IN_BATTLE" | "ENCIRCLED">("ALL");
  const [registrationSideId, setRegistrationSideId] = useState(sides[0]?.id ?? "");
  const filterSides = useMemo(() => {
    if (role === "GM") return sides;
    const authorizedSideIds = new Set(armies.map((army) => army.sideId));
    return sides.filter((side) => authorizedSideIds.has(side.id));
  }, [armies, role, sides]);
  const selectedFilterSideId = filterSideId === "ALL" ||
    filterSides.some((side) => side.id === filterSideId)
    ? filterSideId
    : "ALL";
  const selectedRegistrationSideId = sides.some((side) => side.id === registrationSideId)
    ? registrationSideId
    : (sides[0]?.id ?? "");
  const filtered = useMemo(
    () => armies.filter((army) =>
      (selectedFilterSideId === "ALL" || army.sideId === selectedFilterSideId) &&
      (statusFilter === "ALL" || (statusFilter === "ENCIRCLED" ? !army.supplied : army.status === statusFilter)) &&
      army.name.toLocaleLowerCase("ru").includes(query.toLocaleLowerCase("ru"))
    ),
    [armies, query, selectedFilterSideId, statusFilter]
  );
  return (
    <section aria-labelledby="armies-title">
      <div className="section-heading">
        <div><p className="eyebrow">Сцена</p><h2 id="armies-title">Армии</h2></div>
        <span className="count-pill" data-testid="army-count">{armies.length}</span>
      </div>
      <div className="filters">
        <input aria-label="Поиск армий" placeholder="Найти армию" value={query} onChange={(event) => setQuery(event.target.value)} />
        <select aria-label="Фильтр по стороне" value={selectedFilterSideId} onChange={(event) => setFilterSideId(event.target.value)}>
          <option value="ALL">Все стороны</option>
          {filterSides.map((side) => <option key={side.id} value={side.id}>{side.name}</option>)}
        </select>
      </div>
      <div className="filter-chips" aria-label="Фильтр по статусу">
        {([
          ["ALL", "Все"], ["MOVING", "В движении"], ["IN_BATTLE", "В бою"], ["ENCIRCLED", "Окружены"]
        ] as const).map(([value, label]) => <button type="button" key={value} className={statusFilter === value ? "active" : ""} onClick={() => setStatusFilter(value)}>{label}</button>)}
      </div>
      {role === "GM" && (
        <div className="filters" aria-label="Регистрация армии">
          <select
            aria-label="Сторона новой армии"
            value={selectedRegistrationSideId}
            disabled={sides.length === 0}
            onChange={(event) => setRegistrationSideId(event.target.value)}
          >
            {sides.map((side) => <option key={side.id} value={side.id}>{side.name}</option>)}
          </select>
          <button
            type="button"
            disabled={sides.length === 0}
            onClick={() => {
              if (selectedRegistrationSideId) {
                onAction({ type: "REGISTER_SELECTED_ARMY", sideId: selectedRegistrationSideId });
              }
            }}
          >
            Сделать армией
          </button>
        </div>
      )}
      <div className="card-list">
        {filtered.map((army) => (
          <ArmyCard
            key={army.id}
            army={army}
            isGM={role === "GM"}
            canEditRoute={role === "GM" || leaderSideIds.has(army.sideId)}
            canRequestDisband={role === "GM" || memberSideIds.has(army.sideId)}
            onAction={onAction}
          />
        ))}
        {filtered.length === 0 && <p className="empty">Подходящих армий нет.</p>}
      </div>
    </section>
  );
}
