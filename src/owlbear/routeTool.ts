import { firstBarrierIntersection, type BarrierSegment } from "../barriers/barrierGeometry";
import { StrategicGridAdapter, isOrthogonalNeighbor } from "../grid/strategicGrid";
import { validateMovementStep } from "../movement/movementRules";
import type { GridRoutePort } from "../routes/routeMath";
import { readCell } from "../terrain/gridMap";
import type {
  GridCellCoord,
  GridMapState,
  MovementDenialReason,
  TerrainRegistryState,
  Vector2,
  WarState
} from "../shared/types";

export interface RoutePreview {
  point: Vector2;
  cell: GridCellCoord;
  valid: boolean;
  color: string;
  label: string;
  totalCostUnits: number;
  remainingUnits: number;
  stepCostUnits?: number;
  reason?: MovementDenialReason | "BARRIER" | "INACTIVE";
}

export interface RouteToolSnapshot {
  armyId: string;
  start: Vector2;
  startCell: GridCellCoord;
  points: readonly Vector2[];
  cells: readonly GridCellCoord[];
  stepCostUnits: readonly number[];
  totalCostUnits: number;
  remainingUnits: number;
  maxUnits: number;
  preview?: RoutePreview;
}

export interface RouteToolActivation {
  armyId: string;
  start: Vector2;
  startCell: GridCellCoord;
  gridDpi: number;
  sideId: string;
  movementUnits: number;
  maxUnits: number;
  terrain: TerrainRegistryState;
  gridMap: GridMapState;
  wars: readonly WarState[];
  barriers: readonly BarrierSegment[];
}

export type RouteClickResult =
  | { accepted: true }
  | { accepted: false; reason: MovementDenialReason | "BARRIER" | "INACTIVE" };

export type RouteKeyResult =
  | { action: "EDITING" }
  | { action: "CANCEL" }
  | { action: "IGNORED" };

export type RouteFinishResult =
  | {
      action: "COMMIT";
      armyId: string;
      startCell: GridCellCoord;
      route: Vector2[];
      cells: GridCellCoord[];
      totalCostUnits: number;
    }
  | { action: "INVALID"; reason: MovementDenialReason | "EMPTY_ROUTE" }
  | { action: "IGNORED" };

export function formatMovementUnits(units: number): string {
  const value = units / 2;
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(".", ",");
}

function messageForPreview(reason: RoutePreview["reason"], missingUnits?: number): string {
  switch (reason) {
    case "NOT_ORTHOGONAL": return "Только по горизонтали или вертикали";
    case "OUTSIDE_MAP": return "За пределами игровой карты";
    case "IMPASSABLE": return "Непроходимая клетка";
    case "OUTSIDE_FACTION_TERRITORY": return "Вне территории фракции в мирное время";
    case "INVALID_TERRAIN": return "Недоступный тип местности";
    case "INSUFFICIENT_MOVEMENT_POINTS": return `Не хватает ${formatMovementUnits(missingUnits ?? 0)} ОП`;
    case "ARMY_STATE_BLOCKS_MOVEMENT": return "Состояние армии запрещает движение";
    case "BARRIER": return "Путь перекрыт препятствием";
    case "INACTIVE": return "Инструмент маршрута не активен";
    default: return "";
  }
}

export class RouteToolController {
  private activation: RouteToolActivation | undefined;
  private points: Vector2[] = [];
  private cells: GridCellCoord[] = [];
  private costs: number[] = [];
  private currentPreview: RoutePreview | undefined;
  private sequence = 0;

  constructor(private readonly gridPort: Pick<GridRoutePort, "snapGridCenter">) {}

  activate(input: RouteToolActivation): void {
    this.activation = structuredClone(input);
    this.points = [];
    this.cells = [];
    this.costs = [];
    this.currentPreview = undefined;
    this.sequence += 1;
  }

  preview(): RoutePreview | undefined {
    return this.currentPreview ? structuredClone(this.currentPreview) : undefined;
  }

  snapshot(): RouteToolSnapshot | undefined {
    const active = this.activation;
    if (!active) return undefined;
    const spent = this.costs.reduce((sum, value) => sum + value, 0);
    return {
      armyId: active.armyId,
      start: { ...active.start },
      startCell: { ...active.startCell },
      points: this.points.map((point) => ({ ...point })),
      cells: this.cells.map((cell) => ({ ...cell })),
      stepCostUnits: [...this.costs],
      totalCostUnits: spent,
      remainingUnits: Math.max(0, active.movementUnits - spent),
      maxUnits: active.maxUnits,
      ...(this.currentPreview ? { preview: structuredClone(this.currentPreview) } : {})
    };
  }

  cancel(): void {
    this.deactivate();
  }

  undo(): RouteKeyResult {
    if (!this.activation) return { action: "IGNORED" };
    this.sequence += 1;
    this.points.pop();
    this.cells.pop();
    this.costs.pop();
    this.currentPreview = undefined;
    return { action: "EDITING" };
  }

  clear(): RouteKeyResult {
    if (!this.activation) return { action: "IGNORED" };
    this.sequence += 1;
    this.points = [];
    this.cells = [];
    this.costs = [];
    this.currentPreview = undefined;
    return { action: "EDITING" };
  }

  finish(): RouteFinishResult {
    const active = this.activation;
    if (!active) return { action: "IGNORED" };
    if (this.cells.length === 0) return { action: "INVALID", reason: "EMPTY_ROUTE" };
    if (this.currentPreview && !this.currentPreview.valid && this.currentPreview.reason && this.currentPreview.reason !== "INACTIVE") {
      return { action: "INVALID", reason: this.currentPreview.reason };
    }
    const result: RouteFinishResult = {
      action: "COMMIT",
      armyId: active.armyId,
      startCell: { ...active.startCell },
      route: this.points.map((point) => ({ ...point })),
      cells: this.cells.map((cell) => ({ ...cell })),
      totalCostUnits: this.costs.reduce((sum, value) => sum + value, 0)
    };
    this.deactivate();
    return result;
  }

  async move(point: Vector2): Promise<void> {
    const sequence = ++this.sequence;
    const preview = await this.analyze(point);
    if (sequence === this.sequence) this.currentPreview = preview;
  }

  async click(point: Vector2): Promise<RouteClickResult> {
    const active = this.activation;
    if (!active) return { accepted: false, reason: "INACTIVE" };
    const sequence = ++this.sequence;
    const preview = await this.analyze(point);
    if (sequence !== this.sequence || this.activation?.armyId !== active.armyId) {
      return { accepted: false, reason: "INACTIVE" };
    }
    this.currentPreview = preview;
    if (!preview.valid) return { accepted: false, reason: preview.reason ?? "INACTIVE" };
    const anchor = this.cells.at(-1) ?? active.startCell;
    if (preview.cell.x === anchor.x && preview.cell.y === anchor.y) return { accepted: true };
    this.cells.push({ ...preview.cell });
    this.points.push({ ...preview.point });
    this.costs.push(preview.stepCostUnits ?? 0);
    this.currentPreview = undefined;
    return { accepted: true };
  }

  key(key: string): RouteKeyResult {
    if (!this.activation) return { action: "IGNORED" };
    if (key === "Backspace") return this.undo();
    if (key === "Escape") {
      this.deactivate();
      return { action: "CANCEL" };
    }
    // Enter is intentionally ignored. Route completion is a visible ToolAction only.
    return { action: "IGNORED" };
  }

  private deactivate(): void {
    this.activation = undefined;
    this.points = [];
    this.cells = [];
    this.costs = [];
    this.currentPreview = undefined;
    this.sequence += 1;
  }

  private async analyze(pointer: Vector2): Promise<RoutePreview> {
    const active = this.activation;
    if (!active) {
      return {
        point: { ...pointer }, cell: { x: 0, y: 0 }, valid: false, color: "#d32f2f",
        label: messageForPreview("INACTIVE"), totalCostUnits: 0, remainingUnits: 0, reason: "INACTIVE"
      };
    }
    const snapped = await this.gridPort.snapGridCenter(pointer);
    const adapter = new StrategicGridAdapter({ dpi: active.gridDpi, offset: { x: 0, y: 0 } });
    const cell = adapter.sceneToCell(snapped);
    const point = adapter.cellToSceneCenter(cell);
    const anchorCell = this.cells.at(-1) ?? active.startCell;
    const anchorPoint = this.points.at(-1) ?? active.start;
    const spent = this.costs.reduce((sum, value) => sum + value, 0);
    const remaining = Math.max(0, active.movementUnits - spent);

    if (cell.x === anchorCell.x && cell.y === anchorCell.y) {
      return {
        point, cell, valid: true, color: "#2e7d32",
        label: `Маршрут: ${formatMovementUnits(spent)} ОП · останется ${formatMovementUnits(remaining)} ОП`,
        totalCostUnits: spent, remainingUnits: remaining, stepCostUnits: 0
      };
    }
    if (!isOrthogonalNeighbor(anchorCell, cell)) {
      return {
        point, cell, valid: false, color: "#d32f2f",
        label: messageForPreview("NOT_ORTHOGONAL"), totalCostUnits: spent,
        remainingUnits: remaining, reason: "NOT_ORTHOGONAL"
      };
    }
    const step = validateMovementStep({
      from: anchorCell,
      to: cell,
      sideId: active.sideId,
      cell: readCell(active.gridMap, cell),
      terrain: active.terrain,
      wars: active.wars,
      remainingUnits: remaining,
      withinBounds: true,
      armyStateAllowsMovement: true
    });
    if (!step.allowed) {
      return {
        point, cell, valid: false, color: "#d32f2f",
        label: messageForPreview(step.reason, step.missingUnits), totalCostUnits: spent,
        remainingUnits: remaining, reason: step.reason,
        ...(step.stepCostUnits !== undefined ? { stepCostUnits: step.stepCostUnits } : {})
      };
    }
    if (firstBarrierIntersection({ from: anchorPoint, to: point }, active.barriers)) {
      return {
        point, cell, valid: false, color: "#d32f2f", label: messageForPreview("BARRIER"),
        totalCostUnits: spent, remainingUnits: remaining, stepCostUnits: step.stepCostUnits,
        reason: "BARRIER"
      };
    }
    const total = spent + step.stepCostUnits;
    return {
      point, cell, valid: true,
      color: step.stepCostUnits <= 1 ? "#29b6f6" : step.stepCostUnits >= 4 ? "#f9a825" : "#2e7d32",
      label: `Шаг: ${formatMovementUnits(step.stepCostUnits)} ОП · маршрут: ${formatMovementUnits(total)} ОП · останется ${formatMovementUnits(step.remainingAfterUnits)} ОП`,
      totalCostUnits: total,
      remainingUnits: step.remainingAfterUnits,
      stepCostUnits: step.stepCostUnits
    };
  }
}

export interface RouteToolRegistrar {
  register(controller: RouteToolController, pointerHz: number): () => void;
}

export function setupRouteTool(registrar: RouteToolRegistrar, distancePort: GridRoutePort): () => void {
  return registrar.register(new RouteToolController(distancePort), 12);
}
