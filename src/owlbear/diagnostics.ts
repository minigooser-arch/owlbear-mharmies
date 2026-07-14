import type { SceneItemRecord, Vector2 } from "../shared/types";

export type DiagnosticTestId =
  | "SOURCE_GET"
  | "LOCAL_CREATE"
  | "LOCAL_CHANGE"
  | "SOURCE_UPDATE"
  | "BACKGROUND"
  | "CONTEXT_MENU";

export type DiagnosticStatus = "PASS" | "FAIL" | "WAITING" | "SDK_LIMITATION";

export interface DiagnosticResult {
  testId: DiagnosticTestId;
  status: DiagnosticStatus;
  detail?: string;
}

export interface DiagnosticsPort {
  getSelectedSource(): Promise<SceneItemRecord | undefined>;
  getSource(id: string): Promise<SceneItemRecord | undefined>;
  createTemporaryLocal(source: SceneItemRecord): Promise<string>;
  updateTemporaryLocal(id: string, position: Vector2): Promise<void>;
  deleteLocalItems(ids: readonly string[]): Promise<void>;
  updateSourcePosition(id: string, position: Vector2): Promise<void>;
  readBackgroundCounter(): Promise<number>;
  probeContextMenu(): Promise<boolean>;
}

const BACKGROUND_BASELINE_KEY = "com.letopis.army-control/diagnostic-background-baseline";

function detail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class DiagnosticsService {
  private readonly temporaryIds = new Set<string>();
  private memoryBaseline: number | undefined;

  constructor(private readonly port: DiagnosticsPort) {}

  async run(testId: DiagnosticTestId): Promise<DiagnosticResult> {
    if (testId === "BACKGROUND") return this.finishBackgroundProbe();
    try {
      switch (testId) {
        case "SOURCE_GET": {
          const source = await this.requireSelectedSource();
          const fetched = await this.port.getSource(source.id);
          return fetched
            ? { testId, status: "PASS" }
            : { testId, status: "FAIL", detail: "Источник не найден после выбора." };
        }
        case "LOCAL_CREATE": {
          const source = await this.requireSelectedSource();
          const id = await this.createTemporary(source);
          await this.port.getSource(source.id);
          return { testId, status: "PASS", detail: id };
        }
        case "LOCAL_CHANGE": {
          const source = await this.requireSelectedSource();
          const id = await this.createTemporary(source);
          await this.port.updateTemporaryLocal(id, {
            x: source.position.x + 1,
            y: source.position.y + 1
          });
          return { testId, status: "PASS" };
        }
        case "SOURCE_UPDATE": {
          const source = await this.requireSelectedSource();
          const original = { ...source.position };
          try {
            await this.port.updateSourcePosition(source.id, {
              x: original.x + 1,
              y: original.y
            });
            const updated = await this.port.getSource(source.id);
            if (!updated || updated.position.x === original.x) {
              return { testId, status: "FAIL", detail: "Изменение источника не наблюдалось." };
            }
            return { testId, status: "PASS" };
          } finally {
            await this.port.updateSourcePosition(source.id, original);
          }
        }
        case "CONTEXT_MENU":
          return (await this.port.probeContextMenu())
            ? { testId, status: "PASS" }
            : {
                testId,
                status: "SDK_LIMITATION",
                detail: "Контекстное меню для local items не поддерживается в этой версии SDK."
              };
        default: {
          const exhaustive: never = testId;
          return exhaustive;
        }
      }
    } catch (error) {
      return { testId, status: "FAIL", detail: detail(error) };
    } finally {
      await this.cleanup();
    }
  }

  async beginBackgroundProbe(): Promise<DiagnosticResult> {
    const baseline = await this.port.readBackgroundCounter();
    this.memoryBaseline = baseline;
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(BACKGROUND_BASELINE_KEY, String(baseline));
    }
    return { testId: "BACKGROUND", status: "WAITING" };
  }

  async finishBackgroundProbe(): Promise<DiagnosticResult> {
    const stored =
      typeof localStorage !== "undefined"
        ? Number(localStorage.getItem(BACKGROUND_BASELINE_KEY))
        : Number.NaN;
    const baseline = Number.isFinite(stored) ? stored : this.memoryBaseline;
    if (baseline === undefined) {
      return {
        testId: "BACKGROUND",
        status: "FAIL",
        detail: "Сначала запустите проверку фонового процесса."
      };
    }
    const current = await this.port.readBackgroundCounter();
    return current > baseline
      ? { testId: "BACKGROUND", status: "PASS" }
      : {
          testId: "BACKGROUND",
          status: "FAIL",
          detail: "Фоновый счётчик не увеличился после закрытия popover."
        };
  }

  async cleanup(): Promise<void> {
    const ids = [...this.temporaryIds];
    this.temporaryIds.clear();
    if (ids.length > 0) await this.port.deleteLocalItems(ids);
  }

  private async requireSelectedSource(): Promise<SceneItemRecord> {
    const source = await this.port.getSelectedSource();
    if (!source) throw new Error("Выберите изображение-источник на сцене.");
    return source;
  }

  private async createTemporary(source: SceneItemRecord): Promise<string> {
    const id = await this.port.createTemporaryLocal(source);
    this.temporaryIds.add(id);
    return id;
  }
}
