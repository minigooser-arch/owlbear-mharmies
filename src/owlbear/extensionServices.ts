import { electCoordinator } from "../background/coordinator";
import { CommandGateway, CommandTimeoutError } from "../commands/commandGateway";
import {
  DEFAULT_SETTINGS,
  METADATA_KEYS,
  ROUTE_ARMY_ID_KEY,
  ROUTE_RETURN_TOOL_KEY,
  ROUTE_TOOL_ID,
  ROUTE_TOOL_MODE_ID
} from "../shared/constants";
import type { ArmyCommand, SceneItemRecord, SceneState } from "../shared/types";
import { migrateSceneState } from "../storage/migrations";
import { MetadataRepository, type ArmyRecord } from "../storage/metadataRepository";
import type {
  ArmyView,
  ExtensionServices,
  PartyPlayerView,
  RawExtensionSnapshot,
  UiCommand
} from "../ui/state/useExtensionState";
import { DiagnosticsService, type DiagnosticsPort } from "./diagnostics";
import { notifyRussian } from "./notifications";
import { RegistrationError, resolveRegistrationSelection } from "./registration";

export interface SnapshotInput {
  role: "GM" | "PLAYER";
  playerId: string;
  scene: SceneState;
  players: readonly PartyPlayerView[];
  armies: readonly ArmyRecord[];
  localCloneSourceIds: ReadonlySet<string>;
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
  const visibleSourceIds = new Set(input.localCloneSourceIds);
  for (const army of input.armies) {
    if (input.role === "GM" || memberSideIds.has(army.state.sideId)) visibleSourceIds.add(army.item.id);
  }
  const sideNames = new Map(input.scene.sides.map((side) => [side.id, side.name]));
  const armies: ArmyView[] = input.armies.map(({ item, state }) => {
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
      route: routeVisible ? state.route.map((point) => ({ ...point })) : []
    };
  });
  return {
    ready: true,
    sceneReady: true,
    futureSchema: false,
    role: input.role,
    playerId: input.playerId,
    players: input.players,
    memberSideIds,
    leaderSideIds,
    visibleSourceIds,
    armies,
    sides: input.scene.sides,
    relations: input.scene.relations,
    battleGroups: input.scene.battleGroups,
    settings: input.scene.settings
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
  visibleSourceIds: new Set(),
  armies: [],
  sides: [],
  relations: {},
  battleGroups: [],
  settings: DEFAULT_SETTINGS
};

function localCloneSourceIds(items: readonly SceneItemRecord[]): Set<string> {
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
  const gateway = new CommandGateway(adapter, 5_000, async () => {
    const [players, currentConnectionId, currentRole] = await Promise.all([
      OBR.party.getPlayers(),
      OBR.player.getConnectionId(),
      OBR.player.getRole()
    ]);
    return electCoordinator([
      ...players
        .filter((player) => player.connectionId !== currentConnectionId)
        .map((player) => ({ connectionId: player.connectionId, role: player.role })),
      { connectionId: currentConnectionId, role: currentRole }
    ]);
  });
  gateway.start();
  let snapshot = LOADING_SNAPSHOT;
  const listeners = new Set<() => void>();
  const unsubscribers: Array<() => void> = [];

  const publish = (next: RawExtensionSnapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };

  const refresh = async () => {
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
      publish({ ...LOADING_SNAPSHOT, ready: true, role, playerId, players });
      return;
    }
    const metadata = await adapter.getSceneMetadata();
    const rawScene = metadata[METADATA_KEYS.scene] ?? { version: 3 };
    const migrated = migrateSceneState(rawScene);
    if (!migrated.ok) {
      publish({
        ...LOADING_SNAPSHOT,
        ready: true,
        sceneReady: true,
        futureSchema: migrated.issue.code === "FUTURE_VERSION",
        role,
        playerId,
        players
      });
      return;
    }
    const [armies, localItems] = await Promise.all([
      repository.readArmies(),
      adapter.getLocalItems()
    ]);
    publish(buildRoleSafeSnapshot({
      role,
      playerId,
      scene: migrated.value,
      players,
      armies,
      localCloneSourceIds: localCloneSourceIds(localItems)
    }));
  };

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

  const triggerRefresh = () => void refresh();
  unsubscribers.push(
    OBR.scene.onReadyChange(triggerRefresh),
    OBR.scene.items.onChange(triggerRefresh),
    OBR.scene.local.onChange(triggerRefresh),
    OBR.scene.onMetadataChange(triggerRefresh),
    OBR.player.onChange(triggerRefresh),
    OBR.party.onChange(triggerRefresh)
  );
  await refresh();

  const send = async (command: UiCommand): Promise<unknown> => {
    try {
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
      const payload = command.type === "REGISTER_SELECTED_ARMY"
        ? {
            type: "REGISTER_ARMY" as const,
            itemId: resolveRegistrationSelection({
              selection: (await OBR.player.getSelection()) ?? [],
              items: await adapter.getSceneItems()
            }).id,
            sideId: command.sideId
          }
        : command;
      const envelope = {
        requestId: crypto.randomUUID(),
        senderPlayerId: await OBR.player.getId(),
        senderConnectionId: await OBR.player.getConnectionId(),
        expectedRevision: snapshot.futureSchema ? -1 : Number((await repository.readScene()).revision)
      };
      const acknowledgement = await gateway.send({ ...envelope, ...payload } as ArmyCommand);
      if (acknowledgement.status === "REJECTED") {
        await notifyRussian(adapter, acknowledgement.reason ?? "INVALID_COMMAND");
      } else if (acknowledgement.status === "CONFLICT") {
        await notifyRussian(adapter, "REVISION_CONFLICT");
      } else {
        await refresh();
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
      gateway.stop();
      unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
      void diagnostics.cleanup();
    }
  };
}
