import { readCell } from "../terrain/gridMap";
import { cellSupportsDomain } from "../terrain/movementDomains";
import type { GridCellCoord, GridMapState, ShipFacing, TerrainRegistryState, Vector2 } from "../shared/types";
import type { ShipStrategicMovementFailure } from "../naval/ships/shipStrategicMovement";
import { facingForStep, quarterTurnCost } from "../naval/ships/shipHeading";
import { straightGridSegment } from "./straightGridSegment";

export interface ShipRouteToolActivation {
  shipId: string;
  start: Vector2;
  startCell: GridCellCoord;
  gridDpi: number;
  movementPoints: number;
  maxMovementPoints: number;
  facing: ShipFacing;
  initialCells?: readonly GridCellCoord[];
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
  stepCost?: number;
  nextFacing?: ShipFacing;
  segmentCells?: readonly GridCellCoord[];
  segmentPoints?: readonly Vector2[];
  segmentStepCosts?: readonly number[];
  segmentFacings?: readonly ShipFacing[];
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
  stepCosts: readonly number[];
  spentMovementPoints: number;
  remainingMovementPoints: number;
  maxMovementPoints: number;
  finalFacing: ShipFacing;
  finishButton?: ShipRouteFinishButton;
  preview?: ShipRoutePreview;
}

export type ShipRouteClickResult = { accepted: true } | { accepted: false; reason: ShipRouteFailure };
export type ShipRouteKeyResult = { action: "EDITING" } | { action: "CANCEL" } | { action: "IGNORED" };
export type ShipRouteFinishResult =
  | { action: "COMMIT"; shipId: string; startCell: GridCellCoord; points: Vector2[]; cells: GridCellCoord[] }
  | { action: "INVALID"; reason: ShipRouteFailure | "EMPTY_ROUTE" }
  | { action: "IGNORED" };

function messageFor(reason: ShipRouteFailure): string {
  switch (reason) {
    case "NOT_ORTHOGONAL": return "Только по горизонтали или вертикали";
    case "IMPASSABLE": return "Непроходимая клетка";
    case "NON_NAVAL_TERRAIN": return "Корабль может идти только по морю или каналу";
    case "INSUFFICIENT_MOVEMENT_POINTS": return "Не хватает очков перемещения";
    case "INACTIVE": return "Инструмент маршрута не активен";
  }
}

function cellForSnappedPoint(active: ShipRouteToolActivation, point: Vector2): GridCellCoord {
  return {
    x: active.startCell.x + Math.round((point.x - active.start.x) / active.gridDpi),
    y: active.startCell.y + Math.round((point.y - active.start.y) / active.gridDpi)
  };
}

function pointForCell(active: ShipRouteToolActivation, cell: GridCellCoord): Vector2 {
  return {
    x: active.start.x + (cell.x - active.startCell.x) * active.gridDpi,
    y: active.start.y + (cell.y - active.startCell.y) * active.gridDpi
  };
}

function samePreview(left: ShipRoutePreview | undefined, right: ShipRoutePreview): boolean {
  return left !== undefined &&
    left.cell.x === right.cell.x &&
    left.cell.y === right.cell.y &&
    left.valid === right.valid &&
    left.label === right.label &&
    left.reason === right.reason &&
    left.spentMovementPoints === right.spentMovementPoints &&
    left.remainingMovementPoints === right.remainingMovementPoints;
}

export class ShipRouteToolController {
  private activation: ShipRouteToolActivation | undefined;
  private points: Vector2[] = [];
  private cells: GridCellCoord[] = [];
  private stepCosts: number[] = [];
  private facings: ShipFacing[] = [];
  private currentPreview: ShipRoutePreview | undefined;
  private sequence = 0;

  constructor(private readonly gridPort: { snapGridCenter(position: Vector2): Promise<Vector2> }) {}

  activate(input: ShipRouteToolActivation): void {
    this.activation = structuredClone(input);
    this.points = [];
    this.cells = [];
    this.stepCosts = [];
    this.facings = [];
    let previous = input.startCell;
    let facing = input.facing;
    for (const cell of input.initialCells ?? []) {
      const requiredFacing = facingForStep(previous, cell);
      if (!requiredFacing) break;
      this.cells.push({ ...cell });
      this.points.push(pointForCell(input, cell));
      this.stepCosts.push(quarterTurnCost(facing, requiredFacing) + 1);
      this.facings.push(requiredFacing);
      facing = requiredFacing;
      previous = cell;
    }
    this.currentPreview = undefined;
    this.sequence += 1;
  }

  snapshot(): ShipRouteToolSnapshot | undefined {
    const active = this.activation;
    if (!active) return undefined;
    const spent = this.stepCosts.reduce((sum, cost) => sum + cost, 0);
    const lastPoint = this.points.at(-1);
    const finishButton = lastPoint ? {
      position: { x: lastPoint.x, y: lastPoint.y - active.gridDpi * 0.35 },
      label: "Завершить маршрут" as const,
      halfWidth: active.gridDpi * 0.75,
      halfHeight: active.gridDpi * 0.2
    } : undefined;
    return {
      shipId: active.shipId,
      start: { ...active.start },
      startCell: { ...active.startCell },
      points: this.points.map((point) => ({ ...point })),
      cells: this.cells.map((cell) => ({ ...cell })),
      stepCosts: [...this.stepCosts],
      spentMovementPoints: spent,
      remainingMovementPoints: Math.max(0, active.movementPoints - spent),
      maxMovementPoints: active.maxMovementPoints,
      finalFacing: this.facings.at(-1) ?? active.facing,
      ...(finishButton ? { finishButton } : {}),
      ...(this.currentPreview ? { preview: structuredClone(this.currentPreview) } : {})
    };
  }

  cancel(): void { this.deactivate(); }

  undo(): ShipRouteKeyResult {
    if (!this.activation) return { action: "IGNORED" };
    this.sequence += 1;
    this.points.pop();
    this.cells.pop();
    this.stepCosts.pop();
    this.facings.pop();
    this.currentPreview = undefined;
    return { action: "EDITING" };
  }

  clear(): ShipRouteKeyResult {
    if (!this.activation) return { action: "IGNORED" };
    this.sequence += 1;
    this.points = [];
    this.cells = [];
    this.stepCosts = [];
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

  async move(point: Vector2): Promise<boolean> {
    const sequence = ++this.sequence;
    const preview = await this.analyze(point);
    if (sequence !== this.sequence) return false;
    if (samePreview(this.currentPreview, preview)) return false;
    this.currentPreview = preview;
    return true;
  }

  async click(point: Vector2): Promise<ShipRouteClickResult> {
    const active = this.activation;
    if (!active) return { accepted: false, reason: "INACTIVE" };
    const sequence = ++this.sequence;
    const preview = await this.analyze(point);
    if (sequence !== this.sequence || this.activation?.shipId !== active.shipId) {
      return { accepted: false, reason: "INACTIVE" };
    }
    this.currentPreview = preview;
    if (!preview.valid) return { accepted: false, reason: preview.reason ?? "INACTIVE" };
    const anchor = this.cells.at(-1) ?? active.startCell;
    if (preview.cell.x === anchor.x && preview.cell.y === anchor.y) return { accepted: true };

    const segmentCells = preview.segmentCells ?? [{ ...preview.cell }];
    const segmentPoints = preview.segmentPoints ?? [{ ...preview.point }];
    const segmentCosts = preview.segmentStepCosts ?? [preview.stepCost ?? 0];
    const segmentFacings = preview.segmentFacings ?? [preview.nextFacing ?? this.facings.at(-1) ?? active.facing];
    this.cells.push(...segmentCells.map((cell) => ({ ...cell })));
    this.points.push(...segmentPoints.map((segmentPoint) => ({ ...segmentPoint })));
    this.stepCosts.push(...segmentCosts);
    this.facings.push(...segmentFacings);
    this.currentPreview = undefined;
    return { accepted: true };
  }

  private deactivate(): void {
    this.activation = undefined;
    this.points = [];
    this.cells = [];
    this.stepCosts = [];
    this.facings = [];
    this.currentPreview = undefined;
    this.sequence += 1;
  }

  private async analyze(pointer: Vector2): Promise<ShipRoutePreview> {
    const active = this.activation;
    if (!active) {
      return {
        point: { ...pointer }, cell: { x: 0, y: 0 }, valid: false, color: "#d32f2f",
        label: messageFor("INACTIVE"), spentMovementPoints: 0, remainingMovementPoints: 0,
        reason: "INACTIVE"
      };
    }
    const snapped = await this.gridPort.snapGridCenter(pointer);
    const cell = cellForSnappedPoint(active, snapped);
    const point = pointForCell(active, cell);
    const anchor = this.cells.at(-1) ?? active.startCell;
    const spent = this.stepCosts.reduce((sum, cost) => sum + cost, 0);
    const remaining = Math.max(0, active.movementPoints - spent);
    const segment = straightGridSegment(anchor, cell);

    if (!segment) return this.invalid(point, cell, "NOT_ORTHOGONAL", spent, remaining);
    if (segment.length === 0) {
      return {
        point, cell, valid: true, color: "#4f687a",
        label: `Маршрут: ${spent} ОП · останется ${remaining} ОП`,
        spentMovementPoints: spent, remainingMovementPoints: remaining,
        segmentCells: [], segmentPoints: [], segmentStepCosts: [], segmentFacings: []
      };
    }

    const scene = { terrain: active.terrain, gridMap: active.gridMap };
    const segmentPoints: Vector2[] = [];
    const segmentCosts: number[] = [];
    const segmentFacings: ShipFacing[] = [];
    let cursor = anchor;
    let cursorFacing = this.facings.at(-1) ?? active.facing;
    let cursorRemaining = remaining;
    let segmentCost = 0;
    let totalTurnCost = 0;

    for (const nextCell of segment) {
      const nextPoint = pointForCell(active, nextCell);
      if (readCell(active.gridMap, nextCell).impassable) {
        return this.invalid(point, cell, "IMPASSABLE", spent + segmentCost, cursorRemaining);
      }
      if (!cellSupportsDomain(scene, nextCell, "SEA")) {
        return this.invalid(point, cell, "NON_NAVAL_TERRAIN", spent + segmentCost, cursorRemaining);
      }
      const requiredFacing = facingForStep(cursor, nextCell);
      if (!requiredFacing) {
        return this.invalid(point, cell, "NOT_ORTHOGONAL", spent + segmentCost, cursorRemaining);
      }
      const turnCost = quarterTurnCost(cursorFacing, requiredFacing);
      const stepCost = turnCost + 1;
      if (cursorRemaining < stepCost) {
        return this.invalid(point, cell, "INSUFFICIENT_MOVEMENT_POINTS", spent + segmentCost, cursorRemaining);
      }
      segmentPoints.push(nextPoint);
      segmentCosts.push(stepCost);
      segmentFacings.push(requiredFacing);
      segmentCost += stepCost;
      totalTurnCost += turnCost;
      cursorRemaining -= stepCost;
      cursor = nextCell;
      cursorFacing = requiredFacing;
    }

    const total = spent + segmentCost;
    return {
      point, cell, valid: true, color: "#4f687a",
      label: segment.length > 1
        ? `${totalTurnCost > 0 ? `Поворот: ${totalTurnCost} ОП · ` : ""}ход: ${segment.length} ОП · маршрут: ${total} ОП · останется ${cursorRemaining} ОП`
        : totalTurnCost > 0
          ? `Поворот: ${totalTurnCost} ОП · ход: 1 ОП · маршрут: ${total} ОП · останется ${cursorRemaining} ОП`
          : `Ход: 1 ОП · маршрут: ${total} ОП · останется ${cursorRemaining} ОП`,
      spentMovementPoints: total,
      remainingMovementPoints: cursorRemaining,
      stepCost: segmentCost,
      nextFacing: cursorFacing,
      segmentCells: segment.map((segmentCell) => ({ ...segmentCell })),
      segmentPoints: segmentPoints.map((segmentPoint) => ({ ...segmentPoint })),
      segmentStepCosts: [...segmentCosts],
      segmentFacings: [...segmentFacings]
    };
  }

  private invalid(
    point: Vector2,
    cell: GridCellCoord,
    reason: ShipRouteFailure,
    spent: number,
    remaining: number
  ): ShipRoutePreview {
    return {
      point: { ...point }, cell: { ...cell }, valid: false, color: "#d32f2f",
      label: messageFor(reason), spentMovementPoints: spent,
      remainingMovementPoints: remaining, reason
    };
  }
}
