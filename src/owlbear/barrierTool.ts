import type { Vector2 } from "../shared/types";

export interface BarrierDraft {
  points: Vector2[];
  visible: false;
  locked: true;
}

export interface BarrierToolPort {
  createBarrier(draft: BarrierDraft): Promise<void>;
}

export class BarrierToolController {
  private points: Vector2[] = [];

  constructor(
    private readonly isGM: boolean,
    private readonly port: BarrierToolPort
  ) {}

  addPoint(point: Vector2): boolean {
    if (!this.isGM) return false;
    this.points.push({ ...point });
    return true;
  }

  cancel(): void {
    this.points = [];
  }

  async confirm(): Promise<boolean> {
    if (!this.isGM || this.points.length < 2) return false;
    await this.port.createBarrier({
      points: this.points.map((point) => ({ ...point })),
      visible: false,
      locked: true
    });
    this.points = [];
    return true;
  }
}

export interface BarrierToolRegistrar {
  register(controller: BarrierToolController): () => void;
}

export function setupBarrierTool(
  registrar: BarrierToolRegistrar,
  isGM: boolean,
  port: BarrierToolPort
): () => void {
  return registrar.register(new BarrierToolController(isGM, port));
}
