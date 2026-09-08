import { firstBarrierIntersection, type BarrierSegment } from "../barriers/barrierGeometry";
import { StrategicGridAdapter } from "../grid/strategicGrid";
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

export interface RouteFinishButton {
  position: Vector2;
  label: "Завершить маршрут";
  halfWidth: number;
  halfHeight: number;
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
  finishButton?: RouteFinishButton;
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

interface RouteAddition {
  point: Vector2;
  cell: GridCellCoord;
  cost: number;
}

interface RouteAnalysis {
  preview: RoutePreview;
  additions: RouteAddition[];
}

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

function straightCells(from: GridCellCoord, to: GridCellCoord): GridCellCoord[] | undefined {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx !== 0 && dy !== 0) return undefined;
  const count = Math.abs(dx) + Math.abs(dy);
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  return Array.from({ length: count }, (_unused, index) => ({
    x: from.x + stepX * (index + 1),
    y: from.y + stepY * (index + 1)
  }));
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
    const remaining = Math.max(0, active.movementUnits - spent);
    const lastPoint = this.points.at(-1);
    const finishButton = lastPoint && remaining > 0
      ? {
          position: { x: lastPoint.x, y: lastPoint.y - active.gridDpi * 0.35 },
          label: "Завершить маршрут" as const,
          halfWidth: active.gridDpi * 0.75,
          halfHeight: active.gridDpi * 0.2
        }
      : undefined;
    return {
      armyId: active.armyId,
      start: { ...active.start },
      startCell: { ...active.startCell },
      points: this.points.map((point) => ({ ...point })),
      cells: this.cells.map((cell) => ({ ...cell })),
      stepCostUnits: [...this.costs],
      totalCostUnits: spent,
      remainingUnits: remaining,
      maxUnits: active.maxUnits,
      ...(finishButton ? { finishButton } : {}),
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
    const analysis = await this.analyze(point);
    if (sequence === this.sequence) this.currentPreview = analysis.preview;
  }

  async click(point: Vector2): Promise<RouteClickResult> {
    const active = this.activation;
    if (!active) return { accepted: false, reason: "INACTIVE" };
    const sequence = ++this.sequence;
    const analysis = await this.analyze(point);
    if (sequence !== this.sequence || this.activation?.armyId !== active.armyId) {
      return { accepted: false, reason: "INACTIVE" };
    }
    this.currentPreview = analysis.preview;
    if (!analysis.preview.valid) {
      return { accepted: false, reason: analysis.preview.reason ?? "INACTIVE" };
    }
    for (const addition of analysis.additions) {
      this.cells.push({ ...addition.cell });
      this.points.push({ ...addition.point });
      this.costs.push(addition.cost);
    }
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

  private async analyze(pointer: Vector2): Promise<RouteAnalysis> {
    const active = this.activation;
    if (!active) {
      return {
        additions: [],
        preview: {
          point: { ...pointer }, cell: { x: 0, y: 0 }, valid: false, color: "#d32f2f",
          label: messageForPreview("INACTIVE"), totalCostUnits: 0, remainingUnits: 0, reason: "INACTIVE"
        }
      };
    }
    const snapped = await this.gridPort.snapGridCenter(pointer);
    const adapter = new StrategicGridAdapter({ dpi: active.gridDpi, offset: { x: 0, y: 0 } });
    const targetCell = adapter.sceneToCell(snapped);
    const targetPoint = adapter.cellToSceneCenter(targetCell);
    const anchorCell = this.cells.at(-1) ?? active.startCell;
    const anchorPoint = this.points.at(-1) ?? active.start;
    const spent = this.costs.reduce((sum, value) => sum + value, 0);
    const remaining = Math.max(0, active.movementUnits - spent);

    if (targetCell.x === anchorCell.x && targetCell.y === anchorCell.y) {
      return {
        additions: [],
        preview: {
          point: targetPoint, cell: targetCell, valid: true, color: "#2e7d32",
          label: `Маршрут: ${formatMovementUnits(spent)} ОП · останется ${formatMovementUnits(remaining)} ОП`,
          totalCostUnits: spent, remainingUnits: remaining, stepCostUnits: 0
        }
      };
    }

    const segment = straightCells(anchorCell, targetCell);
    if (!segment) {
      return {
        additions: [],
        preview: {
          point: targetPoint, cell: targetCell, valid: false, color: "#d32f2f",
          label: messageForPreview("NOT_ORTHOGONAL"), totalCostUnits: spent,
          remainingUnits: remaining, reason: "NOT_ORTHOGONAL"
        }
      };
    }

    const additions: RouteAddition[] = [];
    let runningSpent = spent;
    let runningRemaining = remaining;
    let fromPoint = anchorPoint;
    for (const cell of segment) {
      const point = adapter.cellToSceneCenter(cell);
      const step = validateMovementStep({
        from: additions.at(-1)?.cell ?? anchorCell,
        to: cell,
        sideId: active.sideId,
        cell: readCell(active.gridMap, cell),
        terrain: active.terrain,
        wars: active.wars,
        remainingUnits: runningRemaining,
        withinBounds: true,
        armyStateAllowsMovement: true
      });
      if (!step.allowed) {
        return {
          additions: [],
          preview: {
            point, cell, valid: false, color: "#d32f2f",
            label: messageForPreview(step.reason, step.missingUnits), totalCostUnits: runningSpent,
            remainingUnits: runningRemaining, reason: step.reason,
            ...(step.stepCostUnits !== undefined ? { stepCostUnits: step.stepCostUnits } : {})
          }
        };
      }
      if (firstBarrierIntersection({ from: fromPoint, to: point }, active.barriers)) {
        return {
          additions: [],
          preview: {
            point, cell, valid: false, color: "#d32f2f", label: messageForPreview("BARRIER"),
            totalCostUnits: runningSpent, remainingUnits: runningRemaining,
            stepCostUnits: step.stepCostUnits, reason: "BARRIER"
          }
        };
      }
      additions.push({ point, cell: { ...cell }, cost: step.stepCostUnits });
      runningSpent += step.stepCostUnits;
      runningRemaining = step.remainingAfterUnits;
      fromPoint = point;
    }

    const segmentCost = runningSpent - spent;
    const lastCost = additions.at(-1)?.cost ?? 0;
    return {
      additions,
      preview: {
        point: targetPoint,
        cell: targetCell,
        valid: true,
        color: lastCost <= 1 ? "#29b6f6" : lastCost >= 4 ? "#f9a825" : "#2e7d32",
        label: `Отрезок: ${formatMovementUnits(segmentCost)} ОП · маршрут: ${formatMovementUnits(runningSpent)} ОП · останется ${formatMovementUnits(runningRemaining)} ОП`,
        totalCostUnits: runningSpent,
        remainingUnits: runningRemaining,
        stepCostUnits: segmentCost
      }
    };
  }
}

export interface RouteToolRegistrar {
  register(controller: RouteToolController, pointerHz: number): () => void;
}

export function setupRouteTool(registrar: RouteToolRegistrar, distancePort: GridRoutePort): () => void {
  return registrar.register(new RouteToolController(distancePort), 12);
}
