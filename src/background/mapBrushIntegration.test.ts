import type { ToolMode } from "@owlbear-rodeo/sdk";
import { expect, it, vi } from "vitest";
import { CommandProcessor } from "../commands/commandProcessor";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE, MAP_BRUSH_MODE_KEY, MAP_BRUSH_SIZE_KEY, MAP_BRUSH_TERRAIN_ID_KEY, METADATA_KEYS } from "../shared/constants";
import { COMMAND_PROTOCOL_VERSION, type ArmyCommand, type SceneItemRecord, type SceneState } from "../shared/types";
import { registerMapBrushTool, type MapBrushToolApi } from "../owlbear/mapBrushTool";
import { MapBrushToolService } from "./mapBrushToolService";

function baseScene(): SceneState {
  return {
    version: 6,
    revision: 1,
    settings: structuredClone(DEFAULT_SETTINGS),
    sides: [],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: structuredClone(DEFAULT_TURN_STATE),
    ships: {},
    navalBattleRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {}
  };
}

it("persists a real terrain brush click through tool, service, command processor, and grid map", async () => {
  let scene = baseScene();
  let registeredMode: ToolMode | undefined;
  let localItems: SceneItemRecord[] = [];

  const api: MapBrushToolApi = {
    create: async () => undefined,
    remove: async () => undefined,
    createMode: async (mode) => { registeredMode = mode; },
    removeMode: async () => undefined,
    setMetadata: async () => undefined
  };

  const port = {
    getPlayerIdentity: async () => ({ id: "gm", role: "GM" as const, connectionId: "gm-connection" }),
    getRole: async () => "GM" as const,
    getGridDpi: async () => 100,
    show: async () => undefined,
    getSceneMetadata: async () => ({ [METADATA_KEYS.scene]: structuredClone(scene) }),
    patchSceneMetadata: async () => undefined,
    getSceneItems: async () => [],
    updateSceneItem: async () => undefined,
    getLocalItems: async () => structuredClone(localItems),
    addLocalItems: async (items: readonly SceneItemRecord[]) => { localItems.push(...structuredClone(items)); },
    updateLocalItems: async (items: readonly SceneItemRecord[]) => {
      const byId = new Map(items.map((item) => [item.id, item]));
      localItems = localItems.map((item) => structuredClone(byId.get(item.id) ?? item));
    },
    deleteLocalItems: async (ids: readonly string[]) => {
      const remove = new Set(ids);
      localItems = localItems.filter((item) => !remove.has(item.id));
    },
    createId: () => crypto.randomUUID()
  };

  const processor = new CommandProcessor();
  const service = new MapBrushToolService(port, {
    send: async (command: ArmyCommand) => {
      const result = processor.execute({
        role: "GM",
        playerId: "gm",
        connectionId: "gm-connection",
        connectedPlayerIds: new Set(["gm"]),
        state: {
          scene,
          armies: {},
          barriers: {},
          items: {}
        }
      }, command);
      if (result.status === "ACCEPTED") scene = result.state.scene;
      return {
        protocolVersion: COMMAND_PROTOCOL_VERSION,
        requestId: command.requestId,
        status: result.status,
        ...(result.status === "REJECTED" ? { reason: result.reason } : {}),
        ...(result.status === "CONFLICT" ? { actualRevision: result.actualRevision } : {}),
        coordinatorConnectionId: "gm-connection",
        recipientConnectionId: "gm-connection"
      };
    }
  });

  const registration = await registerMapBrushTool(api, service, "/icon.png");
  expect(registeredMode).toBeDefined();

  registeredMode?.onToolClick?.({
    activeTool: "com.letopis.army-control/map-brush-tool",
    activeMode: "com.letopis.army-control/map-brush-tool/paint",
    metadata: {
      [MAP_BRUSH_MODE_KEY]: "TERRAIN",
      [MAP_BRUSH_SIZE_KEY]: 1,
      [MAP_BRUSH_TERRAIN_ID_KEY]: "forest"
    }
  }, {
    pointerPosition: { x: 150, y: 50 }
  } as never);

  await vi.waitFor(() => {
    expect(scene.gridMap.cells["1,0"]).toMatchObject({ terrainId: "forest" });
  });
  expect(scene.revision).toBe(2);

  await registration();
});
