import { useEffect, useMemo, useState } from "react";
import type { GridCellCoord, Side, StateEntity, TerrainRegistryState, TerrainType } from "../../shared/types";
import type { MapBrushUiSettings, UiCommand } from "../state/useExtensionState";
import { formatMovementUnits } from "../presentation/movement";

interface MapEditorPageProps {
  terrain: TerrainRegistryState;
  sides: readonly Side[];
  states: readonly StateEntity[];
  onAction(command: UiCommand): void;
}

const BRUSH_SIZES = [1, 3, 5] as const;

function parseTransferCells(raw: string): GridCellCoord[] | null {
  const parts = raw.split(/[;\n]+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return [];
  const cells = new Map<string, GridCellCoord>();
  for (const part of parts) {
    const match = /^(-?\d+)\s*,\s*(-?\d+)$/.exec(part);
    if (!match) return null;
    const x = Number(match[1]);
    const y = Number(match[2]);
    cells.set(`${x},${y}`, { x, y });
  }
  return [...cells.values()];
}

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
  const structuralSea = terrain.id === "sea";
  return <article className="terrain-row">
    <div className="terrain-row-main">
      <input aria-label={`Название местности ${terrain.id}`} value={name} onChange={(event) => setName(event.target.value)} />
      <label className="compact-field">ОП<input aria-label={`Стоимость ${terrain.name}`} type="number" min="0.5" step="0.5" value={cost.replace(",", ".")} onChange={(event) => setCost(event.target.value)} /></label>
      <input aria-label={`Цвет ${terrain.name}`} type="color" value={color} onChange={(event) => setColor(event.target.value)} />
    </div>
    <div className="card-actions">
      <button type="button" disabled={!name.trim() || !validCost} onClick={() => onAction({ type: "UPDATE_TERRAIN_TYPE", terrainId: terrain.id, patch: { name: name.trim(), movementCostUnits, color } })}>Сохранить</button>
      {!structuralSea && <button type="button" onClick={() => onAction({ type: "UPDATE_TERRAIN_TYPE", terrainId: terrain.id, patch: { enabled: !terrain.enabled } })}>{terrain.enabled ? "Отключить" : "Включить"}</button>}
      {!structuralSea && terrain.id !== defaultTerrainId && <button className="button danger subtle" type="button" onClick={() => onAction({ type: "DELETE_TERRAIN_TYPE", terrainId: terrain.id, replacementTerrainId: defaultTerrainId })}>Удалить</button>}
    </div>
  </article>;
}

export function MapEditorPage({ terrain, states, onAction }: MapEditorPageProps) {
  const terrainTypes = useMemo(() => Object.values(terrain.types).sort((a, b) => a.name.localeCompare(b.name, "ru")), [terrain]);
  const selectableStates = useMemo(
    () => [...states].sort((a, b) => a.name.localeCompare(b.name, "ru")),
    [states]
  );
  const [mode, setMode] = useState<MapBrushUiSettings["mode"]>("TERRAIN");
  const [size, setSize] = useState<MapBrushUiSettings["size"]>(1);
  const [terrainId, setTerrainId] = useState(terrain.defaultTerrainId);
  const [stateId, setStateId] = useState(states[0]?.id ?? "");
  const [impassable, setImpassable] = useState(true);
  const [eraserTarget, setEraserTarget] = useState<MapBrushUiSettings["eraserTarget"]>("TERRAIN");
  const [newName, setNewName] = useState("");
  const [newCost, setNewCost] = useState("1");
  const [newColor, setNewColor] = useState("#42a5f5");
  const [transferRecipientId, setTransferRecipientId] = useState(states[0]?.id ?? "");
  const [transferCellsText, setTransferCellsText] = useState("");
  const [transferPreviewed, setTransferPreviewed] = useState(false);

  useEffect(() => {
    if (!selectableStates.some((state) => state.id === stateId)) {
      setStateId(selectableStates[0]?.id ?? "");
    }
  }, [selectableStates, stateId]);

  useEffect(() => {
    if (!selectableStates.some((state) => state.id === transferRecipientId)) {
      setTransferRecipientId(selectableStates[0]?.id ?? "");
      setTransferPreviewed(false);
    }
  }, [selectableStates, transferRecipientId]);

  const parsedNewCost = Number(newCost.replace(",", "."));
  const newCostUnits = Math.round(parsedNewCost * 2);
  const canCreateTerrain = newName.trim().length > 0 && parsedNewCost >= 0.5 && Number.isInteger(parsedNewCost * 2);
  const transferCells = parseTransferCells(transferCellsText);
  const canPreviewTransfer = Boolean(transferRecipientId) && transferCells !== null && transferCells.length > 0;
  const clearTransferPreview = () => {
    if (transferPreviewed) onAction({ type: "CLEAR_PEACE_TRANSFER_PREVIEW" });
    setTransferPreviewed(false);
  };
  const needsState = mode === "RECOGNIZED_STATE" || mode === "DEFACTO_STATE";
  const canApply = !needsState || Boolean(stateId);
  const description = mode === "TERRAIN" ? `Следующий мазок назначит местность «${terrain.types[terrainId]?.name ?? terrainId}».`
    : mode === "IMPASSABLE" ? `Следующий мазок сделает клетки ${impassable ? "непроходимыми" : "проходимыми"}.`
    : mode === "RECOGNIZED_STATE" ? "Следующий мазок назначит международно признанного владельца клеток."
    : mode === "DEFACTO_STATE" ? "Следующий мазок назначит фактический контроль государства."
    : "Ластик изменит только выбранный слой клетки.";

  const brushSettings = (nextSize: MapBrushUiSettings["size"] = size): MapBrushUiSettings => ({
    mode,
    size: nextSize,
    terrainId,
    ...(stateId ? { stateId } : {}),
    impassable,
    eraserTarget
  });

  const applyBrush = () => {
    if (!canApply) return;
    onAction({ type: "OPEN_MAP_BRUSH", settings: brushSettings() });
  };

  const selectBrushSize = (brushSize: MapBrushUiSettings["size"]) => {
    setSize(brushSize);
    onAction({ type: "UPDATE_MAP_BRUSH_SETTINGS", settings: brushSettings(brushSize) });
  };

  return <section aria-labelledby="map-editor-title">
    <div className="section-heading wiki-page-heading"><div><p className="eyebrow">Ведущий</p><h2 id="map-editor-title">Разметка карты</h2><p className="page-description">Редактируйте стратегические клетки, государственные границы, фактический контроль и справочники карты.</p></div></div>
    <div className="settings-card map-editor-card">
      <div className="form-grid">
        <label>Режим кисти<select aria-label="Режим кисти" value={mode} onChange={(event) => setMode(event.target.value as MapBrushUiSettings["mode"])}>
          <option value="TERRAIN">Местность</option><option value="IMPASSABLE">Проходимость</option>
          <option value="RECOGNIZED_STATE">Признанная территория государства</option><option value="DEFACTO_STATE">Де-факто контроль государства</option><option value="ERASER">Ластик</option>
        </select></label>
        {mode === "TERRAIN" && <label>Тип местности<select value={terrainId} onChange={(event) => setTerrainId(event.target.value)}>{terrainTypes.filter((item) => item.enabled).map((item) => <option key={item.id} value={item.id}>{item.name} · {formatMovementUnits(item.movementCostUnits)} ОП</option>)}</select></label>}
        {mode === "IMPASSABLE" && <label>Действие<select value={impassable ? "BLOCK" : "ALLOW"} onChange={(event) => setImpassable(event.target.value === "BLOCK")}><option value="BLOCK">Сделать непроходимой</option><option value="ALLOW">Сделать проходимой</option></select></label>}
        {(mode === "RECOGNIZED_STATE" || mode === "DEFACTO_STATE") && <label>Государство<select aria-label="Государство для разметки" value={stateId} onChange={(event) => setStateId(event.target.value)}>
          {selectableStates.length === 0
            ? <option value="">Государства не созданы</option>
            : selectableStates.map((item) => <option key={item.id} value={item.id}>{item.name}{item.active ? "" : " · неактивно"}</option>)}
        </select></label>}
        {mode === "ERASER" && <label>Что стирать<select value={eraserTarget} onChange={(event) => setEraserTarget(event.target.value as MapBrushUiSettings["eraserTarget"])}><option value="TERRAIN">Только местность</option><option value="IMPASSABLE">Только непроходимость</option><option value="RECOGNIZED_STATE">Признанную государственную принадлежность</option><option value="DEFACTO_STATE">Де-факто контроль</option><option value="ALL">Все текущие свойства клетки</option></select></label>}
      </div>
      <div className="brush-size" aria-label="Размер кисти"><span>Размер</span>{BRUSH_SIZES.map((brushSize) => <button key={brushSize} type="button" className={size === brushSize ? "active" : ""} onClick={() => selectBrushSize(brushSize)}>{brushSize}×{brushSize}</button>)}</div>
      <p className="helper-text">{description}</p>
      <p className="helper-text">Неразмеченные клетки — океан / озёра. Наземная местность заменяет воду; стирание местности возвращает воду. Изображение карты не закрашивается базовым водным слоем.</p>
      {needsState && selectableStates.length === 0 && <p className="route-warning" role="status">Сначала создайте государство в разделе «Управление → Государства».</p>}
      <button className="button primary wide" type="button" disabled={!canApply} onClick={applyBrush}>Начать рисовать</button>
    </div>

    <div className="settings-card map-editor-card" aria-label="Официальная передача территории">
      <div className="section-heading secondary-heading">
        <div><p className="eyebrow">Мирный договор</p><h2>Официальная передача территории</h2></div>
      </div>
      <p className="helper-text">Выберите государство-получатель и перечислите клетки в формате x,y через точку с запятой или с новой строки. Предпросмотр ничего не меняет в общей сцене.</p>
      <div className="form-grid">
        <label>Государство-получатель
          <select
            aria-label="Государство-получатель"
            value={transferRecipientId}
            onChange={(event) => {
              clearTransferPreview();
              setTransferRecipientId(event.target.value);
            }}
          >
            {selectableStates.length === 0
              ? <option value="">Государства не созданы</option>
              : selectableStates.map((state) => <option key={state.id} value={state.id}>{state.name}{state.active ? "" : " · неактивно"}</option>)}
          </select>
        </label>
        <label>Клетки передачи
          <textarea
            aria-label="Клетки передачи"
            placeholder={"12,5; 13,5\n14,5"}
            value={transferCellsText}
            onChange={(event) => {
              clearTransferPreview();
              setTransferCellsText(event.target.value);
            }}
          />
        </label>
      </div>
      {transferCells === null && <p className="route-warning">Формат клетки: целые координаты x,y.</p>}
      <div className="card-actions">
        <button
          className="button ghost"
          type="button"
          disabled={!canPreviewTransfer}
          onClick={() => {
            if (!transferCells || transferCells.length === 0) return;
            onAction({ type: "PREVIEW_PEACE_TRANSFER", recipientStateId: transferRecipientId, cells: transferCells });
            setTransferPreviewed(true);
          }}
        >
          Предпросмотр передачи
        </button>
        <button
          className="button primary"
          type="button"
          disabled={!transferPreviewed || !canPreviewTransfer}
          onClick={() => {
            if (!transferCells || transferCells.length === 0) return;
            onAction({ type: "APPLY_PEACE_TRANSFER", recipientStateId: transferRecipientId, cells: transferCells });
            setTransferPreviewed(false);
          }}
        >
          Подтвердить официальную передачу
        </button>
        {transferPreviewed && <button className="button ghost" type="button" onClick={clearTransferPreview}>Снять предпросмотр</button>}
      </div>
    </div>

    <details className="reference-management">
      <summary>Справочник местности</summary>
      <div className="reference-management-body">
        <div className="section-heading secondary-heading"><div><p className="eyebrow">Справочник</p><h2>Типы местности</h2></div></div>
        <div className="terrain-create"><input aria-label="Название новой местности" placeholder="Название" value={newName} onChange={(event) => setNewName(event.target.value)} /><input aria-label="Стоимость новой местности" type="number" min="0.5" step="0.5" value={newCost} onChange={(event) => setNewCost(event.target.value)} /><input aria-label="Цвет новой местности" type="color" value={newColor} onChange={(event) => setNewColor(event.target.value)} /><button className="button" type="button" disabled={!canCreateTerrain} onClick={() => { onAction({ type: "CREATE_TERRAIN_TYPE", terrain: { id: `terrain-${crypto.randomUUID()}`, name: newName.trim(), movementCostUnits: newCostUnits, enabled: true, color: newColor } }); setNewName(""); setNewCost("1"); }}>Добавить</button></div>
        <div className="card-list terrain-list">{terrainTypes.map((item) => <TerrainEditor key={item.id} terrain={item} defaultTerrainId={terrain.defaultTerrainId} onAction={onAction} />)}</div>
      </div>
    </details>
  </section>;
}
