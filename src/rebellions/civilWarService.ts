import { cellKey } from "../grid/strategicGrid";
import type { SceneState } from "../shared/types";
import { createState } from "../states/stateService";
import { setPairWar } from "../states/stateRelations";
import { applyCellPatchBatch } from "../terrain/gridMap";

export interface StartCivilWarInput {
  sourceStateId: string;
  rebelFactionId: string;
  newStateId: string;
  newStateName: string;
  newStateColor: string;
}

export type CivilWarFailure =
  | "STATE_NOT_FOUND"
  | "SIDE_NOT_FOUND"
  | "STATE_EXISTS"
  | "REBEL_FACTION_OUTSIDE_STATE"
  | "RULING_FACTION_MOVE_FORBIDDEN"
  | "INVALID_NEW_STATE"
  | "CITY_TERRITORY_INCONSISTENT";

export type CivilWarResult =
  | { ok: true; scene: SceneState }
  | { ok: false; reason: CivilWarFailure };

export function startCivilWar(scene: SceneState, input: StartCivilWarInput): CivilWarResult {
  const sourceState = scene.states.find((state) => state.id === input.sourceStateId);
  if (!sourceState) return { ok: false, reason: "STATE_NOT_FOUND" };
  if (scene.states.some((state) => state.id === input.newStateId)) {
    return { ok: false, reason: "STATE_EXISTS" };
  }

  const rebelFaction = scene.sides.find((side) => side.id === input.rebelFactionId);
  if (!rebelFaction) return { ok: false, reason: "SIDE_NOT_FOUND" };
  if (rebelFaction.stateId !== input.sourceStateId) {
    return { ok: false, reason: "REBEL_FACTION_OUTSIDE_STATE" };
  }
  if (sourceState.active && sourceState.rulingFactionId === input.rebelFactionId) {
    return { ok: false, reason: "RULING_FACTION_MOVE_FORBIDDEN" };
  }
  if (
    input.newStateId.trim().length === 0 ||
    input.newStateName.trim().length === 0 ||
    input.newStateColor.trim().length === 0
  ) {
    return { ok: false, reason: "INVALID_NEW_STATE" };
  }

  const transferCities = (scene.strategicCities ?? []).filter(
    (city) =>
      city.recognizedStateId === input.sourceStateId &&
      city.factionInfluenceId === input.rebelFactionId
  );
  const transferCellKeys = new Set<string>();

  for (const city of transferCities) {
    for (const cell of city.cells) {
      const key = cellKey(cell);
      const stored = scene.gridMap.cells[key];
      if (!stored || stored.recognizedStateId !== input.sourceStateId) {
        return { ok: false, reason: "CITY_TERRITORY_INCONSISTENT" };
      }
      transferCellKeys.add(key);
    }
  }

  const movedSides = scene.sides.map((side) =>
    side.id === input.rebelFactionId
      ? {
          ...side,
          playerIds: [...side.playerIds],
          leaderPlayerIds: [...side.leaderPlayerIds],
          stateId: input.newStateId
        }
      : {
          ...side,
          playerIds: [...side.playerIds],
          leaderPlayerIds: [...side.leaderPlayerIds]
        }
  );

  const created = createState(scene.states, movedSides, {
    id: input.newStateId,
    name: input.newStateName.trim(),
    color: input.newStateColor.trim(),
    rulingFactionId: input.rebelFactionId,
    active: true
  });
  if (!created.ok) {
    if (created.reason === "STATE_EXISTS") return { ok: false, reason: "STATE_EXISTS" };
    return { ok: false, reason: "INVALID_NEW_STATE" };
  }

  const next = structuredClone(scene);
  next.states = created.states;
  next.sides = created.sides;
  next.gridMap = applyCellPatchBatch(
    next.gridMap,
    transferCities.flatMap((city) =>
      city.cells.map((cell) => ({
        cell,
        patch: { recognizedStateId: input.newStateId }
      }))
    )
  );
  next.strategicCities = (next.strategicCities ?? []).map((city) =>
    transferCellKeys.size > 0 &&
    city.recognizedStateId === input.sourceStateId &&
    city.factionInfluenceId === input.rebelFactionId &&
    city.cells.every((cell) => transferCellKeys.has(cellKey(cell)))
      ? { ...city, recognizedStateId: input.newStateId }
      : city
  );
  next.stateRelations = setPairWar(
    next.stateRelations ?? {},
    input.sourceStateId,
    input.newStateId,
    true
  );

  return { ok: true, scene: next };
}
