import { useMemo, useState } from "react";
import type { Side, StateEntity, TerrainRegistryState, TerrainType } from "../../shared/types";
import type { MapBrushUiSettings, UiCommand } from "../state/useExtensionState";
import { formatMovementUnits } from "../presentation/movement";

interface MapEditorPageProps {
  terrain: TerrainRegistryState;
  sides: readonly Side[];
  states: readonly StateEntity[];
  onAction(command: UiCommand): void;
}

const BRUSH_SIZES = [1, 3, 5] as const;

function TerrainEditor({ terrain, defaultTerrainId, onAction }: {
  terrain: TerrainType;
  defaultTerrainId: string;
  onAction(command: UiCommand): void;
}) {
  const [name, setName] = useState(terrain.name);
  const [cost, setCost] = useState(formatMovementUnits(terrain.movementCostUnits));
  const [color, setColor] = useState(terrain.color ?? "#42a5f5");
  const parsedCost = Number(cost.replace(",", "."));
  const movementCostUnits = Math.round(parsedCost * 2);
  const validCost = Number.isFinite(parsedCost) && parsedCost >= 0.5 && Number.isInteger(parsedCost * 2);
  return <article className="terrain-row">
    <div className="terrain-row-main">
      <input aria-label={`Название местности ${terrain.id}`} value={name} onChange={(event) => setName(event.target.value)} />
      <label className="compact-field">ОП<input aria-label={`Стоимость ${terrain.name}`} type="number" min="0.5" step="0.5" value={cost.replace(",", ".")} onChange={(event) => setCost(event.target.value)} /></label>
      <input aria-label={`Цвет ${terrain.name}`} type="color" value={color} onChange={(event) => setColor(event.target.value)} />
    </div>
    <div className="card-actions">
      <button type="button" disabled={!name.trim() || !validCost} onClick={() => onAction({ type: "UPDATE_TERRAIN_TYPE", terrainId: terrain.id, patch: { name: name.trim(), movementCostUnits, color } })}>Сохранить</button>
      <button type="button" onClick={() => onAction({ type: "UPDATE_TERRAIN_TYPE", terrainId: terrain.id, patch: { enabled: !terrain.enabled } })}>{terrain.enabled ? "Отключить" : "Включить"}</button>
      {terrain.id !== defaultTerrainId && <button className="button danger subtle" type="button" onClick={() => onAction({ type: "DELETE_TERRAIN_TYPE", terrainId: terrain.id, replacementTerrainId: defaultTerrainId })}>Удалить</button>}
    </div>
  </article>;
}

function StateEditor({ state, sides, onAction }: { state: StateEntity; sides: readonly Side[]; onAction(command: UiCommand): void }) {
  const [name, setName] = useState(state.name);
  const [rulingFactionId, setRulingFactionId] = useState(state.rulingFactionId ?? "");
  return <article className="terrain-row">
    <div className="terrain-row-main">
      <input aria-label={`Название государства ${state.id}`} value={name} onChange={(event) => setName(event.target.value)} />
      <label>Правящая фракция<select value={rulingFactionId} onChange={(event) => setRulingFactionId(event.target.value)}>
        <option value="">Не назначена</option>{sides.map((side) => <option key={side.id} value={side.id}>{side.name}</option>)}
      </select></label>
    </div>
    <div className="card-actions">
      <button type="button" disabled={!name.trim()} onClick={() => onAction({ type: "UPDATE_STATE", stateId: state.id, patch: { name: name.trim(), rulingFactionId: rulingFactionId || null } })}>Сохранить</button>
      <button type="button" onClick={() => onAction({ type: "UPDATE_STATE", stateId: state.id, patch: { active: !state.active } })}>{state.active ? "Отключить" : "Включить"}</button>
      <button className="button danger subtle" type="button" onClick={() => onAction({ type: "DELETE_STATE", stateId: state.id })}>Удалить</button>
    </div>
  </article>;
}

export function MapEditorPage({ terrain, sides, states, onAction }: MapEditorPageProps) {
  const terrainTypes = useMemo(() => Object.values(terrain.types).sort((a, b) => a.name.localeCompare(b.name, "ru")), [terrain]);
  const [mode, setMode] = useState<MapBrushUiSettings["mode"]>("TERRAIN");
  const [size, setSize] = useState<MapBrushUiSettings["size"]>(1);
  const [terrainId, setTerrainId] = useState(terrain.defaultTerrainId);
  const [sideId, setSideId] = useState(sides[0]?.id ?? "");
  const [stateId, setStateId] = useState(states[0]?.id ?? "");
  const [factionOperation, setFactionOperation] = useState<MapBrushUiSettings["factionOperation"]>("ADD");
  const [impassable, setImpassable] = useState(true);
  const [eraserTarget, setEraserTarget] = useState<MapBrushUiSettings["eraserTarget"]>("TERRAIN");
  const [newName, setNewName] = useState("");
  const [newCost, setNewCost] = useState("1");
  const [newColor, setNewColor] = useState("#42a5f5");
  const [newStateName, setNewStateName] = useState("");
  const [newRulingFactionId, setNewRulingFactionId] = useState("");

  const parsedNewCost = Number(newCost.replace(",", "."));
  const newCostUnits = Math.round(parsedNewCost * 2);
  const canCreateTerrain = newName.trim().length > 0 && parsedNewCost >= 0.5 && Number.isInteger(parsedNewCost * 2);
  const needsSide = mode === "FACTION_TERRITORY" || (mode === "ERASER" && eraserTarget === "SELECTED_FACTION");
  const needsState = mode === "RECOGNIZED_STATE" || mode === "DEFACTO_STATE";
  const canApply = (!needsSide || Boolean(sideId)) && (!needsState || Boolean(stateId));
  const description = mode === "TERRAIN" ? `Следующий мазок назначит местность «${terrain.types[terrainId]?.name ?? terrainId}».`
    : mode === "IMPASSABLE" ? `Следующий мазок сделает клетки ${impassable ? "непроходимыми" : "проходимыми"}.`
    : mode === "FACTION_TERRITORY" ? `Следующий мазок ${factionOperation === "ADD" ? "добавит" : "уберёт"} мирную территорию выбранной фракции.`
    : mode === "RECOGNIZED_STATE" ? "Следующий мазок назначит международно признанного владельца клеток."
    : mode === "DEFACTO_STATE" ? "Следующий мазок назначит фактический контроль государства."
    : "Ластик изменит только выбранный слой клетки.";

  const applyBrush = () => canApply && onAction({ type: "OPEN_MAP_BRUSH", settings: { mode, size, terrainId, ...(sideId ? { sideId } : {}), ...(stateId ? { stateId } : {}), factionOperation, impassable, eraserTarget } });

  return <section aria-labelledby="map-editor-title">
    <div className="section-heading"><div><p className="eyebrow">Ведущий</p><h2 id="map-editor-title">Разметка карты</h2></div></div>
    <div className="settings-card map-editor-card">
      <div className="form-grid">
        <label>Режим кисти<select aria-label="Режим кисти" value={mode} onChange={(event) => setMode(event.target.value as MapBrushUiSettings["mode"])}>
          <option value="TERRAIN">Местность</option><option value="IMPASSABLE">Проходимость</option><option value="FACTION_TERRITORY">Территория фракции</option>
          <option value="RECOGNIZED_STATE">Признанная территория государства</option><option value="DEFACTO_STATE">Де-факто контроль государства</option><option value="ERASER">Ластик</option>
        </select></label>
        {mode === "TERRAIN" && <label>Тип местности<select value={terrainId} onChange={(event) => setTerrainId(event.target.value)}>{terrainTypes.filter((item) => item.enabled).map((item) => <option key={item.id} value={item.id}>{item.name} · {formatMovementUnits(item.movementCostUnits)} ОП</option>)}</select></label>}
        {mode === "IMPASSABLE" && <label>Действие<select value={impassable ? "BLOCK" : "ALLOW"} onChange={(event) => setImpassable(event.target.value === "BLOCK")}><option value="BLOCK">Сделать непроходимой</option><option value="ALLOW">Сделать проходимой</option></select></label>}
        {mode === "FACTION_TERRITORY" && <><label>Фракция<select value={sideId} onChange={(event) => setSideId(event.target.value)}>{sides.map((side) => <option key={side.id} value={side.id}>{side.name}</option>)}</select></label><label>Действие<select value={factionOperation} onChange={(event) => setFactionOperation(event.target.value as MapBrushUiSettings["factionOperation"])}><option value="ADD">Добавить территорию</option><option value="REMOVE">Убрать территорию</option></select></label></>}
        {(mode === "RECOGNIZED_STATE" || mode === "DEFACTO_STATE") && <label>Государство<select value={stateId} onChange={(event) => setStateId(event.target.value)}>{states.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        {mode === "ERASER" && <><label>Что стирать<select value={eraserTarget} onChange={(event) => setEraserTarget(event.target.value as MapBrushUiSettings["eraserTarget"])}><option value="TERRAIN">Только местность</option><option value="IMPASSABLE">Только непроходимость</option><option value="SELECTED_FACTION">Только территорию выбранной фракции</option><option value="RECOGNIZED_STATE">Признанную государственную принадлежность</option><option value="DEFACTO_STATE">Де-факто контроль</option><option value="ALL">Все свойства клетки</option></select></label>{eraserTarget === "SELECTED_FACTION" && <label>Фракция<select value={sideId} onChange={(event) => setSideId(event.target.value)}>{sides.map((side) => <option key={side.id} value={side.id}>{side.name}</option>)}</select></label>}</>}
      </div>
      <div className="brush-size" aria-label="Размер кисти"><span>Размер</span>{BRUSH_SIZES.map((brushSize) => <button key={brushSize} type="button" className={size === brushSize ? "active" : ""} onClick={() => setSize(brushSize)}>{brushSize}×{brushSize}</button>)}</div>
      <p className="helper-text">{description}</p><button className="button primary wide" type="button" disabled={!canApply} onClick={applyBrush}>Начать рисовать</button>
    </div>

    <details className="reference-management">
      <summary>Справочники карты и государств</summary>
      <div className="reference-management-body">
    <div className="section-heading secondary-heading"><div><p className="eyebrow">Границы</p><h2>Государства</h2></div></div>
    <div className="terrain-create"><input aria-label="Название нового государства" placeholder="Название государства" value={newStateName} onChange={(event) => setNewStateName(event.target.value)} /><select aria-label="Правящая фракция нового государства" value={newRulingFactionId} onChange={(event) => setNewRulingFactionId(event.target.value)}><option value="">Правящая фракция не назначена</option>{sides.map((side) => <option key={side.id} value={side.id}>{side.name}</option>)}</select><button className="button" type="button" disabled={!newStateName.trim()} onClick={() => { onAction({ type: "CREATE_STATE", state: { id: `state-${crypto.randomUUID()}`, name: newStateName.trim(), rulingFactionId: newRulingFactionId || null, active: true } }); setNewStateName(""); }}>Добавить</button></div>
    <div className="card-list terrain-list">{states.map((item) => <StateEditor key={item.id} state={item} sides={sides} onAction={onAction} />)}</div>
    <div className="settings-card"><h3>Принадлежность фракций государствам</h3>{sides.map((side) => <label key={side.id}>{side.name}<select value={side.stateId ?? ""} onChange={(event) => onAction({ type: "SET_SIDE_STATE", sideId: side.id, stateId: event.target.value || null })}><option value="">Без государства</option>{states.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>)}</div>

    <div className="section-heading secondary-heading"><div><p className="eyebrow">Справочник</p><h2>Типы местности</h2></div></div>
    <div className="terrain-create"><input aria-label="Название новой местности" placeholder="Название" value={newName} onChange={(event) => setNewName(event.target.value)} /><input aria-label="Стоимость новой местности" type="number" min="0.5" step="0.5" value={newCost} onChange={(event) => setNewCost(event.target.value)} /><input aria-label="Цвет новой местности" type="color" value={newColor} onChange={(event) => setNewColor(event.target.value)} /><button className="button" type="button" disabled={!canCreateTerrain} onClick={() => { onAction({ type: "CREATE_TERRAIN_TYPE", terrain: { id: `terrain-${crypto.randomUUID()}`, name: newName.trim(), movementCostUnits: newCostUnits, enabled: true, color: newColor } }); setNewName(""); setNewCost("1"); }}>Добавить</button></div>
    <div className="card-list terrain-list">{terrainTypes.map((item) => <TerrainEditor key={item.id} terrain={item} defaultTerrainId={terrain.defaultTerrainId} onAction={onAction} />)}</div>
      </div>
    </details>
  </section>;
}
