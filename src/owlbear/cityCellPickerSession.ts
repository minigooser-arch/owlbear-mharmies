import type { GridCellCoord } from "../shared/types";
import {
  CELL_COORDINATE_TOOL_ID,
  CELL_COORDINATE_TOOL_MODE_ID,
  CITY_CELL_PICK_SESSION_KEY
} from "../shared/constants";
import { activateToolMode } from "./toolActivation";

export interface CityCellPickSnapshot {
  sessionId: string;
  cells: GridCellCoord[];
}

export interface CityCellPickerPort {
  getRole(): Promise<"GM" | "PLAYER">;
  getActiveTool(): Promise<string>;
  getActiveToolMode(): Promise<string | undefined>;
  setToolMetadata(update: Record<string, unknown>): Promise<void>;
  activateTool(toolId: string): Promise<void>;
  activateMode(toolId: string, modeId: string): Promise<void>;
  onCellPick(listener: (value: unknown) => void): () => void;
  onToolChange(listener: (toolId: string) => void): () => void;
  createSessionId(): string;
  showError(message: string): Promise<void>;
  activationTimeoutMs?: number;
}

interface ActiveSession {
  sessionId: string;
  returnToolId: string;
}

function parseCellPick(value: unknown): { sessionId: string; cell: GridCellCoord } | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const data = value as Record<string, unknown>;
  if (typeof data.sessionId !== "string" || data.sessionId.trim().length === 0 ||
    !Number.isSafeInteger(data.x) || !Number.isSafeInteger(data.y)) return undefined;
  return { sessionId: data.sessionId, cell: { x: data.x as number, y: data.y as number } };
}

export class CityCellPickerSession {
  private active: ActiveSession | undefined;
  private cells: GridCellCoord[] = [];
  private unsubscribeCell: (() => void) | undefined;
  private unsubscribeTool: (() => void) | undefined;

  constructor(
    private readonly port: CityCellPickerPort,
    private readonly onChange: (snapshot: CityCellPickSnapshot | undefined) => void
  ) {}

  get snapshot(): CityCellPickSnapshot | undefined {
    return this.active ? { sessionId: this.active.sessionId, cells: this.cells.map((cell) => ({ ...cell })) } : undefined;
  }

  start(): void {
    if (this.unsubscribeCell || this.unsubscribeTool) return;
    this.unsubscribeCell = this.port.onCellPick((value) => { void this.receive(value); });
    this.unsubscribeTool = this.port.onToolChange((toolId) => { void this.handleToolChange(toolId); });
  }

  async open(): Promise<boolean> {
    if (this.active) return true;
    if (await this.port.getRole() !== "GM") return false;

    const active: ActiveSession = {
      sessionId: this.port.createSessionId(),
      returnToolId: await this.port.getActiveTool()
    };
    this.active = active;
    this.cells = [];
    this.publish();

    try {
      await this.port.setToolMetadata({ [CITY_CELL_PICK_SESSION_KEY]: active.sessionId });
      const result = await activateToolMode(
        this.port,
        CELL_COORDINATE_TOOL_ID,
        CELL_COORDINATE_TOOL_MODE_ID,
        this.port.activationTimeoutMs ?? 1_000,
        25
      );
      if (result.toolId !== CELL_COORDINATE_TOOL_ID || result.modeId !== CELL_COORDINATE_TOOL_MODE_ID) {
        throw new Error("Координатный инструмент не активировался.");
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось включить выбор клеток.";
      await this.close(true);
      await this.port.showError(message);
      return false;
    }
  }

  async close(restoreTool = true): Promise<void> {
    const active = this.active;
    if (!active) return;
    this.active = undefined;
    this.cells = [];
    this.publish();
    await this.port.setToolMetadata({ [CITY_CELL_PICK_SESSION_KEY]: null });
    if (restoreTool && active.returnToolId !== CELL_COORDINATE_TOOL_ID &&
      await this.port.getActiveTool() === CELL_COORDINATE_TOOL_ID) {
      await this.port.activateTool(active.returnToolId);
    }
  }

  async handleToolChange(toolId: string): Promise<void> {
    if (this.active && toolId !== CELL_COORDINATE_TOOL_ID) await this.close(false);
  }

  async receive(value: unknown): Promise<void> {
    const parsed = parseCellPick(value);
    const active = this.active;
    if (!parsed || !active || parsed.sessionId !== active.sessionId) return;
    if (await this.port.getRole() !== "GM" || this.active?.sessionId !== parsed.sessionId) return;
    if (this.cells.some((cell) => cell.x === parsed.cell.x && cell.y === parsed.cell.y)) return;
    this.cells = [...this.cells, parsed.cell];
    this.publish();
  }

  async stop(): Promise<void> {
    this.unsubscribeCell?.();
    this.unsubscribeTool?.();
    this.unsubscribeCell = undefined;
    this.unsubscribeTool = undefined;
    await this.close(false);
  }

  private publish(): void {
    this.onChange(this.snapshot);
  }
}
