import { expect, it } from "vitest";
import { DEFAULT_CELL_STATE } from "../terrain/gridMap";
import { decodeGridChunks, encodeGridChunks, utf8Size, type GridChunk } from "./gridChunkCodec";

it("round trips all 7015 land cells with compact bounded chunks", () => {
  const cells = Object.fromEntries(Array.from({ length: 7015 }, (_, i) => [
    `${i % 61},${Math.floor(i / 61)}`,
    { ...DEFAULT_CELL_STATE, terrainId: "mountains", recognizedStateId: "государство", deFactoStateId: "occupier", factionTerritoryIds: ["legacy"] }
  ]));
  const grid = { version: 1 as const, revision: 4, cells };
  const chunks = encodeGridChunks(grid);
  expect(Object.keys(chunks)).toHaveLength(120);
  expect(decodeGridChunks(Object.values(chunks), 4)).toEqual(grid);
  for (const chunk of Object.values(chunks)) expect(utf8Size(chunk)).toBeLessThanOrEqual(12 * 1024);
});

it("maps negative coordinates with floor division and preserves flags", () => {
  const grid = { version: 1 as const, revision: 2, cells: { "-1,-9": { ...DEFAULT_CELL_STATE, terrainId: "forest", impassable: true } } };
  expect(encodeGridChunks(grid)).toEqual({ "-1,-2": { version: 1, x: -1, y: -2, revision: 2, cells: [[63, "forest", true, [], null, null]] } });
  expect(decodeGridChunks(Object.values(encodeGridChunks(grid)), 2)).toEqual(grid);
});

it.each([
  { version: 2, x: 0, y: 0, revision: 0, cells: [] },
  { version: 1, x: 0.5, y: 0, revision: 0, cells: [] },
  { version: 1, x: 0, y: 0, revision: 0, cells: [[64, null, false, [], null, null]] },
  { version: 1, x: 0, y: 0, revision: 0, cells: [[0, null, "false", [], null, null]] },
  { version: 1, x: 0, y: 0, revision: 0, cells: [[0, null, false, [], null, null], [0, null, false, [], null, null]] }
])("rejects malformed chunks rather than losing cells: %j", (chunk) => {
  expect(() => decodeGridChunks([chunk as GridChunk], 0)).toThrow("GRID_CHUNK_INVALID");
});

it("rejects oversized UTF-8 chunks and malformed coordinate keys", () => {
  const cell = { ...DEFAULT_CELL_STATE, terrainId: "я".repeat(7000) };
  expect(() => encodeGridChunks({ version: 1, revision: 0, cells: { "0,0": cell } })).toThrow("GRID_CHUNK_TOO_LARGE");
  expect(() => encodeGridChunks({ version: 1, revision: 0, cells: { bad: { ...cell, terrainId: "plain" } } })).toThrow();
});

it("rejects duplicated chunks instead of overwriting cells", () => {
  const chunk: GridChunk = { version: 1, revision: 0, x: 0, y: 0, cells: [[0, "plain", false, [], null, null]] };
  expect(() => decodeGridChunks([chunk, chunk], 0)).toThrow("GRID_CHUNK_INVALID");
});
