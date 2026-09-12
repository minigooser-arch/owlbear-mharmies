import OBR from "@owlbear-rodeo/sdk";
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

export function buildRoleSafeSnapshot(input: SnapshotInput): RawExtensionSnapshot {
  return {
    ...buildCoreRoleSafeSnapshot(input),
    stateRelations: input.scene.stateRelations ?? {}
  };
}

async function readStateRelations(): Promise<StateRelations> {
  if (!(await OBR.scene.isReady())) return {};
  const metadata = await OBR.scene.getMetadata();
  const migrated = migrateSceneState(metadata[METADATA_KEYS.scene] ?? { version: 3 });
  return migrated.ok ? (migrated.value.stateRelations ?? {}) : {};
}

export async function createOwlbearExtensionServices(): Promise<RunningExtensionServices> {
  const core = await createCoreServices();
  let stateRelations = await readStateRelations();
  const listeners = new Set<() => void>();
  const publish = () => { for (const listener of listeners) listener(); };
  const unsubscribeCore = core.subscribe(publish);
  const unsubscribeMetadata = OBR.scene.onMetadataChange(() => {
    void readStateRelations().then((next) => {
      stateRelations = next;
      publish();
    });
  });

  return {
    getSnapshot: () => ({ ...core.getSnapshot(), stateRelations }),
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
