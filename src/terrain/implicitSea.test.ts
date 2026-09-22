import { expect, it } from "vitest";
import { DEFAULT_TERRAIN } from "../shared/constants";
import { migrateSceneState } from "../storage/migrations";
import { compactDefaultTerrain, DEFAULT_CELL_STATE } from "./gridMap";
import { cellSupportsDomain } from "./movementDomains";
import { CommandProcessor } from "../commands/commandProcessor";
import { COMMAND_PROTOCOL_VERSION, type ArmyCommand } from "../shared/types";

it("makes an unpainted cell navigable by sea, not land", () => {
  const scene = { terrain: DEFAULT_TERRAIN, gridMap: { version: 1 as const, revision: 0, cells: {} } };
  expect(cellSupportsDomain(scene, { x: 0, y: 0 }, "SEA")).toBe(true);
  expect(cellSupportsDomain(scene, { x: 0, y: 0 }, "LAND")).toBe(false);
});

it("painting and erasing sea retain political data without terrain overrides", () => {
  const initial = migrateSceneState({ version: 7 });
  if (!initial.ok) throw new Error("fixture");
  let scene = initial.value;
  scene.gridMap.cells["0,0"] = { ...DEFAULT_CELL_STATE, terrainId: "plain", recognizedStateId: "owner" };
  for (const payload of [
    { type: "SET_TERRAIN_CELLS", terrainId: "sea" },
    { type: "SET_TERRAIN_CELLS", terrainId: "plain" },
    { type: "CLEAR_CELL_PROPERTIES", target: "TERRAIN" }
  ]) {
    const result = new CommandProcessor().execute({ role: "GM", playerId: "gm", connectionId: "gm",
      connectedPlayerIds: new Set(["gm"]), state: { scene, armies: {}, barriers: {}, items: {} } },
    { protocolVersion: COMMAND_PROTOCOL_VERSION, requestId: crypto.randomUUID(), senderPlayerId: "gm", senderConnectionId: "gm",
      expectedRevision: scene.revision, cells: [{ x: 0, y: 0 }], ...payload } as ArmyCommand);
    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") throw new Error(result.status);
    scene = result.state.scene;
    expect(scene.gridMap.cells["0,0"]?.recognizedStateId).toBe("owner");
    expect(scene.gridMap.cells["0,0"]?.terrainId).toBe(payload.terrainId === "plain" ? "plain" : null);
  }
});

it("compacts water without erasing politics, impassability or explicit plains", () => {
  const water = { ...DEFAULT_CELL_STATE, terrainId: "sea" };
  const land = { ...DEFAULT_CELL_STATE, terrainId: "plain" };
  const political = { ...water, recognizedStateId: "state", deFactoStateId: "other", factionTerritoryIds: ["legacy"], impassable: true };
  const grid = { version: 1 as const, revision: 3, cells: { "0,0": water, "1,0": land, "2,0": political } };
  expect(compactDefaultTerrain(grid, "sea")).toEqual({ ...grid, cells: {
    "1,0": land, "2,0": { ...political, terrainId: null }
  } });
  expect(grid.cells["0,0"]).toEqual(water);
});

it("migrates old plain defaults to water while retaining explicit land", () => {
  const result = migrateSceneState({ version: 7, terrain: { ...DEFAULT_TERRAIN, defaultTerrainId: "plain" },
    gridMap: { version: 1, revision: 9, cells: {
      "0,0": { ...DEFAULT_CELL_STATE, terrainId: "sea" },
      "1,0": { ...DEFAULT_CELL_STATE, terrainId: "plain" }
    } } });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.value.terrain.defaultTerrainId).toBe("sea");
  expect(result.value.gridMap.cells).toEqual({ "1,0": { ...DEFAULT_CELL_STATE, terrainId: "plain" } });
  expect(migrateSceneState(result.value)).toEqual(result);
});
