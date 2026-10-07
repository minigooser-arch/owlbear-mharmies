import type { Side, StrategicCity, StateEntity, TurnState, SideRelation } from "../../shared/types";
import { ArmyCard } from "./ArmyCard";
import { ShipCard } from "./ShipCard";
import type { ArmyView, ShipView, UiCommand } from "../state/useExtensionState";
import type { MapEntityFocus } from "../../owlbear/entityFocus";

const BUILDING_LABELS: Record<string, string> = {
  MILITARY_DEPARTMENT: "Военное ведомство",
  MILITARY_HOSPITAL: "Военный госпиталь",
  BARRACKS: "Казармы",
  TRAINING_GROUND: "Учебный центр",
  MILITARY_ACADEMY: "Военная академия",
  RAILWAY_STATION: "Железнодорожная станция",
  PORT: "Порт",
  SHIPYARD: "Верфь",
  MARINE_STATION: "Морская станция",
  CANAL: "Канал",
  LIGHTHOUSE: "Маяк",
  BUNKERING_STATION: "Бункеровочная станция",
  SEA_FORT: "Морская крепость",
  COASTAL_BATTERY: "Береговая батарея",
  AERODROME: "Аэродром"
};

function CityInspector({
  city,
  states,
  sides,
  role,
  leaderSideIds,
  onAction
}: {
  city: StrategicCity;
  states: readonly StateEntity[];
  sides: readonly Side[];
  role: "GM" | "PLAYER";
  leaderSideIds: ReadonlySet<string>;
  onAction(command: UiCommand): void;
}) {
  const recognized = states.find((state) => state.id === city.recognizedStateId)?.name ?? city.recognizedStateId;
  const deFacto = states.find((state) => state.id === city.deFactoStateId)?.name ?? city.deFactoStateId;
  const faction = city.factionInfluenceId
    ? sides.find((side) => side.id === city.factionInfluenceId)?.name ?? city.factionInfluenceId
    : "Нет";
  const influenceSideId = city.factionInfluenceId;
  const canCreateArmy = influenceSideId !== null &&
    (role === "GM" || leaderSideIds.has(influenceSideId)) &&
    (city.buildings ?? []).some((building) => building.type === "MILITARY_DEPARTMENT");
  return (
    <div className="entity-city-inspector">
      <div className="entity-inspector-eyebrow">Город</div>
      <h2>{city.name}</h2>
      <p className="entity-inspector-subtitle">{city.isCapital ? "Столица" : "Город"}</p>
      <div className="entity-stat-grid">
        <div><span>Признанная принадлежность</span><strong>{recognized}</strong></div>
        <div><span>Фактический контроль</span><strong>{deFacto}</strong></div>
        <div><span>Влияние фракции</span><strong>{faction}</strong></div>
        <div><span>Клеток</span><strong>{city.cells.length}</strong></div>
      </div>
      <div className="entity-section">
        <h3>Постройки</h3>
        {(city.buildings ?? []).length === 0
          ? <p className="helper-text">Построек нет.</p>
          : <div className="entity-building-list">
              {(city.buildings ?? []).map((building) => (
                <div className="entity-building-row" key={building.id}>
                  <span>{BUILDING_LABELS[building.type] ?? building.type}</span>
                  <small>{building.cell.x},{building.cell.y}</small>
                </div>
              ))}
            </div>}
      </div>
      <div className="entity-section">
        <h3>Положение</h3>
        <p className="helper-text">{city.cells.map((cell) => `${cell.x},${cell.y}`).join(" · ")}</p>
      </div>
      {canCreateArmy && influenceSideId !== null && (
        <div className="entity-section entity-city-actions">
          <h3>Формирование</h3>
          <button
            className="button primary"
            type="button"
            aria-label={`Создать армию в городе ${city.name}`}
            onClick={() => onAction({ type: "CREATE_SELECTED_CITY_ARMY", cityId: city.id, sideId: influenceSideId })}
          >
            Создать армию в городе
          </button>
          <p className="helper-text">Новая армия начнёт формирование с 5 HP.</p>
        </div>
      )}
    </div>
  );
}

export function EntityInspector({
  focus,
  armies,
  ships,
  strategicCities,
  sides,
  states,
  role,
  leaderSideIds,
  relations,
  turnPhase,
  onAction,
  onClose
}: {
  focus: MapEntityFocus;
  armies: readonly ArmyView[];
  ships: readonly ShipView[];
  strategicCities: readonly StrategicCity[];
  sides: readonly Side[];
  states: readonly StateEntity[];
  role: "GM" | "PLAYER";
  leaderSideIds: ReadonlySet<string>;
  relations: Readonly<Record<string, Readonly<Record<string, SideRelation>>>>;
  turnPhase: TurnState["phase"];
  onAction(command: UiCommand): void;
  onClose(): void;
}) {
  const army = focus.type === "ARMY" ? armies.find((candidate) => candidate.id === focus.id) : undefined;
  const ship = focus.type === "SHIP" ? ships.find((candidate) => candidate.id === focus.id) : undefined;
  const city = focus.type === "CITY" ? strategicCities.find((candidate) => candidate.id === focus.id) : undefined;

  return (
    <aside className="entity-inspector" aria-label="Объект карты">
      <div className="entity-inspector-header">
        <div>
          <span className="entity-inspector-kicker">
            {army ? "Армия" : ship ? "Корабль" : city ? "Город" : "Объект"}
          </span>
          <strong>{army?.name ?? ship?.name ?? city?.name ?? "Объект не найден"}</strong>
        </div>
        <button className="entity-inspector-close" type="button" aria-label="Закрыть" onClick={onClose}>×</button>
      </div>
      <div className="entity-inspector-body">
        {army && (() => {
          const side = sides.find((candidate) => candidate.id === army.sideId);
          return (
            <ArmyCard
              army={army}
              sideColor={side?.color ?? "#687F91"}
              isGM={role === "GM"}
              canEditRoute={role === "GM" || leaderSideIds.has(army.sideId)}
              canRequestDisband={role === "GM" || leaderSideIds.has(army.sideId)}
              onAction={onAction}
            />
          );
        })()}
        {ship && (() => {
          const side = sides.find((candidate) => candidate.id === ship.sideId);
          return (
            <ShipCard
              ship={ship}
              sideColor={side?.color ?? "#687F91"}
              isGM={role === "GM"}
              canPlanRoute={role === "GM" || leaderSideIds.has(ship.sideId)}
              canRepair={role === "GM" || leaderSideIds.has(ship.sideId)}
              routePlanningEnabled={turnPhase === "MOVEMENT"}
              relations={relations}
              onAction={onAction}
            />
          );
        })()}
        {city && <CityInspector city={city} states={states} sides={sides} role={role} leaderSideIds={leaderSideIds} onAction={onAction} />}
        {!army && !ship && !city && <p className="empty empty-panel">Объект больше не существует или недоступен.</p>}
      </div>
    </aside>
  );
}

