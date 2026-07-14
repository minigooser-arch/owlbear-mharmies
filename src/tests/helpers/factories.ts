import type { ArmyState, SceneItemRecord, Vector2 } from "../../shared/types";

export interface RoomArmy {
  id: string;
  sideId: string;
  name: string;
  position: Vector2;
  detectionRangeCells: number;
  collisionRangeCells: number;
  speedCellsPerSecond: number;
  state: ArmyState;
}

export function roomArmy(id: string, sideId: string, name: string, x: number): RoomArmy {
  return {
    id,
    sideId,
    name,
    position: { x, y: 0 },
    detectionRangeCells: 6,
    collisionRangeCells: 0.5,
    speedCellsPerSecond: 1,
    state: {
      version: 1,
      registered: true,
      sideId,
      status: "READY",
      overrides: {},
      route: [],
      currentWaypointIndex: 0,
      segmentProgressCells: 0,
      ignoresMovementBarriers: false,
      ignoresVisionBarriers: false,
      revision: 1,
      directOwnerPlayerId: `${sideId}-player`
    }
  };
}

export function roomArmyImage(army: RoomArmy): SceneItemRecord {
  return {
    id: army.id,
    type: "IMAGE",
    name: army.name,
    position: { ...army.position },
    visible: false,
    metadata: {}
  };
}
