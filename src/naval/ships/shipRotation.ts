import type { ShipFacing } from "../../shared/types";

const FACING_ROTATION: Readonly<Record<ShipFacing, number>> = {
  NORTH: 0,
  EAST: 90,
  SOUTH: 180,
  WEST: 270
};

export function rotationForFacing(facing: ShipFacing): number {
  return FACING_ROTATION[facing];
}

export function facingForRotation(rotation: number): ShipFacing {
  const normalized = ((rotation % 360) + 360) % 360;
  const snapped = Math.round(normalized / 90) * 90 % 360;
  if (snapped === 90) return "EAST";
  if (snapped === 180) return "SOUTH";
  if (snapped === 270) return "WEST";
  return "NORTH";
}
