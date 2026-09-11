import { expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE, METADATA_KEYS } from "../shared/constants";
import { COMMAND_PROTOCOL_VERSION, type ArmyCommand, type SceneState } from "../shared/types";
import { MapBrushToolService } from "./mapBrushToolService";

function scene(): SceneState {
  return {
    version: 5, revision: 7, settings: { ...DEFAULT_SETTINGS }, sides: [], states: [{ id: "russia-state", name: "Россия", rulingFactionId: null, active: true }], relations: {}, battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN), gridMap: { version: 1, revision: 0, cells: {} },
    wars: [], turn: structuredClone(DEFAULT_TURN_STATE)
  };
}

function servicePort(current: SceneState) {
  return {
    getPlayerIdentity: async () => ({ id: "gm", role: "GM" as const, connectionId: "c" }),
    getGridDpi: async () => 100,
    show: async () => undefined,
    getSceneMetadata: async () => ({ [METADATA_KEYS.scene]: current }),
    patchSceneMetadata: async () => undefined,
    getSceneItems: async () => [], updateSceneItem: async () => undefined,
    getLocalItems: async () => [], addLocalItems: async () => undefined, updateLocalItems: async () => undefined,
    deleteLocalItems: async () => undefined, createId: () => crypto.randomUUID()
  };
}

it("sends one terrain batch command for one brush stroke", async () => {
  const sent: ArmyCommand[] = [];
  const current = scene();
  const service = new MapBrushToolService(servicePort(current), {
    send: async (command) => {
      sent.push(command);
      return { protocolVersion: COMMAND_PROTOCOL_VERSION, requestId: command.requestId, status: "ACCEPTED", coordinatorConnectionId: "coord", recipientConnectionId: "c" };
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
  const service = new MapBrushToolService(servicePort(current), {
    send: async (command) => {
      sent.push(command);
      return { protocolVersion: COMMAND_PROTOCOL_VERSION, requestId: command.requestId, status: "ACCEPTED", coordinatorConnectionId: "coord", recipientConnectionId: "c" };
    }
  });

  await service.commitStroke({
    mode: "DEFACTO_STATE", size: 3, terrainId: "plain", stateId: "russia-state",
    factionOperation: "ADD", impassable: true, eraserTarget: "TERRAIN"
  }, [{ x: 4, y: 5 }]);

  expect(sent[0]).toMatchObject({ type: "SET_DEFACTO_STATE_CELLS", stateId: "russia-state", cells: [{ x: 4, y: 5 }] });
});

it("retries the same deterministic stroke once with the coordinator actual revision", async () => {
  const sent: ArmyCommand[] = [];
  const current = scene();
  const service = new MapBrushToolService(servicePort(current), {
    send: async (command) => {
      sent.push(command);
      if (sent.length === 1) {
        return {
          protocolVersion: COMMAND_PROTOCOL_VERSION,
          requestId: command.requestId,
          status: "CONFLICT",
          actualRevision: 8,
          coordinatorConnectionId: "coord",
          recipientConnectionId: "c"
        };
      }
      return {
        protocolVersion: COMMAND_PROTOCOL_VERSION,
        requestId: command.requestId,
        status: "ACCEPTED",
        coordinatorConnectionId: "coord",
        recipientConnectionId: "c"
      };
    }
  });

  await service.commitStroke({
    mode: "TERRAIN", size: 1, terrainId: "sea", factionOperation: "ADD", impassable: true, eraserTarget: "TERRAIN"
  }, [{ x: 10, y: 12 }]);

  expect(sent).toHaveLength(2);
  expect(sent[0]).toMatchObject({
    type: "SET_TERRAIN_CELLS", expectedRevision: 7, terrainId: "sea", cells: [{ x: 10, y: 12 }]
  });
  expect(sent[1]).toMatchObject({
    type: "SET_TERRAIN_CELLS", expectedRevision: 8, terrainId: "sea", cells: [{ x: 10, y: 12 }]
  });
  expect(sent[1]?.requestId).not.toBe(sent[0]?.requestId);
});

it("converges across repeated revision conflicts without changing the stroke", async () => {
  const sent: ArmyCommand[] = [];
  const current = scene();
  const service = new MapBrushToolService(servicePort(current), {
    send: async (command) => {
      sent.push(command);
      const nextRevision = [8, 9, 10][sent.length - 1];
      if (nextRevision !== undefined) {
        return {
          protocolVersion: COMMAND_PROTOCOL_VERSION,
          requestId: command.requestId,
          status: "CONFLICT",
          actualRevision: nextRevision,
          coordinatorConnectionId: "coord",
          recipientConnectionId: "c"
        };
      }
      return {
        protocolVersion: COMMAND_PROTOCOL_VERSION,
        requestId: command.requestId,
        status: "ACCEPTED",
        coordinatorConnectionId: "coord",
        recipientConnectionId: "c"
      };
    }
  });

  await service.commitStroke({
    mode: "TERRAIN", size: 5, terrainId: "sea", factionOperation: "ADD", impassable: true, eraserTarget: "TERRAIN"
  }, [{ x: 10, y: 12 }, { x: 11, y: 12 }]);

  expect(sent.map((command) => command.expectedRevision)).toEqual([7, 8, 9, 10]);
  expect(sent.map((command) => command.requestId).length).toBe(new Set(sent.map((command) => command.requestId)).size);
  for (const command of sent) {
    expect(command).toMatchObject({
      type: "SET_TERRAIN_CELLS",
      terrainId: "sea",
      cells: [{ x: 10, y: 12 }, { x: 11, y: 12 }]
    });
  }
});