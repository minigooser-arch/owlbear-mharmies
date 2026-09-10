import type { Vector2 } from "../shared/types";

/**
 * Keeps at most one pointer-move operation running and one latest pending point.
 * Older hover events are deliberately discarded so an expensive SDK render can
 * never create a backlog that continues after the pointer has already moved on.
 */
export class PointerMoveCoalescer {
  private pending: Vector2 | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private lastRunAt = 0;
  private stopped = false;

  constructor(
    private readonly intervalMs: number,
    private readonly run: (point: Vector2) => Promise<void>
  ) {}

  push(point: Vector2): void {
    if (this.stopped) return;
    this.pending = { ...point };
    this.schedule();
  }

  clear(): void {
    this.pending = undefined;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  stop(): void {
    this.stopped = true;
    this.clear();
  }

  private schedule(): void {
    if (this.stopped || this.running || this.timer !== undefined || !this.pending) return;
    const delay = Math.max(0, this.intervalMs - (Date.now() - this.lastRunAt));
    if (delay === 0) {
      this.start();
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.start();
    }, delay);
  }

  private start(): void {
    if (this.stopped || this.running) return;
    const point = this.pending;
    this.pending = undefined;
    if (!point) return;

    this.running = true;
    this.lastRunAt = Date.now();
    void this.run(point).finally(() => {
      this.running = false;
      this.schedule();
    });
  }
}
