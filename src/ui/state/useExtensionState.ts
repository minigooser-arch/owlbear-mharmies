import { useMemo, useSyncExternalStore } from "react";
import type {
  ArmyCommandPayload,
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
}

export interface PartyPlayerView {
  id: string;
  name: string;
  color: string;
  role: "GM" | "PLAYER";
  connected: boolean;
}

export interface RawExtensionSnapshot {
  ready: boolean;
  sceneReady: boolean;
  futureSchema: boolean;
  role: "GM" | "PLAYER";
  playerId: string;
  players: readonly PartyPlayerView[];
  memberSideIds: ReadonlySet<string>;
  leaderSideIds: ReadonlySet<string>;
  mapVisibleSourceIds: ReadonlySet<string>;
  armies: readonly ArmyView[];
  sides: readonly Side[];
  relations: Readonly<Record<string, Record<string, SideRelation>>>;
  battleGroups: readonly BattleGroup[];
  settings: SceneSettings;
}

export type UiCommand =
  | ArmyCommandPayload
  | { type: "REGISTER_SELECTED_ARMY"; sideId: string }
  | { type: "EDIT_ROUTE"; armyId: string };

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
      : snapshot.armies.filter((army) => snapshot.memberSideIds.has(army.sideId));
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
