import { StrategicGridAdapter, cellKey } from "../../grid/strategicGrid";
import {
  reconcileLocalOverlays,
  type DesiredLocalOverlay,
  type LocalOverlayBatchPort
} from "../../owlbear/localOverlayReconciler";
import { METADATA_KEYS } from "../../shared/constants";
import type {
  GridCellCoord,
  NavalSceneState,
  SceneItemRecord,
  Vector2
} from "../../shared/types";
import { hasNavalBattleLineOfSight } from "../battle/navalBattleLineOfSight";
import { isCruiserInterceptionZoneCell } from "./cruiserInterception";

export type InterceptionOverlayPort = LocalOverlayBatchPort;

export interface InterceptionOverlayViewer {
  isGM: boolean;
  leaderSideIds: readonly string[];
}

export interface InterceptionOverlaySource {
  dpi: number;
  scene: NavalSceneState;
  shipPositions: Readonly<Record<string, Vector2>>;
}

function interceptionOverlayKey(item: SceneItemRecord): string | undefined {
  const raw = item.metadata[METADATA_KEYS.interceptionOverlay];
  if (typeof raw !== "object" || raw === null) return undefined;
  const key = (raw as Record<string, unknown>).key;
  return typeof key === "string" ? key : undefined;
}

function canViewInterception(sideId: string, viewer: InterceptionOverlayViewer): boolean {
  return viewer.isGM || viewer.leaderSideIds.includes(sideId);
}

function squarePoints(center: Vector2, dpi: number): Vector2[] {
  const inset = Math.max(2, dpi * 0.05);
  const half = Math.max(0, dpi / 2 - inset);
  return [
    { x: center.x - half, y: center.y - half },
    { x: center.x + half, y: center.y - half },
    { x: center.x + half, y: center.y + half },
    { x: center.x - half, y: center.y + half },
    { x: center.x - half, y: center.y - half }
  ];
}

function currentOccupiedShipCells(
  source: InterceptionOverlaySource,
  grid: StrategicGridAdapter
): GridCellCoord[] {
  const battle = source.scene.activeNavalBattle;
  if (!battle) return [];

  return battle.participantShipIds.flatMap((shipId) => {
    if (battle.exitedShipIds.includes(shipId)) return [];
    const ship = source.scene.ships[shipId];
    const position = source.shipPositions[shipId];
    if (!ship || ship.hp <= 0 || !position) return [];
    return [grid.sceneToCell(position)];
  });
}

export class InterceptionOverlayService {
  constructor(private readonly port: InterceptionOverlayPort) {}

  async reconcile(
    source: InterceptionOverlaySource | undefined,
    viewer: InterceptionOverlayViewer
  ): Promise<void> {
    const battle = source?.scene.activeNavalBattle;
    if (!source || !battle || battle.status !== "ACTIVE") {
      await reconcileLocalOverlays(this.port, interceptionOverlayKey, []);
      return;
    }

    const grid = new StrategicGridAdapter({ dpi: source.dpi, offset: { x: 0, y: 0 } });
    const occupiedShipCells = currentOccupiedShipCells(source, grid);
    const sidesById = new Map(source.scene.sides.map((side) => [side.id, side]));
    const overlays: DesiredLocalOverlay[] = [];

    for (const interception of Object.values(battle.interceptions ?? {})) {
      const cruiserId = interception.cruiserShipId;
      const cruiser = source.scene.ships[cruiserId];
      const cruiserPosition = source.shipPositions[cruiserId];
      if (!cruiser || !cruiserPosition) continue;
      if (cruiser.classId !== "CRUISER" || cruiser.hp <= 0) continue;
      if (cruiser.status !== "IN_NAVAL_BATTLE" || cruiser.battleId !== battle.id) continue;
      if (battle.exitedShipIds.includes(cruiserId)) continue;
      if (!canViewInterception(cruiser.sideId, viewer)) continue;

      const cruiserCell = grid.sceneToCell(cruiserPosition);
      const strokeColor = sidesById.get(cruiser.sideId)?.color ?? "#ffb300";

      for (const candidateCell of battle.areaCells) {
        const inside = isCruiserInterceptionZoneCell({
          cruiser,
          cruiserCell,
          candidateCell,
          hasLineOfSight: (from, to) => hasNavalBattleLineOfSight({
            scene: source.scene,
            from,
            to,
            occupiedShipCells
          })
        });
        if (!inside) continue;

        const candidateKey = cellKey(candidateCell);
        const key = `${battle.id}/${cruiserId}/${candidateKey}`;
        const center = grid.cellToSceneCenter(candidateCell);
        overlays.push({
          key,
          item: {
            type: "CURVE",
            position: { x: 0, y: 0 },
            visible: true,
            disableHit: true,
            points: squarePoints(center, source.dpi),
            strokeColor,
            strokeWidth: Math.max(2, source.dpi * 0.04),
            metadata: {
              [METADATA_KEYS.interceptionOverlay]: {
                key,
                battleId: battle.id,
                cruiserShipId: cruiserId,
                cellKey: candidateKey
              }
            }
          }
        });
      }
    }

    overlays.sort((left, right) => left.key.localeCompare(right.key));
    await reconcileLocalOverlays(this.port, interceptionOverlayKey, overlays);
  }
}
