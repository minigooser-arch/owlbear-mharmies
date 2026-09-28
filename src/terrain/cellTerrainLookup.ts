import { cellKey } from "../grid/strategicGrid";
import type { GridCellCoord, SceneState } from "../shared/types";

export interface CellTerrainInfo {
  terrainId: string | null;
  terrainName: string;
  movementCostUnits: number | null;
  recognizedStateName: string;
}

const UNKNOWN_TERRAIN: CellTerrainInfo = {
  terrainId: null,
  terrainName: "неизвестна",
  movementCostUnits: null,
  recognizedStateName: "нет"
};

export class CachedCellTerrainLookup {
  private scene: SceneState | undefined;
  private inFlight: Promise<SceneState> | undefined;
  private generation = 0;

  constructor(private readonly loadScene: () => Promise<SceneState>) {}

  async describeCell(cell: GridCellCoord): Promise<CellTerrainInfo> {
    try {
      const scene = await this.getScene();
      const cellState = scene.gridMap.cells[cellKey(cell)];
      const terrainId = cellState?.terrainId
        ?? scene.terrain.defaultTerrainId;
      const terrain = scene.terrain.types[terrainId];
      if (!terrain) return { ...UNKNOWN_TERRAIN };
      const recognizedStateId = cellState?.recognizedStateId ?? null;
      const recognizedStateName = recognizedStateId === null
        ? "нет"
        : scene.states.find((state) => state.id === recognizedStateId)?.name ?? "нет";
      return {
        terrainId: terrain.id,
        terrainName: terrain.name,
        movementCostUnits: terrain.movementCostUnits,
        recognizedStateName
      };
    } catch {
      return { ...UNKNOWN_TERRAIN };
    }
  }

  invalidate(): void {
    this.generation += 1;
    this.scene = undefined;
    this.inFlight = undefined;
  }

  private getScene(): Promise<SceneState> {
    if (this.scene) return Promise.resolve(this.scene);
    if (this.inFlight) return this.inFlight;

    const generation = this.generation;
    const request = this.loadScene().then((scene) => {
      if (this.generation !== generation) return this.getScene();
      this.scene = scene;
      return scene;
    }).finally(() => {
      if (this.inFlight === request) this.inFlight = undefined;
    });
    this.inFlight = request;
    return request;
  }
}
