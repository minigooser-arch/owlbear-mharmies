import { StrategicGridAdapter } from "../grid/strategicGrid";
import {
  facingForStrategicStep,
  strategicTurnCost,
  type ShipStrategicMovementFailure
} from "../naval/ships/shipStrategicMovement";
import { readCell } from "../terrain/gridMap";
import { cellSupportsDomain } from "../terrain/movementDomains";
import type {
  GridCellCoord,
  GridMapState,
  ShipFacing,
  TerrainRegistryState,
  Vector2
} from "../shared/types";

export interface ShipRouteToolActivation {
  shipId: string;
  start: Vector2;
  startCell: GridCellCoord;
  gridDpi: number;
  movementPoints: number;
  maxMovementPoints: number;
  facing: ShipFacing;
  terrain: TerrainRegistryState;
  gridMap: GridMapState;
}

export type ShipRouteFailure = ShipStrategicMovementFailure | "INACTIVE";

export interface ShipRoutePreview {
  point: Vector2;
  cell: GridCellCoord;
  valid: boolean;
  color: string;
  label: string;
  spentMovementPoints: number;
  remainingMovementPoints: number;
  reason?: ShipRouteFailure;
}

export interface ShipRouteFinishButton {
  position: Vector2;
  label: "Завершить маршрут";
  halfWidth: number;
  halfHeight: number;
}

export interface ShipRouteToolSnapshot {
  shipId: string;
  start: Vector2;
  startCell: GridCellCoord;
  points: readonly Vector2[];
  cells: readonly GridCellCoord[];
  stepMovementCosts: readonly number[];
  spentMovementPoints: number;
  remainingMovementPoints: number;
  maxMovementPoints: number;
  plannedFacing: ShipFacing;
  finishButton?: ShipRouteFinishButton;
  preview?: ShipRoutePreview;
}

export type ShipRouteClickResult =
  | { accepted: true }
  | { accepted: false; reason: ShipRouteFailure };

export type ShipRouteKeyResult =
  | { action: "EDITING" }
  | { action: "CANCEL" }
  | { action: "IGNORED" };

export type ShipRouteFinishResult =
  | {
      action: "COMMIT";
      shipId: string;
      startCell: GridCellCoord;
      points: Vector2[];
      cells: GridCellCoord[];
    }
  | { action: "INVALID"; reason: ShipRouteFailure | "EMPTY_ROUTE" }
  | { action: "IGNORED" };

interface ShipRouteAddition {
  point: Vector2;
  cell: GridCellCoord;
  cost: number;
  facing: ShipFacing;
}

interface ShipRouteAnalysis {
  preview: ShipRoutePreview;
  additions: ShipRouteAddition[];
}

function messageFor(reason: ShipRouteFailure): string {
  switch (reason) {
    case "NOT_ORTHOGONAL": return "Только по горизонтали или вертикали";
    case "IMPASSABLE": return "Непроходимая клетка";
    case "NON_NAVAL_TERRAIN": return "Корабль может идти только по морю или каналу";
    case "INSUFFICIENT_MOVEMENT_POINTS": return "Не хватает очков перемещения";
    case "INACTIVE": return "Инструмент маршрута не активен";
    default: return "Эту клетку нельзя добавить в маршрут";
  }
}

function straightCells(from: GridCellCoord, to: GridCellCoord): GridCellCoord[] | undefined {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx !== 0 && dy !== 0) return undefined;
  const count = Math.abs(dx) + Math.abs(dy);
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  const cells: GridCellCoord[] = [];
  for (let index = 1; index <= count; index += 1) {
    cells.push({ x: from.x + stepX * index, y: from.y + stepY * index });
  }
  return cells;
}

export class ShipRouteToolController {
  private activation: ShipRouteToolActivation | undefined;
  private points: Vector2[] = [];
  private cells: GridCellCoord[] = [];
  private costs: number[] = [];
  private facings: ShipFacing[] = [];
  private currentPreview: ShipRoutePreview | undefined;
  private sequence = 0;

  constructor(private readonly gridPort: { snapGridCenter(position: Vector2): Promise<Vector2> }) {}

  activate(input: ShipRouteToolActivation): void {
    this.activation = structuredClone(input);
    this.points = [];
    this.cells = [];
    this.costs = [];
    this.facings = [];
    this.currentPreview = undefined;
    this.sequence += 1;
  }

  snapshot(): ShipRouteToolSnapshot | undefined {
    const active = this.activation;
    if (!active) return undefined;
    const spent = this.costs.reduce((sum, cost) => sum + cost, 0);
    const remaining = Math.max(0, active.movementPoints - spent);
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
      shipId: active.shipId,
      start: { ...active.start },
      startCell: { ...active.startCell },
      points: this.points.map((point) => ({ ...point })),
      cells: this.cells.map((cell) => ({ ...cell })),
      stepMovementCosts: [...this.costs],
      spentMovementPoints: spent,
      remainingMovementPoints: remaining,
      maxMovementPoints: active.maxMovementPoints,
      plannedFacing: this.facings.at(-1) ?? active.facing,
      ...(finishButton ? { finishButton } : {}),
      ...(this.currentPreview ? { preview: structuredClone(this.currentPreview) } : {})
    };
  }

  cancel(): void {
    this.deactivate();
  }

  undo(): ShipRouteKeyResult {
    if (!this.activation) return { action: "IGNORED" };
    this.sequence += 1;
    this.points.pop();
    this.cells.pop();
    this.costs.pop();
    this.facings.pop();
    this.currentPreview = undefined;
    return { action: "EDITING" };
  }

  clear(): ShipRouteKeyResult {
    if (!this.activation) return { action: "IGNORED" };
    this.sequence += 1;
    this.points = [];
    this.cells = [];
    this.costs = [];
    this.facings = [];
    this.currentPreview = undefined;
    return { action: "EDITING" };
  }

  key(key: string): ShipRouteKeyResult {
    if (!this.activation) return { action: "IGNORED" };
    if (key === "Backspace") return this.undo();
    if (key === "Escape") {
      this.deactivate();
      return { action: "CANCEL" };
    }
    return { action: "IGNORED" };
  }

  finish(): ShipRouteFinishResult {
    const active = this.activation;
    if (!active) return { action: "IGNORED" };
    if (this.cells.length === 0) return { action: "INVALID", reason: "EMPTY_ROUTE" };
    const result: ShipRouteFinishResult = {
      action: "COMMIT",
      shipId: active.shipId,
      startCell: { ...active.startCell },
      points: this.points.map((point) => ({ ...point })),
      cells: this.cells.map((cell) => ({ ...cell }))
    };
    this.deactivate();
    return result;
  }

  async move(point: Vector2): Promise<void> {
    const sequence = ++this.sequence;
    const analysis = await this.analyze(point);
    if (sequence === this.sequence) this.currentPreview = analysis.preview;
  }

  async click(point: Vector2): Promise<ShipRouteClickResult> {
    const active = this.activation;
    if (!active) return { accepted: false, reason: "INACTIVE" };
    const sequence = ++this.sequence;
    const analysis = await this.analyze(point);
    if (sequence !== this.sequence || this.activation?.shipId !== active.shipId) {
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
      this.facings.push(addition.facing);
    }
    this.currentPreview = undefined;
    return { accepted: true };
  }

  private deactivate(): void {
    this.activation = undefined;
    this.points = [];
    this.cells = [];
    this.costs = [];
    this.facings = [];
    this.currentPreview = undefined;
    this.sequence += 1;
  }

  private async analyze(pointer: Vector2): Promise<ShipRouteAnalysis> {
    const active = this.activation;
    if (!active) {
      return {
        additions: [],
        preview: {
          point: { ...pointer },
          cell: { x: 0, y: 0 },
          valid: false,
          color: "#d32f2f",
          label: messageFor("INACTIVE"),
          spentMovementPoints: 0,
          remainingMovementPoints: 0,
          reason: "INACTIVE"
        }
      };
    }

    const snapped = await this.gridPort.snapGridCenter(pointer);
    const grid = new StrategicGridAdapter({ dpi: active.gridDpi, offset: { x: 0, y: 0 } });
    const targetCell = grid.sceneToCell(snapped);
    const targetPoint = grid.cellToSceneCenter(targetCell);
    const anchor = this.cells.at(-1) ?? active.startCell;
    const spent = this.costs.reduce((sum, cost) => sum + cost, 0);
    const remaining = Math.max(0, active.movementPoints - spent);
    const startingFacing = this.facings.at(-1) ?? active.facing;

    if (targetCell.x === anchor.x && targetCell.y === anchor.y) {
      return {
        additions: [],
        preview: {
          point: targetPoint,
          cell: targetCell,
          valid: true,
          color: "#4f687a",
          label: `Маршрут: ${spent} ОП · останется ${remaining} ОП`,
          spentMovementPoints: spent,
          remainingMovementPoints: remaining
        }
      };
    }

    const segment = straightCells(anchor, targetCell);
    if (!segment) return this.invalid(targetPoint, targetCell, "NOT_ORTHOGONAL", spent, remaining);

    const scene = { terrain: active.terrain, gridMap: active.gridMap };
    const additions: ShipRouteAddition[] = [];
    let previous = anchor;
    let facing = startingFacing;
    let runningSpent = spent;
    let runningRemaining = remaining;
    let turnCostTotal = 0;

    for (const cell of segment) {
      const point = grid.cellToSceneCenter(cell);
      if (readCell(active.gridMap, cell).impassable) {
        return this.invalid(point, cell, "IMPASSABLE", runningSpent, runningRemaining);
      }
      if (!cellSupportsDomain(scene, cell, "SEA")) {
        return this.invalid(point, cell, "NON_NAVAL_TERRAIN", runningSpent, runningRemaining);
      }
      const requiredFacing = facingForStrategicStep(previous, cell);
      if (!requiredFacing) {
        return this.invalid(point, cell, "NOT_ORTHOGONAL", runningSpent, runningRemaining);
      }
      const turnCost = strategicTurnCost(facing, requiredFacing);
      const stepCost = turnCost + 1;
      if (stepCost > runningRemaining) {
        return this.invalid(point, cell, "INSUFFICIENT_MOVEMENT_POINTS", runningSpent, runningRemaining);
      }
      additions.push({ point, cell: { ...cell }, cost: stepCost, facing: requiredFacing });
      turnCostTotal += turnCost;
      runningSpent += stepCost;
      runningRemaining -= stepCost;
      facing = requiredFacing;
      previous = cell;
    }

    const moveCost = additions.length;
    const label = turnCostTotal > 0
      ? `Поворот: ${turnCostTotal} ОП · ход: ${moveCost} ОП · маршрут: ${runningSpent} ОП · останется ${runningRemaining} ОП`
      : `Ход: ${moveCost} ОП · маршрут: ${runningSpent} ОП · останется ${runningRemaining} ОП`;
    return {
      additions,
      preview: {
        point: targetPoint,
        cell: targetCell,
        valid: true,
        color: "#4f687a",
        label,
        spentMovementPoints: runningSpent,
        remainingMovementPoints: runningRemaining
      }
    };
  }

  private invalid(
    point: Vector2,
    cell: GridCellCoord,
    reason: ShipRouteFailure,
    spent: number,
    remaining: number
  ): ShipRouteAnalysis {
    return {
      additions: [],
      preview: {
        point: { ...point },
        cell: { ...cell },
        valid: false,
        color: "#d32f2f",
        label: messageFor(reason),
        spentMovementPoints: spent,
        remainingMovementPoints: remaining,
        reason
      }
    };
  }
}
