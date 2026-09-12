import { firstBarrierIntersection, type BarrierSegment } from "../barriers/barrierGeometry";
import { validateMovementStep } from "../movement/movementRules";
import { classifyStateMovementAccess } from "../movement/stateMovementAccess";
import type { GridRoutePort } from "../routes/routeMath";
import { readCell } from "../terrain/gridMap";
import type {
  GridCellCoord,
  GridMapState,
  MovementDenialReason,
  Side,
  StateEntity,
  StateRelations,
  TerrainRegistryState,
  Vector2,
  WarState
} from "../shared/types";
import { straightGridSegment } from "./straightGridSegment";

export type PoliticalRouteDenialReason =
  | "FOREIGN_STATE_CLOSED"
  | "STATELESS_FACTION"
  | "INVALID_POLITICAL_CONFIG";

export interface RoutePreview {
  point: Vector2;
  cell: GridCellCoord;
  valid: boolean;
  color: string;
  label: string;
  totalCostUnits: number;
  remainingUnits: number;
  stepCostUnits?: number;
  segmentCells?: readonly GridCellCoord[];
  segmentPoints?: readonly Vector2[];
  segmentStepCostUnits?: readonly number[];
  reason?: MovementDenialReason | PoliticalRouteDenialReason | "BARRIER" | "INACTIVE";
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
  /** Current political model. Optional only for legacy tests/sessions during migration. */
  sides?: readonly Side[];
  states?: readonly StateEntity[];
  stateRelations?: StateRelations;
  barriers: readonly BarrierSegment[];
}

export type RouteClickResult =
  | { accepted: true }
  | { accepted: false; reason: MovementDenialReason | PoliticalRouteDenialReason | "BARRIER" | "INACTIVE" };

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
  | { action: "INVALID"; reason: MovementDenialReason | PoliticalRouteDenialReason | "EMPTY_ROUTE" }
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
    case "FOREIGN_STATE_CLOSED": return "Закрытая государственная граница";
    case "STATELESS_FACTION": return "Фракция без государства не может войти на государственную территорию";
    case "INVALID_POLITICAL_CONFIG": return "Некорректная политическая конфигурация";
    case "INVALID_TERRAIN": return "Недоступный тип местности";
    case "INSUFFICIENT_MOVEMENT_POINTS": return `Не хватает ${formatMovementUnits(missingUnits ?? 0)} ОП`;
    case "ARMY_STATE_BLOCKS_MOVEMENT": return "Состояние армии запрещает движение";
    case "BARRIER": return "Путь перекрыт препятствием";
    case "INACTIVE": return "Инструмент маршрута не активен";
    default: return "";
  }
}

function stateName(active: RouteToolActivation, stateId: string): string {
  return active.states?.find((state) => state.id === stateId)?.name ?? stateId;
}

function cellForSnappedPoint(active: RouteToolActivation, point: Vector2): GridCellCoord {
  return {
    x: active.startCell.x + Math.round((point.x - active.start.x) / active.gridDpi),
    y: active.startCell.y + Math.round((point.y - active.start.y) / active.gridDpi)
  };
}

function pointForCell(active: RouteToolActivation, cell: GridCellCoord): Vector2 {
  return {
    x: active.start.x + (cell.x - active.startCell.x) * active.gridDpi,
    y: active.start.y + (cell.y - active.startCell.y) * active.gridDpi
  };
}

function samePreview(left: RoutePreview | undefined, right: RoutePreview): boolean {
  return left !== undefined &&
    left.cell.x === right.cell.x &&
    left.cell.y === right.cell.y &&
    left.valid === right.valid &&
    left.label === right.label &&
    left.reason === right.reason &&
    left.totalCostUnits === right.totalCostUnits &&
    left.remainingUnits === right.remainingUnits;
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

  async move(point: Vector2): Promise<boolean> {
    const sequence = ++this.sequence;
    const preview = await this.analyze(point);
    if (sequence !== this.sequence) return false;
    if (samePreview(this.currentPreview, preview)) return false;
    this.currentPreview = preview;
    return true;
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

    const segmentCells = preview.segmentCells ?? [{ ...preview.cell }];
    const segmentPoints = preview.segmentPoints ?? [{ ...preview.point }];
    const segmentCosts = preview.segmentStepCostUnits ?? [preview.stepCostUnits ?? 0];
    this.cells.push(...segmentCells.map((cell) => ({ ...cell })));
    this.points.push(...segmentPoints.map((segmentPoint) => ({ ...segmentPoint })));
    this.costs.push(...segmentCosts);
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

  private async analyze(pointer: Vector2): Promise<RoutePreview> {
    const active = this.activation;
    if (!active) {
      return {
        point: { ...pointer }, cell: { x: 0, y: 0 }, valid: false, color: "#d32f2f",
        label: messageForPreview("INACTIVE"), totalCostUnits: 0, remainingUnits: 0, reason: "INACTIVE"
      };
    }
    const snapped = await this.gridPort.snapGridCenter(pointer);
    const cell = cellForSnappedPoint(active, snapped);
    const point = pointForCell(active, cell);
    const anchorCell = this.cells.at(-1) ?? active.startCell;
    const anchorPoint = this.points.at(-1) ?? active.start;
    const spent = this.costs.reduce((sum, value) => sum + value, 0);
    const remaining = Math.max(0, active.movementUnits - spent);
    const segment = straightGridSegment(anchorCell, cell);

    if (!segment) {
      return {
        point, cell, valid: false, color: "#d32f2f",
        label: messageForPreview("NOT_ORTHOGONAL"), totalCostUnits: spent,
        remainingUnits: remaining, reason: "NOT_ORTHOGONAL"
      };
    }
    if (segment.length === 0) {
      return {
        point, cell, valid: true, color: "#2e7d32",
        label: `Маршрут: ${formatMovementUnits(spent)} ОП · останется ${formatMovementUnits(remaining)} ОП`,
        totalCostUnits: spent, remainingUnits: remaining, stepCostUnits: 0,
        segmentCells: [], segmentPoints: [], segmentStepCostUnits: []
      };
    }

    const segmentPoints: Vector2[] = [];
    const segmentCosts: number[] = [];
    let cursorCell = anchorCell;
    let cursorPoint = anchorPoint;
    let cursorRemaining = remaining;
    let segmentCost = 0;
    let largestStepCost = 0;
    let warWarningStateName: string | undefined;
    const hasPoliticalModel = active.sides !== undefined && active.states !== undefined && active.stateRelations !== undefined;

    for (const nextCell of segment) {
      const nextPoint = pointForCell(active, nextCell);
      const destinationCell = readCell(active.gridMap, nextCell);
      if (hasPoliticalModel) {
        const political = classifyStateMovementAccess({
          sideId: active.sideId,
          destinationStateId: destinationCell.recognizedStateId,
          sides: active.sides ?? [],
          states: active.states ?? [],
          stateRelations: active.stateRelations ?? {}
        });
        if (political.kind === "DENY_FOREIGN_STATE") {
          return {
            point, cell, valid: false, color: "#d32f2f",
            label: `Закрытая граница: ${stateName(active, political.destinationStateId)}`,
            totalCostUnits: spent + segmentCost,
            remainingUnits: cursorRemaining,
            reason: "FOREIGN_STATE_CLOSED"
          };
        }
        if (political.kind === "DENY_STATELESS") {
          return {
            point, cell, valid: false, color: "#d32f2f",
            label: messageForPreview("STATELESS_FACTION"),
            totalCostUnits: spent + segmentCost,
            remainingUnits: cursorRemaining,
            reason: "STATELESS_FACTION"
          };
        }
        if (political.kind === "DENY_INVALID_POLITICAL_CONFIG") {
          return {
            point, cell, valid: false, color: "#d32f2f",
            label: messageForPreview("INVALID_POLITICAL_CONFIG"),
            totalCostUnits: spent + segmentCost,
            remainingUnits: cursorRemaining,
            reason: "INVALID_POLITICAL_CONFIG"
          };
        }
        if (political.kind === "DECLARE_WAR_AND_ALLOW") {
          warWarningStateName = stateName(active, political.destinationStateId);
        }
      }

      const step = validateMovementStep({
        from: cursorCell,
        to: nextCell,
        sideId: active.sideId,
        cell: destinationCell,
        terrain: active.terrain,
        wars: active.wars,
        remainingUnits: cursorRemaining,
        withinBounds: true,
        armyStateAllowsMovement: true,
        skipLegacyPoliticalCheck: hasPoliticalModel
      });
      if (!step.allowed) {
        return {
          point, cell, valid: false, color: "#d32f2f",
          label: messageForPreview(step.reason, step.missingUnits), totalCostUnits: spent + segmentCost,
          remainingUnits: cursorRemaining, reason: step.reason,
          ...(step.stepCostUnits !== undefined ? { stepCostUnits: step.stepCostUnits } : {})
        };
      }
      if (firstBarrierIntersection({ from: cursorPoint, to: nextPoint }, active.barriers)) {
        return {
          point, cell, valid: false, color: "#d32f2f", label: messageForPreview("BARRIER"),
          totalCostUnits: spent + segmentCost, remainingUnits: cursorRemaining,
          stepCostUnits: step.stepCostUnits, reason: "BARRIER"
        };
      }
      segmentPoints.push(nextPoint);
      segmentCosts.push(step.stepCostUnits);
      segmentCost += step.stepCostUnits;
      largestStepCost = Math.max(largestStepCost, step.stepCostUnits);
      cursorRemaining = step.remainingAfterUnits;
      cursorCell = nextCell;
      cursorPoint = nextPoint;
    }

    const total = spent + segmentCost;
    const normalLabel = `${segment.length > 1 ? "Отрезок" : "Шаг"}: ${formatMovementUnits(segmentCost)} ОП · маршрут: ${formatMovementUnits(total)} ОП · останется ${formatMovementUnits(cursorRemaining)} ОП`;
    return {
      point, cell, valid: true,
      color: warWarningStateName ? "#f9a825" : largestStepCost <= 1 ? "#29b6f6" : largestStepCost >= 4 ? "#f9a825" : "#2e7d32",
      label: warWarningStateName ? `⚠ Вход в ${warWarningStateName} объявит войну · ${normalLabel}` : normalLabel,
      totalCostUnits: total,
      remainingUnits: cursorRemaining,
      stepCostUnits: segmentCost,
      segmentCells: segment.map((segmentCell) => ({ ...segmentCell })),
      segmentPoints: segmentPoints.map((segmentPoint) => ({ ...segmentPoint })),
      segmentStepCostUnits: [...segmentCosts]
    };
  }
}

export interface RouteToolRegistrar {
  register(controller: RouteToolController, pointerHz: number): () => void;
}

export function setupRouteTool(registrar: RouteToolRegistrar, distancePort: GridRoutePort): () => void {
  return registrar.register(new RouteToolController(distancePort), 12);
}
