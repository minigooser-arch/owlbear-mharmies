import { StrategicGridAdapter, cellKey } from "../grid/strategicGrid";
import { reconcileLocalOverlays, type LocalOverlayBatchPort } from "../owlbear/localOverlayReconciler";
import type { NavalBattleAreaToolPort } from "../owlbear/navalBattleAreaTool";
import {
  METADATA_KEYS,
  NAVAL_BATTLE_AREA_DRAFT_CHANNEL
} from "../shared/constants";
import type { GridCellCoord, SceneItemRecord } from "../shared/types";

export interface NavalBattleAreaIdentity {
  id: string;
  role: "GM" | "PLAYER";
  connectionId: string;
}

export interface NavalBattleAreaServicePort extends LocalOverlayBatchPort {
  getPlayerIdentity(): Promise<NavalBattleAreaIdentity>;
  getGridDpi(): Promise<number>;
  send(channel: string, data: unknown): Promise<void>;
  show(message: string, variant: "INFO" | "WARNING" | "ERROR"): Promise<void>;
}

function previewKey(item: SceneItemRecord): string | undefined {
  const raw = item.metadata[METADATA_KEYS.navalBattleAreaPreview];
  if (typeof raw !== "object" || raw === null) return undefined;
  const key = (raw as Record<string, unknown>).cellKey;
  return typeof key === "string" ? key : undefined;
}

export class NavalBattleAreaToolService implements NavalBattleAreaToolPort {
  constructor(private readonly port: NavalBattleAreaServicePort) {}

  async getRole(): Promise<"GM" | "PLAYER"> {
    return (await this.port.getPlayerIdentity()).role;
  }

  getGridDpi(): Promise<number> {
    return this.port.getGridDpi();
  }

  async publishDraft(requestId: string, cells: readonly GridCellCoord[]): Promise<void> {
    const identity = await this.port.getPlayerIdentity();
    if (identity.role !== "GM") return;
    await this.port.send(NAVAL_BATTLE_AREA_DRAFT_CHANNEL, {
      playerId: identity.id,
      requestId,
      cells: cells.map((cell) => ({ ...cell }))
    });
  }

  async renderPreview(cells: readonly GridCellCoord[]): Promise<void> {
    const dpi = await this.port.getGridDpi();
    const grid = new StrategicGridAdapter({ dpi, offset: { x: 0, y: 0 } });
    const half = dpi / 2;
    await reconcileLocalOverlays(
      this.port,
      previewKey,
      cells.map((cell) => {
        const center = grid.cellToSceneCenter(cell);
        const key = cellKey(cell);
        return {
          key,
          item: {
            type: "CURVE",
            position: { x: 0, y: 0 },
            visible: true,
            disableHit: true,
            points: [
              { x: center.x - half, y: center.y - half },
              { x: center.x + half, y: center.y - half },
              { x: center.x + half, y: center.y + half },
              { x: center.x - half, y: center.y + half },
              { x: center.x - half, y: center.y - half }
            ],
            strokeColor: "#26c6da",
            metadata: {
              [METADATA_KEYS.navalBattleAreaPreview]: { cellKey: key }
            }
          }
        };
      })
    );
  }

  async clearPreview(): Promise<void> {
    await reconcileLocalOverlays(this.port, previewKey, []);
  }

  notify(message: string, variant: "INFO" | "WARNING" | "ERROR"): Promise<void> {
    return this.port.show(message, variant);
  }
}
