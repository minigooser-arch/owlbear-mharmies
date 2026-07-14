import { firstBarrierIntersection, type BarrierSegment } from "../barriers/barrierGeometry";
import { evaluateRouteLimit, type GridDistancePort } from "../routes/routeMath";
import type { Vector2 } from "../shared/types";

export interface RoutePreview {
  point: Vector2;
  valid: boolean;
  color: string;
  label: string;
  reason?: "ROUTE_LIMIT" | "BARRIER";
}

export type RouteClickResult =
  | { accepted: true }
  | { accepted: false; reason: "ROUTE_LIMIT" | "BARRIER" | "INACTIVE" };

export type RouteKeyResult =
  | { action: "EDITING" }
  | { action: "COMMIT"; armyId: string; route: Vector2[] }
  | { action: "CANCEL" }
  | { action: "IGNORED" };

function formatCells(value: number): string {
  return Number(value.toFixed(2)).toLocaleString("ru-RU");
}

export class RouteToolController {
  private armyId: string | undefined;
  private start: Vector2 = { x: 0, y: 0 };
  private maxCells = 0;
  private barriers: readonly BarrierSegment[] = [];
  private points: Vector2[] = [];
  private currentPreview: RoutePreview | undefined;
  private sequence = 0;

  constructor(private readonly distancePort: GridDistancePort) {}

  activate(
    armyId: string,
    start: Vector2,
    maxCells: number,
    barriers: readonly BarrierSegment[]
  ): void {
    this.armyId = armyId;
    this.start = { ...start };
    this.maxCells = maxCells;
    this.barriers = barriers;
    this.points = [];
    this.currentPreview = undefined;
    this.sequence += 1;
  }

  preview(): RoutePreview | undefined {
    return this.currentPreview;
  }

  async move(point: Vector2): Promise<void> {
    const sequence = ++this.sequence;
    const preview = await this.analyze(point);
    if (sequence === this.sequence) this.currentPreview = preview;
  }

  async click(point: Vector2): Promise<RouteClickResult> {
    if (!this.armyId) return { accepted: false, reason: "INACTIVE" };
    const preview = await this.analyze(point);
    this.currentPreview = preview;
    if (!preview.valid && preview.reason) return { accepted: false, reason: preview.reason };
    this.points.push({ ...point });
    return { accepted: true };
  }

  key(key: string): RouteKeyResult {
    if (!this.armyId) return { action: "IGNORED" };
    if (key === "Backspace") {
      this.points.pop();
      this.currentPreview = undefined;
      return { action: "EDITING" };
    }
    if (key === "Escape") {
      this.deactivate();
      return { action: "CANCEL" };
    }
    if (key === "Enter") {
      const result: RouteKeyResult = {
        action: "COMMIT",
        armyId: this.armyId,
        route: this.points.map((point) => ({ ...point }))
      };
      this.deactivate();
      return result;
    }
    return { action: "IGNORED" };
  }

  private deactivate(): void {
    this.armyId = undefined;
    this.points = [];
    this.currentPreview = undefined;
    this.sequence += 1;
  }

  private async analyze(point: Vector2): Promise<RoutePreview> {
    const anchor = this.points.at(-1) ?? this.start;
    const barrier = firstBarrierIntersection({ from: anchor, to: point }, this.barriers);
    const limit = await evaluateRouteLimit(
      this.start,
      [...this.points, point],
      this.maxCells,
      this.distancePort
    );
    const reason = barrier ? "BARRIER" : !limit.valid ? "ROUTE_LIMIT" : undefined;
    const preview: RoutePreview = {
      point: { ...point },
      valid: reason === undefined,
      color: reason ? "#d32f2f" : "#2e7d32",
      label: reason === "ROUTE_LIMIT"
        ? `Превышение: ${formatCells(limit.excessCells)}`
        : `Осталось: ${formatCells(limit.remainingCells)}`
    };
    if (reason) preview.reason = reason;
    return preview;
  }
}

export interface RouteToolRegistrar {
  register(controller: RouteToolController, pointerHz: number): () => void;
}

export function setupRouteTool(
  registrar: RouteToolRegistrar,
  distancePort: GridDistancePort
): () => void {
  return registrar.register(new RouteToolController(distancePort), 12);
}
