import { useMemo, useSyncExternalStore } from "react";
import type {
  ArmyCommandPayload,
  ArmyStatus,
  BattleGroup,
  CellPropertyTarget,
  MovementDenialReason,
  SceneSettings,
  ShipClassId,
  ShipFacing,
  ShipStatus,
  Side,
  StateEntity,
  TerrainRegistryState,
  TurnState,
  Vector2,
  WarState
} from "../../shared/types";
import type { DiagnosticTestId } from "../../owlbear/diagnostics";

export interface ArmyView {
  id: string;
  name: string;
  sideId: string;
  sideName: string;
  status: ArmyStatus;
  route: Vector2[];
  movementMaxUnits: number;
  movementRemainingUnits: number;
  routeCostUnits: number;
  routeCellCount: number;
  routeRequiresReplan: boolean;
  routeInvalidReason?: MovementDenialReason;
  atWar: boolean;
  healthHp: number;
  healthMaxHp: number;
  supplied: boolean;
  supplyCheckedOnTurn: number;
  disbandPending: boolean;
}

export interface ShipView {
  id: string;
  name: string;
  sideId: string;
  sideName: string;
  classId: ShipClassId;
  className: string;
  status: ShipStatus;
  hp: number;
  maxHp: number;
  temporaryHp: number;
  armor: number;
  movementMax: number;
  movementRemaining: number;
  plannedRouteCellCount: number;
  facing: ShipFacing;
  normalDice: number;
  normalRangeMin: number;
  normalRangeMax: number;
  embarkedArmyId: string | null;
  detectionOverride: number | null;
  effectiveDetectionRange: number;
  navalRoundNumber?: number;
  isCurrentNavalTurn?: boolean;
  navalMovementRemaining?: number;
  navalActionUsed?: boolean;
  navalExited?: boolean;
}

export interface NavalBattleView {
  id: string;
  roundNumber: number;
  participantCount: number;
  currentShipId: string | null;
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
  ships?: readonly ShipView[];
  activeNavalBattle?: NavalBattleView;
  sides: readonly Side[];
  states: readonly StateEntity[];
  relations: Readonly<Record<string, Record<string, import("../../shared/types").SideRelation>>>;
  battleGroups: readonly BattleGroup[];
  settings: SceneSettings;
  terrain: TerrainRegistryState;
  wars: readonly WarState[];
  turn: TurnState;
}

export interface MapBrushUiSettings {
  mode: "TERRAIN" | "IMPASSABLE" | "FACTION_TERRITORY" | "RECOGNIZED_STATE" | "DEFACTO_STATE" | "ERASER";
  size: 1 | 3 | 5;
  terrainId: string;
  sideId?: string;
  stateId?: string;
  factionOperation: "ADD" | "REMOVE";
  impassable: boolean;
  eraserTarget: CellPropertyTarget;
}

export type UiCommand =
  | ArmyCommandPayload
  | { type: "REGISTER_SELECTED_ARMY"; sideId: string }
  | { type: "REGISTER_SELECTED_SHIP"; sideId: string; classId: ShipClassId; facing: ShipFacing }
  | { type: "EDIT_ROUTE"; armyId: string }
  | { type: "EDIT_SHIP_ROUTE"; shipId: string }
  | { type: "OPEN_MAP_BRUSH"; settings: MapBrushUiSettings };

export interface ExtensionServices {
  getSnapshot(): RawExtensionSnapshot;
  subscribe(listener: () => void): () => void;
  send(command: UiCommand): Promise<unknown>;
  runDiagnostic(testId: DiagnosticTestId): Promise<unknown>;
}

export interface ExtensionViewModel extends RawExtensionSnapshot {
  armies: ArmyView[];
  ships: ShipView[];
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
    const ships = snapshot.role === "GM"
      ? [...(snapshot.ships ?? [])]
      : (snapshot.ships ?? []).filter((ship) => snapshot.memberSideIds.has(ship.sideId));
    return {
      ...snapshot,
      armies,
      ships,
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
