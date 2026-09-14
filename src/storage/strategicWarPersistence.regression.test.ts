import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE, METADATA_KEYS } from "../shared/constants";
import type { ItemUpdate, SceneItemRecord, SceneState } from "../shared/types";
import { MetadataRepository, type MetadataPort } from "./metadataRepository";

class MemoryPort implements MetadataPort {
  sceneMetadata: Record<string, unknown> = {};
  items: SceneItemRecord[] = [];

  async getSceneMetadata(): Promise<Record<string, unknown>> {
    return structuredClone(this.sceneMetadata);
  }

  async patchSceneMetadata(update: Record<string, unknown>): Promise<void> {
    this.sceneMetadata = { ...this.sceneMetadata, ...structuredClone(update) };
  }

  async getSceneItems(): Promise<SceneItemRecord[]> {
    return structuredClone(this.items);
  }

  async updateSceneItem(id: string, update: ItemUpdate): Promise<void> {
    const item = this.items.find((candidate) => candidate.id === id);
    if (!item) throw new Error(`Missing item ${id}`);
    Object.assign(item, structuredClone(update));
  }
}

function strategicScene(): SceneState {
  return {
    version: 7,
    revision: 12,
    settings: structuredClone(DEFAULT_SETTINGS),
    sides: [
      { id: "red", name: "Красные", color: "#d32f2f", playerIds: [], leaderPlayerIds: [], stateId: "ru" },
      { id: "blue", name: "Синие", color: "#1976d2", playerIds: [], leaderPlayerIds: [], stateId: "de" }
    ],
    states: [
      { id: "ru", name: "Россия", color: "#d32f2f", rulingFactionId: "red", active: true },
      { id: "de", name: "Германия", color: "#1976d2", rulingFactionId: "blue", active: true }
    ],
    relations: {},
    stateRelations: {
      ru: { de: { militaryAccess: false, atWar: true } },
      de: { ru: { militaryAccess: true, atWar: true } }
    },
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: {
      version: 1,
      revision: 4,
      cells: {
        "0,0": {
          terrainId: "road",
          impassable: false,
          factionTerritoryIds: ["red"],
          recognizedStateId: "ru",
          deFactoStateId: "de"
        },
        "1,0": {
          terrainId: null,
          impassable: false,
          factionTerritoryIds: [],
          recognizedStateId: "ru",
          deFactoStateId: "ru"
        }
      }
    },
    wars: [
      {
        id: "legacy-history",
        name: "Историческая запись",
        participantFactionIds: ["red", "blue"],
        participantStateIds: ["ru", "de"],
        active: false
      }
    ],
    turn: { ...structuredClone(DEFAULT_TURN_STATE), turnNumber: 8, phase: "POST_MOVEMENT" },
    ships: {},
    navalBattleRequests: [],
    transportEmbarkRequests: [],
    activeNavalBattle: null,
    navalBattleHistory: [],
    navalRevealUntilTurn: {},
    forcedExitStates: [
      { armyId: "army-red", startedOnTurn: 8, originReason: "WAR_ENDED" }
    ],
    strategicCities: [
      {
        id: "city-a",
        name: "Город А",
        cells: [{ x: 0, y: 0 }],
        recognizedStateId: "ru",
        deFactoStateId: "de",
        factionInfluenceId: "red",
        mayorId: null,
        isCapital: true,
        historicalBuildTypeCount: 3
      }
    ],
    territorialScores: [
      { holderStateId: "de", opponentStateId: "ru", points: 9 }
    ],
    rebellions: [
      {
        id: "rebellion-a",
        sourceStateId: "ru",
        startedOnTurn: 7,
        recognizedTerritorySnapshot: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
        capitalCityId: "city-a",
        participantFactionIds: ["red"],
        active: true
      }
    ],
    turnCheckpoint: {
      turnNumber: 8,
      forcedExitDone: true,
      supplyDone: true,
      encirclementDone: true,
      territorialScoreDone: false
    }
  };
}

describe("strategic war persistence regressions", () => {
  it("round-trips authoritative strategic state without deriving it from legacy war history", async () => {
    const port = new MemoryPort();
    const initial = strategicScene();
    port.sceneMetadata[METADATA_KEYS.scene] = structuredClone(initial);
    const repository = new MetadataRepository(port);

    const loaded = await repository.readScene();
    await repository.writeScene(loaded, initial.revision);
    const reloaded = await repository.readScene();

    expect(reloaded.stateRelations).toEqual(initial.stateRelations);
    expect(reloaded.gridMap.cells["0,0"]).toMatchObject({
      recognizedStateId: "ru",
      deFactoStateId: "de"
    });
    expect(reloaded.forcedExitStates).toEqual(initial.forcedExitStates);
    expect(reloaded.strategicCities).toEqual(initial.strategicCities);
    expect(reloaded.territorialScores).toEqual(initial.territorialScores);
    expect(reloaded.rebellions).toEqual(initial.rebellions);
    expect(reloaded.turnCheckpoint).toEqual(initial.turnCheckpoint);

    // Legacy wars remain readable history. Repository normalization may reorder participant ids,
    // but it must not rewrite exact-pair diplomacy.
    expect(reloaded.wars).toHaveLength(1);
    expect(reloaded.wars[0]).toMatchObject({
      id: "legacy-history",
      name: "Историческая запись",
      active: false
    });
    expect(new Set(reloaded.wars[0]?.participantFactionIds)).toEqual(new Set(["red", "blue"]));
    expect(new Set(reloaded.wars[0]?.participantStateIds)).toEqual(new Set(["ru", "de"]));
    expect(reloaded.stateRelations?.ru?.de).toEqual({ militaryAccess: false, atWar: true });
    expect(reloaded.stateRelations?.de?.ru).toEqual({ militaryAccess: true, atWar: true });
  });
});