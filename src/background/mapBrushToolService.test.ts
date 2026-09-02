import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE, METADATA_KEYS } from "../shared/constants";
import type { ArmyCommand, SceneState } from "../shared/types";
import { MapBrushToolService } from "./mapBrushToolService";

function scene(): SceneState {
  return {
    version: 5, revision: 7, settings: { ...DEFAULT_SETTINGS }, sides: [], states: [{ id: "russia-state", name: "Россия", rulingFactionId: null, active: true }], relations: {}, battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN), gridMap: { version: 1, revision: 0, cells: {} },
    wars: [], turn: structuredClone(DEFAULT_TURN_STATE)
  };
}

it("sends one terrain batch command for one brush stroke", async () => {
  const sent: ArmyCommand[] = [];
  const current = scene();
  const service = new MapBrushToolService({
    getPlayerIdentity: async () => ({ id: "gm", role: "GM", connectionId: "c" }),
    getGridDpi: async () => 100,
    show: async () => undefined,
    getSceneMetadata: async () => ({ [METADATA_KEYS.scene]: current }),
    patchSceneMetadata: async () => undefined,
    getSceneItems: async () => [], updateSceneItem: async () => undefined,
    getLocalItems: async () => [], addLocalItems: async () => undefined, updateLocalItems: async () => undefined,
    deleteLocalItems: async () => undefined, createId: () => crypto.randomUUID()
  }, {
    send: async (command) => {
      sent.push(command);
      return { protocolVersion: 4, requestId: command.requestId, status: "ACCEPTED", coordinatorConnectionId: "coord", recipientConnectionId: "c" };
    }
  });

  await service.commitStroke({
    mode: "TERRAIN", size: 1, terrainId: "forest", factionOperation: "ADD", impassable: true, eraserTarget: "TERRAIN"
  }, [{ x: 0, y: 0 }, { x: 1, y: 0 }]);

  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({
    type: "SET_TERRAIN_CELLS", expectedRevision: 7, terrainId: "forest", cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }]
  });
});


it("sends de-facto state painting as one batch command", async () => {
  const sent: ArmyCommand[] = [];
  const current = scene();
  const service = new MapBrushToolService({
    getPlayerIdentity: async () => ({ id: "gm", role: "GM", connectionId: "c" }),
    getGridDpi: async () => 100, show: async () => undefined,
    getSceneMetadata: async () => ({ [METADATA_KEYS.scene]: current }), patchSceneMetadata: async () => undefined,
    getSceneItems: async () => [], updateSceneItem: async () => undefined,
    getLocalItems: async () => [], addLocalItems: async () => undefined, updateLocalItems: async () => undefined,
    deleteLocalItems: async () => undefined, createId: () => crypto.randomUUID()
  }, {
    send: async (command) => { sent.push(command); return { protocolVersion: 4, requestId: command.requestId, status: "ACCEPTED", coordinatorConnectionId: "coord", recipientConnectionId: "c" }; }
  });
  await service.commitStroke({
    mode: "DEFACTO_STATE", size: 3, terrainId: "plain", stateId: "russia-state",
    factionOperation: "ADD", impassable: true, eraserTarget: "TERRAIN"
  }, [{ x: 4, y: 5 }]);
  expect(sent[0]).toMatchObject({ type: "SET_DEFACTO_STATE_CELLS", stateId: "russia-state", cells: [{ x: 4, y: 5 }] });
});
