import { useEffect, useMemo, useState } from "react";
import type { Side, StrategicCity } from "../../shared/types";
import { ArmyCard } from "../components/ArmyCard";
import type { ArmyView, TransportEmbarkRequestView, UiCommand } from "../state/useExtensionState";

interface ArmiesPageProps {
  armies: readonly ArmyView[];
  sides: readonly Side[];
  role: "GM" | "PLAYER";
  playerId: string;
  leaderSideIds: ReadonlySet<string>;
  strategicCities?: readonly StrategicCity[];
  pendingTransportEmbarkRequests?: readonly TransportEmbarkRequestView[];
  onAction(command: UiCommand): void;
}

export function ArmiesPage({
  armies,
  sides,
  role,
  leaderSideIds,
  strategicCities = [],
  pendingTransportEmbarkRequests = [],
  onAction
}: ArmiesPageProps) {
  const [query, setQuery] = useState("");
  const [filterSideId, setFilterSideId] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "MOVING" | "IN_BATTLE" | "ENCIRCLED">("ALL");
  const [registrationSideId, setRegistrationSideId] = useState(sides[0]?.id ?? "");
  const [creationOpen, setCreationOpen] = useState(false);
  useEffect(() => {
    if (!focusArmyId) return;
    const army = armies.find((entry) => entry.id === focusArmyId);
    if (!army) return;
    setQuery(army.name);
    setFilterSideId("ALL");
    setStatusFilter("ALL");
  }, [focusArmyId, armies]);
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
  const availableCities = strategicCities.filter((city) =>
    (role === "GM" || (city.factionInfluenceId !== null && leaderSideIds.has(city.factionInfluenceId))) &&
    (city.buildings ?? []).some((building) => building.type === "MILITARY_DEPARTMENT")
  );
  const filtered = useMemo(
    () => armies.filter((army) =>
      (selectedFilterSideId === "ALL" || army.sideId === selectedFilterSideId) &&
      (statusFilter === "ALL" || (statusFilter === "ENCIRCLED" ? !army.supplied : army.status === statusFilter)) &&
      army.name.toLocaleLowerCase("ru").includes(query.toLocaleLowerCase("ru"))
    ),
    [armies, query, selectedFilterSideId, statusFilter]
  );

  return (
    <section aria-labelledby="armies-title" className="wiki-page armies-page">
      <div className="section-heading wiki-page-heading">
        <div>
          <p className="eyebrow">Войска</p>
          <h2 id="armies-title">Армии</h2>
          <p className="page-description">Управление сухопутными соединениями, маршрутами и состоянием войск.</p>
        </div>
        <span className="count-pill" data-testid="army-count">{armies.length}</span>
      </div>

      <div className="army-toolbar" role="search" aria-label="Поиск и фильтры армий">
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
      </div>

      {(role === "GM" || availableCities.length > 0) && <button type="button" className="button subtle creation-toggle" aria-expanded={creationOpen} onClick={() => setCreationOpen((value) => !value)}>{creationOpen ? "Скрыть создание войск" : "+ Создать армию"}</button>}

      {creationOpen && role === "GM" && (
        <section className="registration-card" aria-label="Регистрация армии">
          <div className="registration-copy">
            <span className="registration-kicker">Новая армия</span>
            <strong>Зарегистрировать выбранный токен</strong>
            <small>Выберите фракцию и назначьте выделенный объект на карте армией.</small>
          </div>
          <div className="registration-actions">
            <select
              aria-label="Сторона новой армии"
              value={selectedRegistrationSideId}
              disabled={sides.length === 0}
              onChange={(event) => setRegistrationSideId(event.target.value)}
            >
              {sides.map((side) => <option key={side.id} value={side.id}>{side.name}</option>)}
            </select>
            <button
              className="button primary"
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
        </section>
      )}

      {creationOpen && availableCities.length > 0 && (
        <section className="registration-card" aria-label="Создание армии через город">
          <div className="registration-copy">
            <span className="registration-kicker">Городское формирование</span>
            <strong>Создать армию из ассета фракции</strong>
            <small>Выберите город с действующим Военным ведомством. Токен армии появится в центре города.</small>
          </div>
          <div className="registration-actions">
            <select aria-label="Город формирования армии" defaultValue={availableCities[0]?.id}>
              {availableCities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}
            </select>
            <button
              className="button primary"
              type="button"
              onClick={(event) => {
                const select = event.currentTarget.previousElementSibling as HTMLSelectElement | null;
                const cityId = select?.value ?? availableCities[0]?.id;
                const city = availableCities.find((candidate) => candidate.id === cityId);
                if (city?.factionInfluenceId) onAction({ type: "CREATE_SELECTED_CITY_ARMY", cityId: city.id, sideId: city.factionInfluenceId });
              }}
            >
              Создать армию
            </button>
          </div>
        </section>
      )}

      {pendingTransportEmbarkRequests.length > 0 && (
        <section className="registration-card" aria-labelledby="transport-consent-title">
          <div className="registration-copy">
            <span className="registration-kicker">Перевозка войск</span>
            <h3 id="transport-consent-title">Запросы на перевозку</h3>
            <small>Иностранный транспорт ожидает согласия на погрузку вашей армии.</small>
          </div>
          <div className="registration-actions">
            {pendingTransportEmbarkRequests.map((request) => (
              <div key={request.id} className="transport-consent-request">
                <span>{request.armyName} → {request.shipName} · {request.shipSideName}</span>
                <button
                  className="button primary"
                  type="button"
                  aria-label={`Разрешить погрузку ${request.armyName} на ${request.shipName}`}
                  onClick={() => onAction({
                    type: "ACCEPT_EMBARK_ARMY",
                    embarkRequestId: request.id,
                    shipId: request.shipId,
                    armyId: request.armyId
                  })}
                >
                  Разрешить погрузку
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="card-list army-list">
        {filtered.map((army) => {
          const side = sides.find((candidate) => candidate.id === army.sideId);
          return (
            <ArmyCard
              key={army.id}
              army={army}
              sideColor={side?.color ?? "#687F91"}
              isGM={role === "GM"}
              canEditRoute={role === "GM" || leaderSideIds.has(army.sideId)}
              canRequestDisband={role === "GM" || leaderSideIds.has(army.sideId)}
              onAction={onAction}
            />
          );
        })}
        {filtered.length === 0 && <p className="empty empty-panel">Подходящих армий нет.</p>}
      </div>
    </section>
  );
}
