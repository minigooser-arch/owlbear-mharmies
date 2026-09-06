import type { ArmyCommandPayload, GridCellCoord } from "../shared/types";

export interface NavalBattleAreaDraft {
  requestId: string;
  cells: GridCellCoord[];
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function gridCell(value: unknown): GridCellCoord | undefined {
  const candidate = record(value);
  if (!candidate) return undefined;
  const { x, y } = candidate;
  return typeof x === "number" && Number.isInteger(x) &&
    typeof y === "number" && Number.isInteger(y)
    ? { x, y }
    : undefined;
}

export function parseNavalBattleAreaDraft(
  value: unknown,
  currentPlayerId: string
): NavalBattleAreaDraft | undefined {
  const candidate = record(value);
  if (!candidate || candidate.playerId !== currentPlayerId) return undefined;
  if (typeof candidate.requestId !== "string" || candidate.requestId.trim().length === 0) return undefined;
  if (!Array.isArray(candidate.cells)) return undefined;
  const cells: GridCellCoord[] = [];
  for (const valueCell of candidate.cells) {
    const cell = gridCell(valueCell);
    if (!cell) return undefined;
    cells.push(cell);
  }
  return { requestId: candidate.requestId, cells };
}

export function buildRequestBackedNavalBattleStart(input: {
  battleId: string;
  requestId: string;
  initiatingShipId: string;
  targetShipId: string;
  participantShipIds: readonly string[];
  areaCells: readonly GridCellCoord[];
}): Extract<ArmyCommandPayload, { type: "START_NAVAL_BATTLE" }> {
  const participantShipIds = [...new Set([
    input.initiatingShipId,
    input.targetShipId,
    ...input.participantShipIds
  ])];
  return {
    type: "START_NAVAL_BATTLE",
    battleId: input.battleId,
    navalRequestId: input.requestId,
    initiatingShipId: input.initiatingShipId,
    participantShipIds,
    areaCells: input.areaCells.map((cell) => ({ ...cell }))
  };
}
