// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import { cellSupportsDomain } from "./movementDomains";
import { MapOverlayService } from "./mapOverlayService";
import { TurnStatusCard } from "../ui/components/TurnStatusCard";
import { setTurnNumber } from "../turns/turnService";
import type { SceneItemRecord, SceneState } from "../shared/types";

afterEach(cleanup);

describe("built-in strategic terrain", () => {
  it("ships cannot enter ice while land units can", () => {
    const scene = {
      terrain: DEFAULT_TERRAIN,
      gridMap: {
        version: 1,
        revision: 0,
        cells: {
          "0,0": { terrainId: "ice", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null }
        }
      }
    } as unknown as SceneState;
    expect(cellSupportsDomain(scene, { x: 0, y: 0 }, "LAND")).toBe(true);
    expect(cellSupportsDomain(scene, { x: 0, y: 0 }, "SEA")).toBe(false);
  });

  it("contains the requested built-in terrain colors", () => {
    expect(Object.fromEntries(Object.entries(DEFAULT_TERRAIN.types).map(([id, terrain]) => [id, terrain.color]))).toMatchObject({
      plain: "#9ACD66",
      forest: "#2E8B57",
      forest_hills: "#1F5F3A",
      hills: "#B6D7A8",
      mountains: "#808080",
      swamp: "#8A8B5C",
      desert: "#F3E5AB",
      tundra: "#FFFFFF",
      sea: "#2F6BFF",
      ice: "#87CEEB"
    });
  });
});

describe("terrain overlay visibility", () => {
  it("renders terrain with a visible fill in addition to the border", async () => {
    let items: SceneItemRecord[] = [];
    await new MapOverlayService({
      getLocalItems: async () => items,
      addLocalItems: async (added) => { items = [...items, ...added]; },
      updateLocalItems: async () => undefined,
      deleteLocalItems: async () => undefined,
      createId: () => "terrain-overlay"
    }).reconcile({
      dpi: 100,
      gridMap: { version: 1, revision: 1, cells: { "0,0": { terrainId: "forest", impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null } } },
      terrain: DEFAULT_TERRAIN,
      sides: [],
      states: []
    });
    const terrain = items[0];
    expect(terrain?.fillColor).toBe(DEFAULT_TERRAIN.types.forest?.color);
    expect(terrain?.fillOpacity).toBeGreaterThan(0);
    expect(terrain?.strokeWidth).toBeGreaterThan(1);
  });
});

describe("manual turn number", () => {
  it("changes only the counter", () => {
    const turn = setTurnNumber({ ...DEFAULT_TURN_STATE, turnNumber: 26 }, 1);
    expect(turn.turnNumber).toBe(1);
    expect(turn.phase).toBe(DEFAULT_TURN_STATE.phase);
    expect(turn.autoTurnsPaused).toBe(DEFAULT_TURN_STATE.autoTurnsPaused);
  });

  it("rejects zero and fractional turn numbers", () => {
    expect(() => setTurnNumber(DEFAULT_TURN_STATE, 0)).toThrow("INVALID_TURN_NUMBER");
    expect(() => setTurnNumber(DEFAULT_TURN_STATE, 1.5)).toThrow("INVALID_TURN_NUMBER");
  });

  it("lets a GM submit a new turn number", () => {
    const action = vi.fn();
    render(<TurnStatusCard turn={{ ...DEFAULT_TURN_STATE, turnNumber: 26 }} role="GM" onAction={action} />);
    fireEvent.click(screen.getByText("Настройки хода"));
    fireEvent.change(screen.getByLabelText("Номер хода"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Установить номер хода" }));
    expect(action).toHaveBeenCalledWith({ type: "SET_TURN_NUMBER", turnNumber: 1 });
  });
});
