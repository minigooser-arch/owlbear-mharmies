import { useMemo, useState } from "react";
import type { GridCellCoord, StateEntity, StrategicCity } from "../../shared/types";

export interface StrategicCityEditorProps {
  role: "GM" | "PLAYER";
  states: readonly StateEntity[];
  cities: readonly StrategicCity[];
  onCreate(city: StrategicCity): void | Promise<void>;
  onUpdate(cityId: string, patch: Partial<Omit<StrategicCity, "id">>): void | Promise<void>;
  onDelete(cityId: string): void | Promise<void>;
}

function parseCells(value: string): GridCellCoord[] | null {
  const chunks = value.split(";").map((entry) => entry.trim()).filter(Boolean);
  if (chunks.length === 0) return null;
  const cells: GridCellCoord[] = [];
  const seen = new Set<string>();
  for (const chunk of chunks) {
    const parts = chunk.split(",").map((part) => part.trim());
    if (parts.length !== 2) return null;
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
    const key = `${x},${y}`;
    if (seen.has(key)) return null;
    seen.add(key);
    cells.push({ x, y });
  }
  return cells;
}

function cellsText(cells: readonly GridCellCoord[]): string {
  return cells.map((cell) => `${cell.x},${cell.y}`).join("; ");
}

function StrategicCityRow({
  city,
  states,
  stateNames,
  role,
  onUpdate,
  onDelete
}: {
  city: StrategicCity;
  states: readonly StateEntity[];
  stateNames: ReadonlyMap<string, string>;
  role: "GM" | "PLAYER";
  onUpdate(cityId: string, patch: Partial<Omit<StrategicCity, "id">>): void | Promise<void>;
  onDelete(cityId: string): void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(city.name);
  const [cells, setCells] = useState(cellsText(city.cells));
  const [stateId, setStateId] = useState(city.recognizedStateId);
  const [buildCount, setBuildCount] = useState(String(city.historicalBuildTypeCount));
  const [capital, setCapital] = useState(city.isCapital);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const parsedCells = parseCells(cells);
    const historicalBuildTypeCount = Number(buildCount);
    if (!name.trim() || !stateId || !parsedCells || !Number.isInteger(historicalBuildTypeCount) || historicalBuildTypeCount < 0) {
      setError("Проверьте название, клетки, государство и число типов построек.");
      return;
    }
    setError(null);
    void onUpdate(city.id, {
      name: name.trim(),
      cells: parsedCells,
      recognizedStateId: stateId,
      deFactoStateId: stateId,
      factionInfluenceId: city.factionInfluenceId,
      mayorId: city.mayorId,
      isCapital: capital,
      historicalBuildTypeCount
    });
    setEditing(false);
  };

  return (
    <article>
      <h3>{city.name}</h3>
      <p>{stateNames.get(city.recognizedStateId) ?? city.recognizedStateId}</p>
      <p>Клеток: {city.cells.length}</p>
      <p>Исторических типов построек: {city.historicalBuildTypeCount}</p>
      {city.isCapital ? <p>Столица</p> : null}
      {role === "GM" ? (
        <div>
          <button type="button" aria-label={`Редактировать ${city.name}`} onClick={() => setEditing((value) => !value)}>
            Редактировать
          </button>
          <button type="button" aria-label={`Удалить ${city.name}`} onClick={() => void onDelete(city.id)}>
            Удалить
          </button>
        </div>
      ) : null}
      {role === "GM" && editing ? (
        <div>
          <label>
            Название
            <input aria-label={`Редактировать название ${city.name}`} value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            Государство
            <select aria-label={`Редактировать государство ${city.name}`} value={stateId} onChange={(event) => setStateId(event.target.value)}>
              {states.map((state) => <option key={state.id} value={state.id}>{state.name}</option>)}
            </select>
          </label>
          <label>
            Клетки
            <input aria-label={`Редактировать клетки ${city.name}`} value={cells} onChange={(event) => setCells(event.target.value)} />
          </label>
          <label>
            Исторические типы построек
            <input
              aria-label={`Редактировать исторические типы построек ${city.name}`}
              type="number"
              min={0}
              step={1}
              value={buildCount}
              onChange={(event) => setBuildCount(event.target.value)}
            />
          </label>
          <label>
            <input aria-label={`Редактировать столицу ${city.name}`} type="checkbox" checked={capital} onChange={(event) => setCapital(event.target.checked)} />
            Столица
          </label>
          {error ? <p role="alert">{error}</p> : null}
          <button type="button" aria-label={`Сохранить ${city.name}`} onClick={save}>Сохранить</button>
        </div>
      ) : null}
    </article>
  );
}

export function StrategicCityEditor({ role, states, cities, onCreate, onUpdate, onDelete }: StrategicCityEditorProps) {
  const defaultStateId = states[0]?.id ?? "";
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [cityCellsText, setCityCellsText] = useState("");
  const [stateId, setStateId] = useState(defaultStateId);
  const [buildCount, setBuildCount] = useState("0");
  const [capital, setCapital] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stateNames = useMemo(
    () => new Map(states.map((state) => [state.id, state.name])),
    [states]
  );

  const submit = () => {
    const cells = parseCells(cityCellsText);
    const historicalBuildTypeCount = Number(buildCount);
    if (!id.trim() || !name.trim() || !stateId || !cells || !Number.isInteger(historicalBuildTypeCount) || historicalBuildTypeCount < 0) {
      setError("Проверьте ID, название, клетки, государство и число типов построек.");
      return;
    }
    setError(null);
    void onCreate({
      id: id.trim(),
      name: name.trim(),
      cells,
      recognizedStateId: stateId,
      deFactoStateId: stateId,
      factionInfluenceId: null,
      mayorId: null,
      isCapital: capital,
      historicalBuildTypeCount
    });
  };

  return (
    <section aria-label="Стратегические города">
      <h2>Стратегические города</h2>
      {cities.length === 0 ? <p>Города не добавлены.</p> : null}
      {cities.map((city) => (
        <StrategicCityRow
          key={city.id}
          city={city}
          states={states}
          stateNames={stateNames}
          role={role}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      ))}

      {role === "GM" ? (
        <div>
          <label>
            ID города
            <input aria-label="ID города" value={id} onChange={(event) => setId(event.target.value)} />
          </label>
          <label>
            Название города
            <input aria-label="Название города" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            Государство
            <select aria-label="Государство" value={stateId} onChange={(event) => setStateId(event.target.value)}>
              {states.map((state) => <option key={state.id} value={state.id}>{state.name}</option>)}
            </select>
          </label>
          <label>
            Клетки города
            <input
              aria-label="Клетки города"
              value={cityCellsText}
              onChange={(event) => setCityCellsText(event.target.value)}
              placeholder="1,2; 2,2"
            />
          </label>
          <label>
            Исторические типы построек
            <input
              aria-label="Исторические типы построек"
              type="number"
              min={0}
              step={1}
              value={buildCount}
              onChange={(event) => setBuildCount(event.target.value)}
            />
          </label>
          <label>
            <input aria-label="Столица" type="checkbox" checked={capital} onChange={(event) => setCapital(event.target.checked)} />
            Столица
          </label>
          {error ? <p role="alert">{error}</p> : null}
          <button type="button" onClick={submit}>Создать город</button>
        </div>
      ) : null}
    </section>
  );
}
