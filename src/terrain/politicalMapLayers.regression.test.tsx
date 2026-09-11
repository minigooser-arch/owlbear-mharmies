// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { validateArmyCommand } from "../commands/commandValidation";
import { METADATA_KEYS, DEFAULT_TERRAIN } from "../shared/constants";
import { COMMAND_PROTOCOL_VERSION, type SceneItemRecord, type Side, type StateEntity } from "../shared/types";
import { MapEditorPage } from "../ui/pages/MapEditorPage";
import { applyCellPatchBatch, readCell } from "./gridMap";
import { MapOverlayService } from "./mapOverlayService";

const sides: Side[] = [
  { id: "red", name: "Красные", color: "#ff0000", playerIds: [], leaderPlayerIds: [], stateId: "russia" }
];
const states: StateEntity[] = [
  { id: "russia", name: "Россия", color: "#b71c1c", rulingFactionId: "red", active: true },
  { id: "germany", name: "Германия", color: "#1a237e", rulingFactionId: null, active: true }
];

afterEach(cleanup);

function envelope(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    protocolVersion: COMMAND_PROTOCOL_VERSION,
    requestId: "map-layer-test",
    senderPlayerId: "gm",
    senderConnectionId: "gm-connection",
    expectedRevision: 1,
    ...payload
  };
}

function overlayHarness() {
  let items: SceneItemRecord[] = [];
  let nextId = 1;
  return {
    port: {
      getLocalItems: async () => items.map((item) => structuredClone(item)),
      addLocalItems: async (added: readonly SceneItemRecord[]) => {
        items.push(...added.map((item) => structuredClone(item)));
      },
      updateLocalItems: async (updated: readonly SceneItemRecord[]) => {
        const byId = new Map(updated.map((item) => [item.id, structuredClone(item)]));
        items = items.map((item) => byId.get(item.id) ?? item);
      },
      deleteLocalItems: async (ids: readonly string[]) => {
        const removed = new Set(ids);
        items = items.filter((item) => !removed.has(item.id));
      },
      createId: () => `political-overlay-${nextId++}`
    },
    items: () => items
  };
}

describe("independent political map layers", () => {
  it("rejects legacy faction-territory commands in protocol v5", () => {
    expect(validateArmyCommand(envelope({
      type: "UPDATE_FACTION_TERRITORY_CELLS",
      cells: [{ x: 0, y: 0 }],
      sideId: "red",
      operation: "ADD"
    }))).toMatchObject({ ok: false, reason: "INVALID_COMMAND" });

    expect(validateArmyCommand(envelope({
      type: "CLEAR_CELL_PROPERTIES",
      cells: [{ x: 0, y: 0 }],
      target: "SELECTED_FACTION",
      sideId: "red"
    }))).toMatchObject({ ok: false, reason: "INVALID_COMMAND" });
  });

  it("patches terrain, recognized ownership and de-facto control independently", () => {
    const initial = {
      version: 1 as const,
      revision: 1,
      cells: {
        "0,0": {
          terrainId: "mountains",
          impassable: true,
          factionTerritoryIds: ["legacy-red"],
          recognizedStateId: "russia",
          deFactoStateId: "germany"
        }
      }
    };

    const recognized = applyCellPatchBatch(initial, [{
      cell: { x: 0, y: 0 },
      patch: { recognizedStateId: "germany" }
    }]);
    expect(readCell(recognized, { x: 0, y: 0 })).toEqual({
      terrainId: "mountains",
      impassable: true,
      factionTerritoryIds: ["legacy-red"],
      recognizedStateId: "germany",
      deFactoStateId: "germany"
    });

    const terrain = applyCellPatchBatch(recognized, [{
      cell: { x: 0, y: 0 },
      patch: { terrainId: "forest" }
    }]);
    expect(readCell(terrain, { x: 0, y: 0 })).toMatchObject({
      terrainId: "forest",
      recognizedStateId: "germany",
      deFactoStateId: "germany"
    });

    const deFacto = applyCellPatchBatch(terrain, [{
      cell: { x: 0, y: 0 },
      patch: { deFactoStateId: "russia" }
    }]);
    expect(readCell(deFacto, { x: 0, y: 0 })).toMatchObject({
      terrainId: "forest",
      recognizedStateId: "germany",
      deFactoStateId: "russia"
    });
  });

  it("does not expose faction territory as a current map-editing layer", () => {
    render(<MapEditorPage terrain={DEFAULT_TERRAIN} sides={sides} states={states} onAction={vi.fn()} />);
    const mode = screen.getByLabelText("Режим кисти");
    expect(mode).not.toContainHTML("Территория фракции");
    expect(screen.queryByRole("option", { name: "Только территорию выбранной фракции" })).not.toBeInTheDocument();
  });

  it("ignores legacy faction territory when rendering current overlays", async () => {
    const test = overlayHarness();
    await new MapOverlayService(test.port).reconcile({
      dpi: 100,
      gridMap: {
        version: 1,
        revision: 1,
        cells: {
          "0,0": {
            terrainId: "forest",
            impassable: false,
            factionTerritoryIds: ["red"],
            recognizedStateId: "russia",
            deFactoStateId: "germany"
          }
        }
      },
      terrain: DEFAULT_TERRAIN,
      sides,
      states
    });

    const overlayMetadata = test.items().map((item) => item.metadata[METADATA_KEYS.mapOverlay]);
    expect(overlayMetadata).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "TERRITORY" })
    ]));
    expect(test.items().find((item) => item.type === "LABEL" && item.text === "Т: Красные")).toBeUndefined();
    expect(overlayMetadata).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "TERRAIN" }),
      expect.objectContaining({ kind: "RECOGNIZED_STATE" }),
      expect.objectContaining({ kind: "DEFACTO_STATE" })
    ]));
  });
});