import { METADATA_KEYS } from "../shared/constants";
import type { StateRelations } from "../shared/types";
import { migrateSceneState } from "../storage/migrations";
import type { RawExtensionSnapshot } from "../ui/state/useExtensionState";
import {
  buildRoleSafeSnapshot as buildCoreRoleSafeSnapshot,
  createOwlbearExtensionServices as createCoreServices,
  type RunningExtensionServices,
  type SnapshotInput
} from "./extensionServicesCore";

export type { RunningExtensionServices, SnapshotInput } from "./extensionServicesCore";

type OwlbearSdk = typeof import("@owlbear-rodeo/sdk").default;

function withExactStateWarStatus(
  snapshot: RawExtensionSnapshot,
  stateRelations: StateRelations
): RawExtensionSnapshot {
  const stateBySide = new Map(snapshot.sides.map((side) => [side.id, side.stateId]));
  return {
    ...snapshot,
    stateRelations,
    armies: snapshot.armies.map((army) => {
      const stateId = stateBySide.get(army.sideId);
      const atWar = stateId != null && Object.values(stateRelations[stateId] ?? {}).some(
        (relation) => relation.atWar
      );
      return { ...army, atWar };
    })
  };
}

export function buildRoleSafeSnapshot(input: SnapshotInput): RawExtensionSnapshot {
  return withExactStateWarStatus(
    buildCoreRoleSafeSnapshot(input),
    input.scene.stateRelations ?? {}
  );
}

async function readStateRelations(OBR: OwlbearSdk): Promise<StateRelations> {
  if (!(await OBR.scene.isReady())) return {};
  const metadata = await OBR.scene.getMetadata();
  const migrated = migrateSceneState(metadata[METADATA_KEYS.scene] ?? { version: 3 });
  return migrated.ok ? (migrated.value.stateRelations ?? {}) : {};
}

export async function createOwlbearExtensionServices(): Promise<RunningExtensionServices> {
  const [{ default: OBR }, core] = await Promise.all([
    import("@owlbear-rodeo/sdk"),
    createCoreServices()
  ]);
  let stateRelations = await readStateRelations(OBR);
  const listeners = new Set<() => void>();
  const publish = () => { for (const listener of listeners) listener(); };
  const unsubscribeCore = core.subscribe(publish);
  const unsubscribeMetadata = OBR.scene.onMetadataChange(() => {
    void readStateRelations(OBR).then((next) => {
      stateRelations = next;
      publish();
    });
  });

  return {
    getSnapshot: () => withExactStateWarStatus(core.getSnapshot(), stateRelations),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    send: core.send,
    runDiagnostic: core.runDiagnostic,
    stop: () => {
      unsubscribeCore();
      unsubscribeMetadata();
      listeners.clear();
      core.stop();
    }
  };
}
