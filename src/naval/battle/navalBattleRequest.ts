import type { NavalBattleRequest, NavalSceneState } from "../../shared/types";

export type NavalBattleRequestFailure =
  | "INITIATING_SHIP_NOT_FOUND"
  | "TARGET_SHIP_NOT_FOUND"
  | "INITIATING_SHIP_DESTROYED"
  | "TARGET_SHIP_DESTROYED"
  | "TARGET_NOT_DETECTED";

export interface NavalBattleRequestValidationInput {
  scene: Pick<NavalSceneState, "ships" | "turn">;
  request: NavalBattleRequest;
  detectedTargetShipIds: ReadonlySet<string>;
}

export type NavalBattleRequestValidation =
  | { ok: true }
  | { ok: false; reason: NavalBattleRequestFailure };

export function validateNavalBattleRequest(
  input: NavalBattleRequestValidationInput
): NavalBattleRequestValidation {
  const initiating = input.scene.ships[input.request.initiatingShipId];
  if (!initiating) return { ok: false, reason: "INITIATING_SHIP_NOT_FOUND" };

  const target = input.scene.ships[input.request.targetShipId];
  if (!target) return { ok: false, reason: "TARGET_SHIP_NOT_FOUND" };

  if (initiating.hp <= 0) return { ok: false, reason: "INITIATING_SHIP_DESTROYED" };
  if (target.hp <= 0) return { ok: false, reason: "TARGET_SHIP_DESTROYED" };
  if (!input.detectedTargetShipIds.has(input.request.targetShipId)) {
    return { ok: false, reason: "TARGET_NOT_DETECTED" };
  }

  return { ok: true };
}

export type CreateNavalBattleRequestResult =
  | { ok: true; request: NavalBattleRequest }
  | { ok: false; reason: NavalBattleRequestFailure };

export function createNavalBattleRequest(input: {
  scene: Pick<NavalSceneState, "ships" | "turn">;
  requestId: string;
  initiatingShipId: string;
  targetShipId: string;
  detectedTargetShipIds: ReadonlySet<string>;
}): CreateNavalBattleRequestResult {
  const request: NavalBattleRequest = {
    id: input.requestId,
    initiatingShipId: input.initiatingShipId,
    targetShipId: input.targetShipId,
    createdOnTurn: input.scene.turn.turnNumber
  };

  const validation = validateNavalBattleRequest({
    scene: input.scene,
    request,
    detectedTargetShipIds: input.detectedTargetShipIds
  });

  return validation.ok ? { ok: true, request } : validation;
}
