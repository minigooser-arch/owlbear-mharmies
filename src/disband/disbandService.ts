import type { ArmyState } from "../shared/types";

export function requestArmyDisband(
  army: ArmyState,
  currentTurn: number,
  playerId: string
): ArmyState | undefined {
  if (army.disband.pending) return undefined;
  return {
    ...army,
    disband: {
      pending: true,
      requestedOnTurn: currentTurn,
      requestedByPlayerId: playerId
    },
    revision: army.revision + 1
  };
}
