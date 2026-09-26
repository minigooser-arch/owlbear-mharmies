import { useEffect, useMemo, useState } from "react";
import type { GridCellCoord, StateEntity, StrategicCity } from "../../shared/types";

export interface StrategicCityEditorProps {
  role: "GM" | "PLAYER";
  states: readonly StateEntity[];
  cities: readonly StrategicCity[];
  onCreate(city: StrategicCity): void | Promise<void>;
  onUpdate(cityId: string, patch: Partial<Omit<StrategicCity, "id">>): void | Promise<void>;
  onDelete(cityId: string): void | Promise<void>;
  onOpenCellPicker?(): void | Promise<void>;
  onCloseCellPicker?(): void | Promise<void>;
  pickedCells?: readonly GridCellCoord[];
  pickerSessionId?: string;
  canPickCells?: boolean;
}

const CYRILLIC_TRANSLITERATION: Readonly<Record<string, string>> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ы: "y", э: "e", ю: "yu", я: "ya"
};

function slugifyRussianName(name: string): string {
  return [...name.trim().toLocaleLowerCase()].map((character) => {
    if (character === "ь" || character === "ъ") return "";
    return CYRILLIC_TRANSLITERATION[character] ?? character;
  }).join("").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function cityIdForName(name: string, usedIds: ReadonlySet<string>): string {
  const base = slugifyRussianName(name) || "city";
  let candidate = base;
  for (let suffix = 2; usedIds.has(candidate); suffix += 1) candidate = `${base}-${suffix}`;
  return candidate;
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
  stateNames,
  role,
  onUpdate,
  onDelete
}: {
  city: StrategicCity;
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

  const beginEditing = () => {
    if (editing) {
      setEditing(false);
      return;
    }
    setName(city.name);
    setCells(cellsText(city.cells));
    setStateId(city.recognizedStateId);
    setBuildCount(String(city.historicalBuildTypeCount));
    setCapital(city.isCapital);
    setError(null);
    setEditing(true);
  };

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
      factionInfluenceId: city.factionInfluenceId,
      mayorId: city.mayorId,
      isCapital: capital,
      historicalBuildTypeCount
    });
    setEditing(false);
  };

  return <details className="strategic-city-card">
    <summary className="strategic-city-summary">
      <span className="strategic-city-summary-main">
        <strong>{city.name}</strong>
        <span>{stateNames.get(city.recognizedStateId) ?? city.recognizedStateId}</span>
      </span>
      <span className="strategic-city-summary-meta">
        {city.isCapital ? <span className="strategic-city-capital">Столица</span> : null}
        <span>Клеток: {city.cells.length}</span>
      </span>
      <span className="strategic-city-summary-label">Показать детали города {city.name}</span>
    </summary>
    <div className="strategic-city-details">
      <h3>{city.name}</h3>
      <p>Признанная принадлежность: {stateNames.get(city.recognizedStateId) ?? city.recognizedStateId}</p>
      <p>Фактический контроль: {stateNames.get(city.deFactoStateId) ?? city.deFactoStateId}</p>
      <p>Исторических типов построек: {city.historicalBuildTypeCount}</p>
      <p>Координаты клеток: {cellsText(city.cells)}</p>
      {city.cells.length > 0 ? <button type="button" onClick={() => void navigator.clipboard?.writeText(cellsText(city.cells))}>Скопировать координаты</button> : null}
      {role === "GM" ? <div className="strategic-city-actions">
        <button type="button" aria-label={`Редактировать ${city.name}`} onClick={beginEditing}>{editing ? "Закрыть форму" : "Редактировать"}</button>
        <button type="button" aria-label={`Удалить ${city.name}`} onClick={() => void onDelete(city.id)}>Удалить</button>
      </div> : null}
      {role === "GM" && editing ? <div className="strategic-city-edit-form">
        <label>
          Название
          <input aria-label={`Редактировать название ${city.name}`} value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Признанное государство
          <select aria-label={`Редактировать государство ${city.name}`} value={stateId} onChange={(event) => setStateId(event.target.value)}>
            {Array.from(stateNames, ([id, stateName]) => <option key={id} value={id}>{stateName}</option>)}
          </select>
        </label>
        <details className="strategic-city-advanced">
          <summary>Дополнительные поля</summary>
          <label>
            Клетки (X,Y через точку с запятой)
            <input aria-label={`Редактировать клетки ${city.name}`} value={cells} onChange={(event) => setCells(event.target.value)} />
          </label>
        </details>
        <label>
          Исторические типы построек
          <input aria-label={`Редактировать исторические типы построек ${city.name}`} type="number" min={0} step={1} value={buildCount} onChange={(event) => setBuildCount(event.target.value)} />
        </label>
        <label className="strategic-city-toggle">
          <input aria-label={`Редактировать столицу ${city.name}`} type="checkbox" checked={capital} onChange={(event) => setCapital(event.target.checked)} />
          Столица
        </label>
        {error ? <p role="alert">{error}</p> : null}
        <button type="button" aria-label={`Сохранить ${city.name}`} onClick={save}>Сохранить</button>
      </div> : null}
    </div>
  </details>;
}

export function StrategicCityEditor({
  role,
  states,
  cities,
  onCreate,
  onUpdate,
  onDelete,
  onOpenCellPicker,
  onCloseCellPicker,
  pickedCells = [],
  pickerSessionId,
  canPickCells = false
}: StrategicCityEditorProps) {
  const [manualId, setManualId] = useState("");
  const [name, setName] = useState("");
  const [cityCellsText, setCityCellsText] = useState("");
  const [stateId, setStateId] = useState(states[0]?.id ?? "");
  const [buildCount, setBuildCount] = useState("0");
  const [capital, setCapital] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cityQuery, setCityQuery] = useState("");
  const [cityStateFilter, setCityStateFilter] = useState("ALL");
  const [cellsBeforePicker, setCellsBeforePicker] = useState("");
  const [removedPickedCells, setRemovedPickedCells] = useState<ReadonlySet<string>>(new Set());
  const [observedPickerSessionId, setObservedPickerSessionId] = useState<string | undefined>(pickerSessionId);

  const stateNames = useMemo(() => new Map(states.map((state) => [state.id, state.name])), [states]);
  const selectedStateId = states.some((state) => state.id === stateId) ? stateId : (states[0]?.id ?? "");
  useEffect(() => {
    if (selectedStateId !== stateId) setStateId(selectedStateId);
  }, [selectedStateId, stateId]);
  useEffect(() => {
    if (observedPickerSessionId !== pickerSessionId) {
      setObservedPickerSessionId(pickerSessionId);
      setRemovedPickedCells(new Set());
    }
  }, [observedPickerSessionId, pickerSessionId]);

  const generatedId = cityIdForName(name, new Set(cities.map((city) => city.id)));
  const resolvedId = manualId.trim() || generatedId;
  const visibleCities = cities.filter((city) => {
    const normalizedQuery = cityQuery.trim().toLocaleLowerCase();
    return (!normalizedQuery || city.name.toLocaleLowerCase().includes(normalizedQuery)) &&
      (cityStateFilter === "ALL" || city.recognizedStateId === cityStateFilter);
  });
  const uniquePickedCells = pickedCells.filter((cell, index) =>
    pickedCells.findIndex((candidate) => candidate.x === cell.x && candidate.y === cell.y) === index &&
    !removedPickedCells.has(`${cell.x},${cell.y}`)
  );

  const beginCellPick = () => {
    setCellsBeforePicker(cityCellsText);
    setRemovedPickedCells(new Set());
    setError(null);
    void onOpenCellPicker?.();
  };

  const finishCellPick = () => {
    const existing = cityCellsText.trim() === "" ? [] : parseCells(cityCellsText);
    if (!existing) {
      setError("Сначала исправьте координаты или удалите их в дополнительных настройках.");
      return;
    }
    const merged = [...existing];
    const known = new Set(existing.map((cell) => `${cell.x},${cell.y}`));
    for (const cell of uniquePickedCells) {
      const key = `${cell.x},${cell.y}`;
      if (!known.has(key)) {
        known.add(key);
        merged.push(cell);
      }
    }
    setCityCellsText(cellsText(merged));
    setError(null);
    void onCloseCellPicker?.();
  };

  const cancelCellPick = () => {
    setCityCellsText(cellsBeforePicker);
    setError(null);
    void onCloseCellPicker?.();
  };

  const submit = () => {
    const cells = parseCells(cityCellsText);
    const historicalBuildTypeCount = Number(buildCount);
    if (!resolvedId || !name.trim() || !selectedStateId || !cells || !Number.isInteger(historicalBuildTypeCount) || historicalBuildTypeCount < 0) {
      setError("Проверьте название, клетки, государство и число типов построек.");
      return;
    }
    if (manualId.trim() && cities.some((city) => city.id === manualId.trim())) {
      setError("Этот ID города уже используется.");
      return;
    }
    setError(null);
    void onCreate({
      id: resolvedId,
      name: name.trim(),
      cells,
      recognizedStateId: selectedStateId,
      deFactoStateId: selectedStateId,
      factionInfluenceId: null,
      mayorId: null,
      isCapital: capital,
      historicalBuildTypeCount
    });
  };

  return <section className="strategic-city-editor" aria-label="Стратегические города">
    <div className="section-heading"><div><p className="eyebrow">Администрирование</p><h2>Стратегические города</h2></div></div>
    {cities.length > 0 ? <div className="strategic-city-filters">
      <label>
        Поиск города
        <input aria-label="Поиск городов" type="search" value={cityQuery} onChange={(event) => setCityQuery(event.target.value)} placeholder="Название города" />
      </label>
      <label>
        Фильтр по государству
        <select aria-label="Фильтр городов по государству" value={cityStateFilter} onChange={(event) => setCityStateFilter(event.target.value)}>
          <option value="ALL">Все государства</option>
          {states.map((state) => <option key={state.id} value={state.id}>{state.name}</option>)}
        </select>
      </label>
    </div> : null}
    <div className="strategic-city-list">
      {visibleCities.map((city) => <StrategicCityRow key={city.id} city={city} stateNames={stateNames} role={role} onUpdate={onUpdate} onDelete={onDelete} />)}
      {cities.length === 0 ? <p className="empty">Города не добавлены.</p> : null}
      {cities.length > 0 && visibleCities.length === 0 ? <p className="empty">По этим условиям города не найдены.</p> : null}
    </div>

    {role === "GM" ? <section className="strategic-city-create" aria-labelledby="strategic-city-create-title">
      <div className="strategic-city-form-heading">
        <div><p className="eyebrow">Новая запись</p><h3 id="strategic-city-create-title">Создать город</h3></div>
        <span className="strategic-city-id-preview">ID: {resolvedId}</span>
      </div>
      <div className="strategic-city-form-grid">
        <label>
          Название города
          <input aria-label="Название города" value={name} onChange={(event) => setName(event.target.value)} placeholder="Например, Москва" />
        </label>
        <label>
          Признанное государство
          <select aria-label="Государство" value={selectedStateId} onChange={(event) => setStateId(event.target.value)}>
            {states.length === 0 ? <option value="">Государства не созданы</option> : states.map((state) => <option key={state.id} value={state.id}>{state.name}</option>)}
          </select>
        </label>
        <label>
          Исторические типы построек
          <input aria-label="Исторические типы построек" type="number" min={0} step={1} value={buildCount} onChange={(event) => setBuildCount(event.target.value)} />
        </label>
        <label className="strategic-city-toggle">
          <input aria-label="Столица" type="checkbox" checked={capital} onChange={(event) => setCapital(event.target.checked)} />
          Столица
        </label>
      </div>
      <div className="strategic-city-picker" aria-label="Выбор клеток города">
        {pickerSessionId ? <>
          <p role="status">Инструмент координат активен. Нажимайте на нужные клетки карты; выбранные координаты появятся здесь.</p>
          <div className="strategic-city-cell-chips">
            {uniquePickedCells.map((cell) => <span className="strategic-city-cell-chip" key={`${cell.x},${cell.y}`}>
              {cell.x},{cell.y}
              <button type="button" aria-label={`Удалить клетку ${cell.x},${cell.y}`} onClick={() => setRemovedPickedCells((current) => new Set([...current, `${cell.x},${cell.y}`]))}>×</button>
            </span>)}
            {uniquePickedCells.length === 0 ? <span className="muted">Клетки ещё не выбраны.</span> : null}
          </div>
          <div className="strategic-city-picker-actions">
            <button type="button" onClick={finishCellPick}>Завершить выбор</button>
            <button type="button" onClick={cancelCellPick}>Отменить</button>
          </div>
        </> : <button type="button" disabled={!canPickCells || !onOpenCellPicker} onClick={beginCellPick}>Выбрать клетки на карте</button>}
      </div>
      <details className="strategic-city-advanced">
        <summary>Дополнительные настройки</summary>
        <p>Ручной ввод координат в формате X,Y через точку с запятой доступен как запасной способ.</p>
        <label>
          ID города вручную
          <input aria-label="ID города" value={manualId} onChange={(event) => setManualId(event.target.value)} placeholder={generatedId} />
        </label>
        <label>
          Клетки города (X,Y через точку с запятой)
          <input aria-label="Клетки города" placeholder="12,5; 13,5" value={cityCellsText} onChange={(event) => setCityCellsText(event.target.value)} />
        </label>
      </details>
      {error ? <p role="alert">{error}</p> : null}
      {states.length === 0 ? <p role="status">Сначала создайте государство в разделе «Управление → Государства».</p> : null}
      <button className="strategic-city-create-button" type="button" disabled={states.length === 0} onClick={submit}>Создать город</button>
    </section> : null}
  </section>;
}
