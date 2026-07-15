export interface RefreshCoordinator {
  request(): void;
  whenIdle(): Promise<void>;
  stop(): void;
}

interface IdleWaiter {
  resolve(): void;
  reject(error: unknown): void;
}

export function createRefreshCoordinator<T>(
  load: () => Promise<T>,
  publish: (snapshot: T) => void,
  equal: (left: T, right: T) => boolean
): RefreshCoordinator {
  let active = false;
  let trailing = false;
  let stopped = false;
  let generation = 0;
  let hasSnapshot = false;
  let lastSnapshot: T;
  let lastError: unknown;
  const idleWaiters = new Set<IdleWaiter>();

  const settleIdleWaiters = () => {
    const waiters = [...idleWaiters];
    idleWaiters.clear();
    for (const waiter of waiters) {
      if (lastError === undefined) waiter.resolve();
      else waiter.reject(lastError);
    }
  };

  const run = async () => {
    active = true;
    do {
      trailing = false;
      const loadGeneration = generation;
      try {
        const next = await load();
        if (!stopped && loadGeneration === generation) {
          if (!hasSnapshot || !equal(lastSnapshot, next)) publish(next);
          lastSnapshot = next;
          hasSnapshot = true;
          lastError = undefined;
        }
      } catch (error) {
        if (!stopped && loadGeneration === generation) lastError = error;
      }
    } while (!stopped && trailing);

    active = false;
    if (!stopped) settleIdleWaiters();
  };

  return {
    request: () => {
      if (stopped) return;
      generation += 1;
      trailing = true;
      lastError = undefined;
      if (!active) void run();
    },
    whenIdle: () => {
      if (stopped) return Promise.resolve();
      if (!active && !trailing) {
        return lastError === undefined ? Promise.resolve() : Promise.reject(lastError);
      }
      return new Promise<void>((resolve, reject) => {
        idleWaiters.add({ resolve, reject });
      });
    },
    stop: () => {
      if (stopped) return;
      stopped = true;
      generation += 1;
      trailing = false;
      lastError = undefined;
      settleIdleWaiters();
    }
  };
}
