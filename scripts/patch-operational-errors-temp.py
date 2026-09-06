from pathlib import Path

path = Path("src/background/application.ts")
text = path.read_text()

replacements = [
    (
        '''export class SceneWorkTracker {
  private readonly pending = new Set<Promise<void>>();

  track(work: Promise<unknown>): void {
    const tracked = work.then(() => undefined).finally(() => this.pending.delete(tracked));
    this.pending.add(tracked);
    void tracked.catch(() => undefined);
  }
''',
        '''export type BackgroundOperationalErrorReporter = (
  error: unknown,
  context: string
) => void;

function defaultBackgroundOperationalErrorReporter(
  error: unknown,
  context: string
): void {
  console.error(`Letopis Armies background operation failed: ${context}`, error);
}

export class SceneWorkTracker {
  private readonly pending = new Set<Promise<void>>();

  constructor(
    private readonly reportError: BackgroundOperationalErrorReporter = defaultBackgroundOperationalErrorReporter
  ) {}

  track(work: Promise<unknown>): void {
    const tracked = work.then(() => undefined).finally(() => this.pending.delete(tracked));
    this.pending.add(tracked);
    void tracked.catch((error: unknown) => this.reportError(error, "scene-work"));
  }
'''
    ),
    (
        '''  constructor(
    private readonly port: OwlbearPort,
    private readonly wallClock: () => Date = () => new Date()
  ) {
''',
        '''  constructor(
    private readonly port: OwlbearPort,
    private readonly wallClock: () => Date = () => new Date(),
    private readonly reportOperationalError: BackgroundOperationalErrorReporter = defaultBackgroundOperationalErrorReporter
  ) {
'''
    ),
    (
        '''    } catch {
      return;
    }
    const armyCells = Object.fromEntries''',
        '''    } catch (error) {
      this.reportOperationalError(error, "turn-grid-unavailable");
      return;
    }
    const armyCells = Object.fromEntries'''
    ),
    (
        '''    } catch {
      return;
    }
    const frames: Array<{''',
        '''    } catch (error) {
      this.reportOperationalError(error, "movement-grid-unavailable");
      return;
    }
    const frames: Array<{'''
    ),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit(f"Patch target not found:\n{old[:120]}")
    text = text.replace(old, new, 1)

path.write_text(text)
