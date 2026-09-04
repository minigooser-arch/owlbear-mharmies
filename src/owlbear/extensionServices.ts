import { resolveCoordinatorConnectionId } from "../background/coordinator";
import {
  CommandGateway,
  CommandTimeoutError,
  NoCoordinatorError
} from "../commands/commandGateway";
import { SHIP_CLASSES } from "../naval/ships/shipClasses";
import {
  DEFAULT_SETTINGS,
  DEFAULT_TERRAIN,
  DEFAULT_TURN_STATE,
  METADATA_KEYS,
  MAP_BRUSH_ERASER_TARGET_KEY,
  MAP_BRUSH_FACTION_OPERATION_KEY,
  MAP_BRUSH_IMPASSABLE_VALUE_KEY,
  MAP_BRUSH_MODE_KEY,
  MAP_BRUSH_SIDE_ID_KEY,
  MAP_BRUSH_STATE_ID_KEY,
  MAP_BRUSH_SIZE_KEY,
  MAP_BRUSH_TERRAIN_ID_KEY,
  MAP_BRUSH_TOOL_ID,
  MAP_BRUSH_TOOL_MODE_ID,
  ROUTE_ARMY_ID_KEY,
  ROUTE_RETURN_TOOL_KEY,
  ROUTE_TOOL_ID,
  ROUTE_TOOL_MODE_ID,
  SHIP_ROUTE_RETURN_TOOL_KEY,
  SHIP_ROUTE_SHIP_ID_KEY,
  SHIP_ROUTE_TOOL_ID,
  SHIP_ROUTE_TOOL_MODE_ID
} from "../shared/constants";
import {
  COMMAND_PROTOCOL_VERSION,
  type ArmyCommand,
  type ArmyCommandPayload,
  type SceneItemRecord,
  type SceneState
} from "../shared/types";
import { migrateSceneState } from "../storage/migrations";
import { isFactionAtWar } from "../wars/warRules";
import { MetadataRepository, type ArmyRecord, type ShipRecord } from "../storage/metadataRepository";
import type {
  ArmyView,
  ExtensionServices,
  PartyPlayerView,
  RawExtensionSnapshot,
  ShipView,
  UiCommand
} from "../ui/state/useExtensionState";
import { DiagnosticsService, type DiagnosticsPort } from "./diagnostics";
import { notifyRussian } from "./notifications";
import { createRefreshCoordinator } from "./refreshCoordinator";
import {
  buildSelectedShipRegistrationPayload,
  RegistrationError,
  resolveRegistrationSelection
} from "./registration";
import { semanticSnapshotEqual, semanticValueEqual } from "./snapshotEquality";

export interface SnapshotInput {
  role: "GM" | "PLAYER";
  playerId: string;
  scene: SceneState;
  players: readonly PartyPlayerView[];
  armies: readonly ArmyRecord[];
  ships?: readonly ShipRecord[];
  mapVisibleSourceIds: ReadonlySet<string>;
}

export function buildRoleSafeSnapshot(input: SnapshotInput): RawExtensionSnapshot {
  const memberSideIds = new Set(
    input.scene.sides.filter((side) => side.playerIds.includes(input.playerId)).map((side) => side.id)
  );
  const leaderSideIds = new Set(
    input.scene.sides
      .filter((side) => side.leaderPlayerIds.includes(input.playerId))
      .map((side) => side.id)
  );
  const authorizedRecords = input.role === "GM"
    ? input.armies
    : input.armies.filter(({ state }) => memberSideIds.has(state.sideId));
  const shipRecords = input.ships ?? [];
  const authorizedShipRecords = input.role === "GM"
    ? shipRecords
    : shipRecords.filter(({ state }) => memberSideIds.has(state.sideId));
  const mapVisibleSourceIds = new Set(input.mapVisibleSourceIds);
  for (const army of input.armies) {
    if (input.role === "GM" || memberSideIds.has(army.state.sideId)) {
      mapVisibleSourceIds.add(army.item.id);
    }
  }
  for (const ship of shipRecords) {
    if (input.role === "GM" || memberSideIds.has(ship.state.sideId)) {
      mapVisibleSourceIds.add(ship.item.id);
    }
  }
  const sideNames = new Map(input.scene.sides.map((side) => [side.id, side.name]));
  const armies: ArmyView[] = authorizedRecords.map(({ item, state }) => {
    const routeVisible = input.role === "GM" || (
      state.status === "READY"
        ? leaderSideIds.has(state.sideId)
        : memberSideIds.has(state.sideId)
    );
    return {
      id: item.id,
      name: item.name ?? "Безымянная армия",
      sideId: state.sideId,
      sideName: sideNames.get(state.sideId) ?? "Неизвестная сторона",
      status: state.status,
      route: routeVisible ? state.route.map((point) => ({ ...point })) : [],
      movementMaxUnits: state.movement.maxUnits,
      movementRemainingUnits: state.movement.remainingUnits,
      routeCostUnits: state.plannedRoute.totalCostUnits,
      routeCellCount: state.plannedRoute.cells.length,
      routeRequiresReplan: state.plannedRoute.requiresReplan,
      ...(state.plannedRoute.invalidReason ? { routeInvalidReason: state.plannedRoute.invalidReason } : {}),
      atWar: isFactionAtWar(input.scene.wars, state.sideId),
      healthHp: state.health.hp,
      healthMaxHp: state.health.maxHp,
      supplied: state.supply.supplied,
      supplyCheckedOnTurn: state.supply.checkedOnTurn,
      disbandPending: state.disband.pending
    };
  });
  const ships: ShipView[] = authorizedShipRecords.map(({ item, state }) => {
    const definition = SHIP_CLASSES[state.classId];
    const battle = input.scene.activeNavalBattle;
    const tactical = battle?.status === "ACTIVE" &&
      state.status === "IN_NAVAL_BATTLE" &&
      state.battleId === battle.id &&
      battle.participantShipIds.includes(item.id)
      ? {
          navalRoundNumber: battle.roundNumber,
          isCurrentNavalTurn: battle.currentShipId === item.id,
          navalMovementRemaining: battle.movementRemainingByShip[item.id] ?? 0,
          navalActionUsed: battle.actionUsedByShip[item.id] ?? false
        }
      : {};
    return {
      id: item.id,
      name: item.name ?? "Безымянный корабль",
      sideId: state.sideId,
      sideName: sideNames.get(state.sideId) ?? "Неизвестная сторона",
      classId: state.classId,
      className: definition.name,
      status: state.status,
      hp: state.hp,
      maxHp: definition.maxHp,
      temporaryHp: state.temporaryHp,
      armor: definition.armor,
      movementMax: definition.movement,
      movementRemaining: state.globalMovementRemaining,
      plannedRouteCellCount: state.plannedRoute.length,
      facing: state.facing,
      normalDice: definition.normalDice,
      normalRangeMin: definition.normalRangeMin,
      normalRangeMax: definition.normalRangeMax,
      embarkedArmyId: state.embarkedArmyId,
      detectionOverride: state.detectionOverride,
      effectiveDetectionRange: state.detectionOverride ?? input.scene.settings.defaultDetectionRangeCells,
      ...tactical
    };
  });
  const activeNavalBattle = input.role === "GM" && input.scene.activeNavalBattle?.status === "ACTIVE"
    ? {
        id: input.scene.activeNavalBattle.id,
        roundNumber: input.scene.activeNavalBattle.roundNumber,
        participantCount: input.scene.activeNavalBattle.participantShipIds.length,
        currentShipId: input.scene.activeNavalBattle.currentShipId
      }
    : undefined;
  return {
    ready: true,
    sceneReady: true,
    futureSchema: false,
    role: input.role,
    playerId: input.playerId,
    players: input.players,
    memberSideIds,
    leaderSideIds,
    mapVisibleSourceIds,
    armies,
    ships,
    ...(activeNavalBattle ? { activeNavalBattle } : {}),
    sides: input.scene.sides,
    states: input.scene.states,
    relations: input.scene.relations,
    battleGroups: input.scene.battleGroups,
    settings: input.scene.settings,
    terrain: input.scene.terrain,
    wars: input.scene.wars,
    turn: input.scene.turn
  };
}

export interface RunningExtensionServices extends ExtensionServices {
  stop(): void;
}

const LOADING_SNAPSHOT: RawExtensionSnapshot = {
  ready: false,
  sceneReady: false,
  futureSchema: false,
  role: "PLAYER",
  playerId: "",
  players: [],
  memberSideIds: new Set(),
  leaderSideIds: new Set(),
  mapVisibleSourceIds: new Set(),
  armies: [],
  ships: [],
  sides: [],
  states: [],
  relations: {},
  battleGroups: [],
  settings: DEFAULT_SETTINGS,
  terrain: DEFAULT_TERRAIN,
  wars: [],
  turn: DEFAULT_TURN_STATE
};

function localCloneSourceIds(items: readonly Pick<SceneItemRecord, "metadata">[]): Set<string> {
  const result = new Set<string>();
  for (const item of items) {
    const metadata = item.metadata[METADATA_KEYS.localClone];
    if (typeof metadata !== "object" || metadata === null) continue;
    const sourceItemId = (metadata as Record<string, unknown>).sourceItemId;
    if (typeof sourceItemId === "string") result.add(sourceItemId);
  }
  return result;
}

export async function createOwlbearExtensionServices(): Promise<RunningExtensionServices> {
  const [{ default: OBR }, { createOwlbearAdapter }] = await Promise.all([
    import("@owlbear-rodeo/sdk"),
    import("./sdkAdapter")
  ]);
  const adapter = createOwlbearAdapter();
  const repository = new MetadataRepository(adapter);
  const diagnosticsPort: DiagnosticsPort = {
    getSelectedSource: async () => {
      const selected = await OBR.player.getSelection();
      if (!selected?.[0]) return undefined;
      return (await adapter.getSceneItems()).find((item) => item.id === selected[0]);
    },
    getSource: async (id) => (await adapter.getSceneItems()).find((item) => item.id === id),
    createTemporaryLocal: async (source) => {
      const clone = adapter.createClone(source);
      await adapter.addLocalItem(clone);
      return clone.id;
    },
    updateTemporaryLocal: (id, position) => adapter.updateLocalItem(id, { position }),
    deleteLocalItems: (ids) => adapter.deleteLocalItems(ids),
    updateSourcePosition: (id, position) => adapter.updateSceneItem(id, { position }),
    readBackgroundCounter: async () => Number(localStorage.getItem(`${METADATA_KEYS.scene}/background-counter`) ?? 0),
    probeContextMenu: async () => false
  };
  const diagnostics = new DiagnosticsService(diagnosticsPort);
  let commandSceneForCoordinator: SceneState | undefined;
  const gateway = new CommandGateway(adapter, 5_000, async () => {
    let scene = commandSceneForCoordinator;
    commandSceneForCoordinator = undefined;
    if (!scene) {
      try {
        const metadata = await adapter.getSceneMetadata();
        const migrated = migrateSceneState(metadata[METADATA_KEYS.scene] ?? { version: 3 });
        scene = migrated.ok ? migrated.value : undefined;
      } catch {
        // Live election is the startup fallback when persisted metadata is unavailable.
      }
    }
    const [players, currentConnectionId, currentRole] = await Promise.all([
      OBR.party.getPlayers(),
      OBR.player.getConnectionId(),
      OBR.player.getRole()
    ]);
    return resolveCoordinatorConnectionId([
      ...players
        .filter((player) => player.connectionId !== currentConnectionId)
        .map((player) => ({ connectionId: player.connectionId, role: player.role })),
      { connectionId: currentConnectionId, role: currentRole }
    ], scene?.coordinatorLease, Date.now());
  }, (reason, event) => diagnostics.recordAckRejection(reason, event));
  gateway.start();
  let snapshot = LOADING_SNAPSHOT;
  const listeners = new Set<() => void>();
  const unsubscribers: Array<() => void> = [];

  const publish = (next: RawExtensionSnapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };

  let observedLocalCloneSourceIds = new Set<string>();
  const loadSnapshot = async (): Promise<RawExtensionSnapshot> => {
    const [sceneReady, role, playerId, playerName, playerColor, party] = await Promise.all([
      OBR.scene.isReady(),
      OBR.player.getRole(),
      OBR.player.getId(),
      OBR.player.getName(),
      OBR.player.getColor(),
      OBR.party.getPlayers()
    ]);
    const players: PartyPlayerView[] = [
      ...party
        .filter((player) => player.id !== playerId)
        .map((player) => ({
          id: player.id,
          name: player.name,
          color: player.color,
          role: player.role,
          connected: true
        })),
      { id: playerId, name: playerName, color: playerColor, role, connected: true }
    ];
    if (!sceneReady) {
      return { ...LOADING_SNAPSHOT, ready: true, role, playerId, players };
    }
    const metadata = await adapter.getSceneMetadata();
    const rawScene = metadata[METADATA_KEYS.scene] ?? { version: 3 };
    const migrated = migrateSceneState(rawScene);
    if (!migrated.ok) {
      return {
        ...LOADING_SNAPSHOT,
        ready: true,
        sceneReady: true,
        futureSchema: migrated.issue.code === "FUTURE_VERSION",
        role,
        playerId,
        players
      };
    }
    const [armies, ships, localItems] = await Promise.all([
      repository.readArmies(),
      repository.readShips(),
      adapter.getLocalItems()
    ]);
    observedLocalCloneSourceIds = localCloneSourceIds(localItems);
    return buildRoleSafeSnapshot({
      role,
      playerId,
      scene: migrated.value,
      players,
      armies,
      ships,
      mapVisibleSourceIds: observedLocalCloneSourceIds
    });
  };
  const refreshCoordinator = createRefreshCoordinator(
    loadSnapshot,
    publish,
    semanticSnapshotEqual
  );

  const triggerRefresh = () => refreshCoordinator.request();
  const triggerLocalRefresh = (items: readonly Pick<SceneItemRecord, "metadata">[]) => {
    const nextSourceIds = localCloneSourceIds(items);
    if (semanticValueEqual(observedLocalCloneSourceIds, nextSourceIds)) return;
    observedLocalCloneSourceIds = nextSourceIds;
    refreshCoordinator.request();
  };
  unsubscribers.push(
    OBR.scene.onReadyChange(triggerRefresh),
    OBR.scene.items.onChange(triggerRefresh),
    OBR.scene.local.onChange(triggerLocalRefresh),
    OBR.scene.onMetadataChange(triggerRefresh),
    OBR.player.onChange(triggerRefresh),
    OBR.party.onChange(triggerRefresh)
  );
  refreshCoordinator.request();
  await refreshCoordinator.whenIdle();

  const send = async (command: UiCommand): Promise<unknown> => {
    try {
      if (command.type === "OPEN_MAP_BRUSH") {
        if (snapshot.role !== "GM") {
          await notifyRussian(adapter, "GM_ONLY");
          return undefined;
        }
        const settings = command.settings;
        await OBR.tool.setMetadata(MAP_BRUSH_TOOL_ID, {
          [MAP_BRUSH_MODE_KEY]: settings.mode,
          [MAP_BRUSH_SIZE_KEY]: settings.size,
          [MAP_BRUSH_TERRAIN_ID_KEY]: settings.terrainId,
          [MAP_BRUSH_SIDE_ID_KEY]: settings.sideId ?? null,
          [MAP_BRUSH_STATE_ID_KEY]: settings.stateId ?? null,
          [MAP_BRUSH_FACTION_OPERATION_KEY]: settings.factionOperation,
          [MAP_BRUSH_IMPASSABLE_VALUE_KEY]: settings.impassable,
          [MAP_BRUSH_ERASER_TARGET_KEY]: settings.eraserTarget
        });
        await OBR.tool.activateTool(MAP_BRUSH_TOOL_ID);
        await OBR.tool.activateMode(MAP_BRUSH_TOOL_ID, MAP_BRUSH_TOOL_MODE_ID);
        return undefined;
      }
      if (command.type === "EDIT_ROUTE") {
        const returnToolId = await OBR.tool.getActiveTool();
        try {
          await OBR.tool.setMetadata(ROUTE_TOOL_ID, {
            [ROUTE_ARMY_ID_KEY]: command.armyId,
            [ROUTE_RETURN_TOOL_KEY]: returnToolId
          });
          await OBR.tool.activateTool(ROUTE_TOOL_ID);
          await OBR.tool.activateMode(ROUTE_TOOL_ID, ROUTE_TOOL_MODE_ID);
        } catch (error) {
          try {
            await OBR.tool.setMetadata(ROUTE_TOOL_ID, {
              [ROUTE_ARMY_ID_KEY]: null,
              [ROUTE_RETURN_TOOL_KEY]: null
            });
          } catch {
            // The original activation failure is more useful to the caller.
          }
          throw error;
        }
        return undefined;
      }
      if (command.type === "EDIT_SHIP_ROUTE") {
        const returnToolId = await OBR.tool.getActiveTool();
        try {
          await OBR.tool.setMetadata(SHIP_ROUTE_TOOL_ID, {
            [SHIP_ROUTE_SHIP_ID_KEY]: command.shipId,
            [SHIP_ROUTE_RETURN_TOOL_KEY]: returnToolId
          });
          await OBR.tool.activateTool(SHIP_ROUTE_TOOL_ID);
          await OBR.tool.activateMode(SHIP_ROUTE_TOOL_ID, SHIP_ROUTE_TOOL_MODE_ID);
        } catch (error) {
          try {
            await OBR.tool.setMetadata(SHIP_ROUTE_TOOL_ID, {
              [SHIP_ROUTE_SHIP_ID_KEY]: null,
              [SHIP_ROUTE_RETURN_TOOL_KEY]: null
            });
          } catch {
            // The original activation failure is more useful to the caller.
          }
          throw error;
        }
        return undefined;
      }
      let payload: ArmyCommandPayload;
      if (command.type === "REGISTER_SELECTED_ARMY") {
        payload = {
          type: "REGISTER_ARMY",
          itemId: resolveRegistrationSelection({
            selection: (await OBR.player.getSelection()) ?? [],
            items: await adapter.getSceneItems()
          }).id,
          sideId: command.sideId
        };
      } else if (command.type === "REGISTER_SELECTED_SHIP") {
        payload = buildSelectedShipRegistrationPayload({
          selection: (await OBR.player.getSelection()) ?? [],
          items: await adapter.getSceneItems(),
          sideId: command.sideId,
          classId: command.classId,
          facing: command.facing
        });
      } else {
        payload = command;
      }
      const commandScene = snapshot.futureSchema ? undefined : await repository.readScene();
      commandSceneForCoordinator = commandScene;
      const envelope = {
        protocolVersion: COMMAND_PROTOCOL_VERSION,
        requestId: crypto.randomUUID(),
        senderPlayerId: await OBR.player.getId(),
        senderConnectionId: await OBR.player.getConnectionId(),
        expectedRevision: commandScene ? Number(commandScene.revision) : -1
      };
      const acknowledgement = await gateway.send({ ...envelope, ...payload } as ArmyCommand);
      if (acknowledgement.status === "REJECTED") {
        await notifyRussian(adapter, acknowledgement.reason ?? "INVALID_COMMAND");
      } else if (acknowledgement.status === "CONFLICT") {
        await notifyRussian(adapter, "REVISION_CONFLICT");
      } else {
        refreshCoordinator.request();
        await refreshCoordinator.whenIdle();
      }
      return acknowledgement;
    } catch (error) {
      if (error instanceof RegistrationError) {
        await notifyRussian(adapter, error.code);
        return undefined;
      }
      if (error instanceof CommandTimeoutError) {
        await notifyRussian(adapter, "COMMAND_TIMEOUT");
        return undefined;
      }
      if (error instanceof NoCoordinatorError) {
        await notifyRussian(adapter, "NO_COORDINATOR");
        return undefined;
      }
      await notifyRussian(adapter, "UNKNOWN", "ERROR");
      return undefined;
    }
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    send,
    runDiagnostic: (testId) => diagnostics.run(testId),
    stop: () => {
      refreshCoordinator.stop();
      gateway.stop();
      unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
      void diagnostics.cleanup();
    }
  };
}
