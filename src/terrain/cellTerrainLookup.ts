import { cellKey } from "../grid/strategicGrid";
import type { GridCellCoord, SceneState } from "../shared/types";

export interface CellTerrainInfo {
  terrainId: string | null;
  terrainName: string;
}

const UNKNOWN_TERRAIN: CellTerrainInfo = {
  terrainId: null,
  terrainName: "неизвестна"
};

export class CachedCellTerrainLookup {
  private scene: SceneState | undefined;
  private inFlight: Promise<SceneState> | undefined;
  private generation = 0;

  constructor(private readonly loadScene: () => Promise<SceneState>) {}

  async describeCell(cell: GridCellCoord): Promise<CellTerrainInfo> {
    try {
      const scene = await this.getScene();
      const terrainId = scene.gridMap.cells[cellKey(cell)]?.terrainId
        ?? scene.terrain.defaultTerrainId;
      const terrain = scene.terrain.types[terrainId];
      if (!terrain) return { ...UNKNOWN_TERRAIN };
      return { terrainId: terrain.id, terrainName: terrain.name };
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
      if (this.generation === generation) this.scene = scene;
      return scene;
    }).finally(() => {
      if (this.inFlight === request) this.inFlight = undefined;
    });
    this.inFlight = request;
    return request;
  }
}
