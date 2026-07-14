import { useMemo, useSyncExternalStore } from "react";
import type {
  ArmyStatus,
  BattleGroup,
  SceneSettings,
  Side,
  SideRelation,
  Vector2
} from "../../shared/types";
import type { DiagnosticTestId } from "../../owlbear/diagnostics";

export interface ArmyView {
  id: string;
  name: string;
  sideId: string;
  sideName: string;
  status: ArmyStatus;
  route: Vector2[];
  directOwnerPlayerId?: string;
}

export interface RawExtensionSnapshot {
  ready: boolean;
  sceneReady: boolean;
  futureSchema: boolean;
  role: "GM" | "PLAYER";
  playerId: string;
  visibleSourceIds: ReadonlySet<string>;
  armies: readonly ArmyView[];
  sides: readonly Side[];
  relations: Readonly<Record<string, Record<string, SideRelation>>>;
  battleGroups: readonly BattleGroup[];
  settings: SceneSettings;
}

export interface UiCommand {
  type: string;
  [key: string]: unknown;
}

export interface ExtensionServices {
  getSnapshot(): RawExtensionSnapshot;
  subscribe(listener: () => void): () => void;
  send(command: UiCommand): Promise<unknown>;
  runDiagnostic(testId: DiagnosticTestId): Promise<unknown>;
}

export interface ExtensionViewModel extends RawExtensionSnapshot {
  armies: ArmyView[];
  counters: { total: number; moving: number; inBattle: number };
  send(command: UiCommand): Promise<unknown>;
  runDiagnostic(testId: DiagnosticTestId): Promise<unknown>;
}

export function useExtensionState(services: ExtensionServices): ExtensionViewModel {
  const snapshot = useSyncExternalStore(services.subscribe, services.getSnapshot, services.getSnapshot);
  return useMemo(() => {
    const armies = snapshot.role === "GM"
      ? [...snapshot.armies]
      : snapshot.armies.filter((army) => snapshot.visibleSourceIds.has(army.id));
    return {
      ...snapshot,
      armies,
      counters: {
        total: armies.length,
        moving: armies.filter((army) => army.status === "MOVING").length,
        inBattle: armies.filter((army) => army.status === "IN_BATTLE").length
      },
      send: (command) => services.send(command),
      runDiagnostic: (testId) => services.runDiagnostic(testId)
    };
  }, [services, snapshot]);
}
