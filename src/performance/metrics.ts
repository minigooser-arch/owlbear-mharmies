/**
 * Small bounded performance counters shared by the background iframe and popover.
 * Values are local to the current iframe: no scene data or timings are broadcast.
 *
 * In the relevant iframe's browser console:
 *   window.__letopisPerf.snapshot()
 *   window.__letopisPerf.reset()
 */
const MAX_SAMPLES = 128;

interface Counter {
  calls: number;
  totalMs: number;
  maxMs: number;
  samples: number[];
}

export interface PerformanceSummary {
  name: string;
  calls: number;
  averageMs: number;
  p95Ms: number;
  maxMs: number;
}

const counters = new Map<string, Counter>();

export function recordPerformance(name: string, elapsedMs: number): void {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return;
  const counter = counters.get(name) ?? {
    calls: 0,
    totalMs: 0,
    maxMs: 0,
    samples: []
  };
  counter.calls++;
  counter.totalMs += elapsedMs;
  counter.maxMs = Math.max(counter.maxMs, elapsedMs);
  counter.samples.push(elapsedMs);
  if (counter.samples.length > MAX_SAMPLES) counter.samples.shift();
  counters.set(name, counter);
}

export async function measureOperation<T>(
  name: string,
  operation: () => Promise<T>
): Promise<T> {
  const started = performance.now();
  try {
    return await operation();
  } finally {
    recordPerformance(name, performance.now() - started);
  }
}

export function performanceSnapshot(): PerformanceSummary[] {
  return [...counters.entries()].map(([name, counter]) => {
    const sorted = [...counter.samples].sort((a, b) => a - b);
    return {
      name,
      calls: counter.calls,
      averageMs: counter.totalMs / counter.calls,
      p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0,
      maxMs: counter.maxMs
    };
  }).sort((a, b) => b.averageMs - a.averageMs);
}

export function resetPerformance(): void {
  counters.clear();
}

declare global {
  interface Window {
    __letopisPerf?: {
      snapshot: typeof performanceSnapshot;
      reset: typeof resetPerformance;
    };
  }
}

if (typeof window !== "undefined") {
  window.__letopisPerf = {
    snapshot: performanceSnapshot,
    reset: resetPerformance
  };
}
