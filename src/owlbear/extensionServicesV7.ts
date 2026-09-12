import { METADATA_KEYS } from "../shared/constants";
import type { StateRelations, StrategicCity } from "../shared/types";
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

interface StrategicSnapshotOverlay {
  stateRelations: StateRelations;
  strategicCities: readonly StrategicCity[];
}

function withStrategicState(
  snapshot: RawExtensionSnapshot,
  overlay: StrategicSnapshotOverlay
): RawExtensionSnapshot {
  const stateBySide = new Map(snapshot.sides.map((side) => [side.id, side.stateId]));
  return {
    ...snapshot,
    stateRelations: overlay.stateRelations,
    strategicCities: overlay.strategicCities.map((city) => structuredClone(city)),
    armies: snapshot.armies.map((army) => {
      const stateId = stateBySide.get(army.sideId);
      const atWar = stateId != null && Object.values(overlay.stateRelations[stateId] ?? {}).some(
        (relation) => relation.atWar
      );
      return { ...army, atWar };
    })
  };
}

export function buildRoleSafeSnapshot(input: SnapshotInput): RawExtensionSnapshot {
  return withStrategicState(
    buildCoreRoleSafeSnapshot(input),
    {
      stateRelations: input.scene.stateRelations ?? {},
      strategicCities: input.scene.strategicCities ?? []
    }
  );
}

async function readStrategicOverlay(OBR: OwlbearSdk): Promise<StrategicSnapshotOverlay> {
  if (!(await OBR.scene.isReady())) return { stateRelations: {}, strategicCities: [] };
  const metadata = await OBR.scene.getMetadata();
  const migrated = migrateSceneState(metadata[METADATA_KEYS.scene] ?? { version: 3 });
  return migrated.ok
    ? {
        stateRelations: migrated.value.stateRelations ?? {},
        strategicCities: migrated.value.strategicCities ?? []
      }
    : { stateRelations: {}, strategicCities: [] };
}

export async function createOwlbearExtensionServices(): Promise<RunningExtensionServices> {
  const [{ default: OBR }, core] = await Promise.all([
    import("@owlbear-rodeo/sdk"),
    createCoreServices()
  ]);
  let overlay = await readStrategicOverlay(OBR);
  const listeners = new Set<() => void>();
  const publish = () => { for (const listener of listeners) listener(); };
  const unsubscribeCore = core.subscribe(publish);
  const unsubscribeMetadata = OBR.scene.onMetadataChange(() => {
    void readStrategicOverlay(OBR).then((next) => {
      overlay = next;
      publish();
    });
  });

  return {
    getSnapshot: () => withStrategicState(core.getSnapshot(), overlay),
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
