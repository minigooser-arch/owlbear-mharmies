import { StrategicGridAdapter, isOrthogonalNeighbor } from "../grid/strategicGrid";
import { readCell } from "../terrain/gridMap";
import { cellSupportsDomain } from "../terrain/movementDomains";
import type { GridCellCoord, GridMapState, TerrainRegistryState, Vector2 } from "../shared/types";
import type { ShipStrategicMovementFailure } from "../naval/ships/shipStrategicMovement";

export interface ShipRouteToolActivation {
  shipId: string;
  start: Vector2;
  startCell: GridCellCoord;
  gridDpi: number;
  movementPoints: number;
  maxMovementPoints: number;
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

export interface ShipRouteToolSnapshot {
  shipId: string;
  start: Vector2;
  startCell: GridCellCoord;
  points: readonly Vector2[];
  cells: readonly GridCellCoord[];
  spentMovementPoints: number;
  remainingMovementPoints: number;
  maxMovementPoints: number;
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

export class ShipRouteToolController {
  private activation: ShipRouteToolActivation | undefined;
  private points: Vector2[] = [];
  private cells: GridCellCoord[] = [];
  private currentPreview: ShipRoutePreview | undefined;
  private sequence = 0;

  constructor(private readonly gridPort: { snapGridCenter(position: Vector2): Promise<Vector2> }) {}

  activate(input: ShipRouteToolActivation): void {
    this.activation = structuredClone(input);
    this.points = [];
    this.cells = [];
    this.currentPreview = undefined;
    this.sequence += 1;
  }

  snapshot(): ShipRouteToolSnapshot | undefined {
    const active = this.activation;
    if (!active) return undefined;
    const spent = this.cells.length;
    return {
      shipId: active.shipId,
      start: { ...active.start },
      startCell: { ...active.startCell },
      points: this.points.map((point) => ({ ...point })),
      cells: this.cells.map((cell) => ({ ...cell })),
      spentMovementPoints: spent,
      remainingMovementPoints: Math.max(0, active.movementPoints - spent),
      maxMovementPoints: active.maxMovementPoints,
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
    this.currentPreview = undefined;
    return { action: "EDITING" };
  }

  clear(): ShipRouteKeyResult {
    if (!this.activation) return { action: "IGNORED" };
    this.sequence += 1;
    this.points = [];
    this.cells = [];
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
    if (this.currentPreview && !this.currentPreview.valid && this.currentPreview.reason) {
      return { action: "INVALID", reason: this.currentPreview.reason };
    }
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
    const preview = await this.analyze(point);
    if (sequence === this.sequence) this.currentPreview = preview;
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
    this.cells.push({ ...preview.cell });
    this.points.push({ ...preview.point });
    this.currentPreview = undefined;
    return { accepted: true };
  }

  private deactivate(): void {
    this.activation = undefined;
    this.points = [];
    this.cells = [];
    this.currentPreview = undefined;
    this.sequence += 1;
  }

  private async analyze(pointer: Vector2): Promise<ShipRoutePreview> {
    const active = this.activation;
    if (!active) {
      return {
        point: { ...pointer },
        cell: { x: 0, y: 0 },
        valid: false,
        color: "#d32f2f",
        label: messageFor("INACTIVE"),
        spentMovementPoints: 0,
        remainingMovementPoints: 0,
        reason: "INACTIVE"
      };
    }
    const point = await this.gridPort.snapGridCenter(pointer);
    const grid = new StrategicGridAdapter({ dpi: active.gridDpi, offset: { x: 0, y: 0 } });
    const cell = grid.sceneToCell(point);
    const anchor = this.cells.at(-1) ?? active.startCell;
    const spent = this.cells.length;
    const remaining = Math.max(0, active.movementPoints - spent);

    if (cell.x === anchor.x && cell.y === anchor.y) {
      return {
        point: { ...point }, cell, valid: true, color: "#4f687a",
        label: `Маршрут: ${spent} ОП · останется ${remaining} ОП`,
        spentMovementPoints: spent, remainingMovementPoints: remaining
      };
    }
    if (!isOrthogonalNeighbor(anchor, cell)) {
      return this.invalid(point, cell, "NOT_ORTHOGONAL", spent, remaining);
    }
    const scene = { terrain: active.terrain, gridMap: active.gridMap };
    if (readCell(active.gridMap, cell).impassable) {
      return this.invalid(point, cell, "IMPASSABLE", spent, remaining);
    }
    if (!cellSupportsDomain(scene, cell, "SEA")) {
      return this.invalid(point, cell, "NON_NAVAL_TERRAIN", spent, remaining);
    }
    if (remaining < 1) {
      return this.invalid(point, cell, "INSUFFICIENT_MOVEMENT_POINTS", spent, remaining);
    }
    const total = spent + 1;
    return {
      point: { ...point },
      cell,
      valid: true,
      color: "#4f687a",
      label: `Шаг: 1 ОП · маршрут: ${total} ОП · останется ${remaining - 1} ОП`,
      spentMovementPoints: total,
      remainingMovementPoints: remaining - 1
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
      point: { ...point },
      cell: { ...cell },
      valid: false,
      color: "#d32f2f",
      label: messageFor(reason),
      spentMovementPoints: spent,
      remainingMovementPoints: remaining,
      reason
    };
  }
}
