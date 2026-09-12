import { METADATA_KEYS } from "../shared/constants";
import type { ArmyState, SceneItemRecord } from "../shared/types";
import type { OwlbearPort } from "../owlbear/sdkAdapter";
import {
  ProductionEngine as CoreProductionEngine,
  startBackgroundApplication as startCoreBackgroundApplication
} from "./applicationCore";

export * from "./applicationCore";

interface AtomicMovementEngineInstance {
  port: OwlbearPort;
}

interface ArmySnapshot {
  id: string;
  state: unknown;
  position: SceneItemRecord["position"];
}

function armySnapshots(items: readonly SceneItemRecord[]): ArmySnapshot[] {
  return items.flatMap((item) => {
    const state = item.metadata[METADATA_KEYS.army];
    return state === undefined
      ? []
      : [{
          id: item.id,
          state: structuredClone(state),
          position: structuredClone(item.position)
        }];
  });
}

function currentArmyRevision(state: unknown): number | null {
  if (typeof state !== "object" || state === null || Array.isArray(state)) return null;
  const revision = (state as Partial<ArmyState>).revision;
  return typeof revision === "number" ? revision : null;
}

async function rollbackMovementItems(
  port: OwlbearPort,
  before: readonly ArmySnapshot[]
): Promise<void> {
  const current = new Map((await port.getSceneItems()).map((item) => [item.id, item]));
  for (const snapshot of before) {
    const item = current.get(snapshot.id);
    if (!item) continue;
    const currentState = item.metadata[METADATA_KEYS.army];
    if (
      JSON.stringify(currentState) === JSON.stringify(snapshot.state) &&
      JSON.stringify(item.position) === JSON.stringify(snapshot.position)
    ) {
      continue;
    }
    try {
      await port.patchSceneItemMetadata(
        snapshot.id,
        METADATA_KEYS.army,
        snapshot.state,
        { position: snapshot.position },
        currentArmyRevision(currentState)
      );
    } catch {
      // Compensation is guarded by the latest item revision. Never mask the original failure.
    }
  }
}

async function runAtomicMovement<T>(
  port: OwlbearPort,
  operation: () => Promise<T>
): Promise<T> {
  const before = armySnapshots(await port.getSceneItems());
  try {
    return await operation();
  } catch (error) {
    await rollbackMovementItems(port, before);
    throw error;
  }
}

const originalMovementTick = CoreProductionEngine.prototype.movementTick;
CoreProductionEngine.prototype.movementTick = function patchedMovementTick(this: CoreProductionEngine): Promise<void> {
  const port = (this as unknown as AtomicMovementEngineInstance).port;
  return runAtomicMovement(port, () => originalMovementTick.call(this));
};

export { CoreProductionEngine as ProductionEngine };
export const startBackgroundApplication = startCoreBackgroundApplication;
