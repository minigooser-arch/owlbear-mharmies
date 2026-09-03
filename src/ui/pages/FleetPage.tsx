import { useMemo, useState } from "react";
import { SHIP_CLASSES } from "../../naval/ships/shipClasses";
import type { ShipClassId, ShipFacing, Side } from "../../shared/types";
import { ShipCard } from "../components/ShipCard";
import type { ArmyView, ShipView, UiCommand } from "../state/useExtensionState";

const CLASS_IDS = Object.keys(SHIP_CLASSES) as ShipClassId[];
const FACING_OPTIONS: Array<{ value: ShipFacing; label: string }> = [
  { value: "NORTH", label: "Север" },
  { value: "EAST", label: "Восток" },
  { value: "SOUTH", label: "Юг" },
  { value: "WEST", label: "Запад" }
];

export function FleetPage({
  ships,
  armies,
  sides,
  role,
  onAction
}: {
  ships: readonly ShipView[];
  armies: readonly ArmyView[];
  sides: readonly Side[];
  role: "GM" | "PLAYER";
  onAction(command: UiCommand): void;
}) {
  const [query, setQuery] = useState("");
  const [filterSideId, setFilterSideId] = useState("ALL");
  const [classFilter, setClassFilter] = useState<"ALL" | ShipClassId>("ALL");
  const [registrationSideId, setRegistrationSideId] = useState(sides[0]?.id ?? "");
  const [registrationClassId, setRegistrationClassId] = useState<ShipClassId>("BATTLESHIP");
  const [registrationFacing, setRegistrationFacing] = useState<ShipFacing>("NORTH");

  const selectedRegistrationSideId = sides.some((side) => side.id === registrationSideId)
    ? registrationSideId
    : (sides[0]?.id ?? "");
  const filtered = useMemo(() => ships.filter((ship) =>
    (filterSideId === "ALL" || ship.sideId === filterSideId) &&
    (classFilter === "ALL" || ship.classId === classFilter) &&
    ship.name.toLocaleLowerCase("ru").includes(query.toLocaleLowerCase("ru"))
  ), [classFilter, filterSideId, query, ships]);
  const armyNames = new Map(armies.map((army) => [army.id, army.name]));

  return (
    <section aria-labelledby="fleet-title" className="wiki-page fleet-page">
      <div className="section-heading wiki-page-heading">
        <div>
          <p className="eyebrow">Войска</p>
          <h2 id="fleet-title">Флот</h2>
          <p className="page-description">Корабли, их классы, состояние, курс и доступные очки перемещения.</p>
        </div>
        <span className="count-pill">{ships.length}</span>
      </div>

      <div className="army-toolbar fleet-toolbar" role="search" aria-label="Поиск и фильтры флота">
        <div className="filters fleet-filters">
          <input aria-label="Поиск кораблей" placeholder="Найти корабль" value={query} onChange={(event) => setQuery(event.target.value)} />
          <select aria-label="Фильтр флота по стороне" value={filterSideId} onChange={(event) => setFilterSideId(event.target.value)}>
            <option value="ALL">Все стороны</option>
            {sides.map((side) => <option key={side.id} value={side.id}>{side.name}</option>)}
          </select>
          <select aria-label="Фильтр по классу корабля" value={classFilter} onChange={(event) => setClassFilter(event.target.value as "ALL" | ShipClassId)}>
            <option value="ALL">Все классы</option>
            {CLASS_IDS.map((classId) => <option key={classId} value={classId}>{SHIP_CLASSES[classId].name}</option>)}
          </select>
        </div>
      </div>

      {role === "GM" && (
        <section className="registration-card fleet-registration" aria-label="Регистрация корабля">
          <div className="registration-copy">
            <span className="registration-kicker">Новый корабль</span>
            <strong>Зарегистрировать выбранный токен</strong>
            <small>Назначьте фракцию, класс и исходный курс корабля.</small>
          </div>
          <div className="registration-actions fleet-registration-actions">
            <select
              aria-label="Сторона нового корабля"
              value={selectedRegistrationSideId}
              disabled={sides.length === 0}
              onChange={(event) => setRegistrationSideId(event.target.value)}
            >
              {sides.map((side) => <option key={side.id} value={side.id}>{side.name}</option>)}
            </select>
            <select aria-label="Класс нового корабля" value={registrationClassId} onChange={(event) => setRegistrationClassId(event.target.value as ShipClassId)}>
              {CLASS_IDS.map((classId) => <option key={classId} value={classId}>{SHIP_CLASSES[classId].name}</option>)}
            </select>
            <select aria-label="Курс нового корабля" value={registrationFacing} onChange={(event) => setRegistrationFacing(event.target.value as ShipFacing)}>
              {FACING_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <button
              className="button primary"
              type="button"
              disabled={sides.length === 0}
              onClick={() => {
                if (!selectedRegistrationSideId) return;
                onAction({
                  type: "REGISTER_SELECTED_SHIP",
                  sideId: selectedRegistrationSideId,
                  classId: registrationClassId,
                  facing: registrationFacing
                });
              }}
            >
              Сделать кораблём
            </button>
          </div>
        </section>
      )}

      <div className="card-list fleet-list">
        {filtered.map((ship) => {
          const sideColor = sides.find((side) => side.id === ship.sideId)?.color ?? "#687F91";
          return (
            <ShipCard
              key={ship.id}
              ship={ship}
              sideColor={sideColor}
              isGM={role === "GM"}
              {...(ship.embarkedArmyId && armyNames.get(ship.embarkedArmyId)
                ? { embarkedArmyName: armyNames.get(ship.embarkedArmyId) }
                : {})}
              onAction={onAction}
            />
          );
        })}
        {filtered.length === 0 && <p className="empty empty-panel">Подходящих кораблей нет.</p>}
      </div>
    </section>
  );
}
