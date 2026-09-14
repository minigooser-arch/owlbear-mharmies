import { cellKey, parseCellKey } from "../grid/strategicGrid";
import type { ArmyState, GridCellCoord, SceneState } from "../shared/types";

export interface StartRebellionInput {
  id: string;
  sourceStateId: string;
  capitalCityId: string;
  participantFactionIds: string[];
}

export interface RebellionRuntimeContext {
  armies: Readonly<Record<string, ArmyState>>;
  armyCells: Readonly<Record<string, GridCellCoord>>;
}

export interface RebellionFactionStrength {
  armyCount: number;
  currentHp: number;
  maxHp: number;
}

const EMPTY_RUNTIME: RebellionRuntimeContext = {
  armies: {},
  armyCells: {}
};

function uniqueParticipantIds(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id) => id.trim().length > 0))];
}

export function startRebellion(scene: SceneState, input: StartRebellionInput): SceneState {
  if ((scene.rebellions ?? []).some((rebellion) => rebellion.id === input.id)) {
    throw new Error("REBELLION_ID_DUPLICATE");
  }
  if (!scene.states.some((state) => state.id === input.sourceStateId)) {
    throw new Error("STATE_NOT_FOUND");
  }

  const capital = (scene.strategicCities ?? []).find((city) => city.id === input.capitalCityId);
  if (!capital) throw new Error("CITY_NOT_FOUND");
  if (!capital.isCapital || capital.recognizedStateId !== input.sourceStateId) {
    throw new Error("INVALID_REBELLION_CAPITAL");
  }

  const participantFactionIds = uniqueParticipantIds(input.participantFactionIds);
  if (participantFactionIds.length === 0) throw new Error("REBELLION_PARTICIPANTS_EMPTY");

  const sidesById = new Map(scene.sides.map((side) => [side.id, side]));
  for (const factionId of participantFactionIds) {
    const side = sidesById.get(factionId);
    if (!side) throw new Error("SIDE_NOT_FOUND");
    if (side.stateId !== input.sourceStateId) throw new Error("REBELLION_FACTION_OUTSIDE_STATE");
  }

  const recognizedTerritorySnapshot = Object.entries(scene.gridMap.cells)
    .filter(([, cell]) => cell.recognizedStateId === input.sourceStateId)
    .map(([key]) => parseCellKey(key))
    .sort((left, right) => left.y - right.y || left.x - right.x);
  if (recognizedTerritorySnapshot.length === 0) throw new Error("REBELLION_TERRITORY_EMPTY");

  const next = structuredClone(scene);
  next.rebellions ??= [];
  next.rebellions.push({
    id: input.id,
    sourceStateId: input.sourceStateId,
    startedOnTurn: scene.turn.turnNumber,
    recognizedTerritorySnapshot,
    capitalCityId: input.capitalCityId,
    participantFactionIds,
    active: true
  });
  return next;
}

export function closeRebellion(scene: SceneState, rebellionId: string): SceneState {
  const rebellions = scene.rebellions ?? [];
  if (!rebellions.some((rebellion) => rebellion.id === rebellionId)) {
    throw new Error("REBELLION_NOT_FOUND");
  }
  const next = structuredClone(scene);
  next.rebellions = (next.rebellions ?? []).map((rebellion) =>
    rebellion.id === rebellionId ? { ...rebellion, active: false } : rebellion
  );
  return next;
}

export function getRebellionCapitalController(
  scene: SceneState,
  rebellionId: string,
  runtime: RebellionRuntimeContext = EMPTY_RUNTIME
): string | null {
  const rebellion = (scene.rebellions ?? []).find((entry) => entry.id === rebellionId);
  if (!rebellion || !rebellion.active) return null;
  const capital = (scene.strategicCities ?? []).find((city) => city.id === rebellion.capitalCityId);
  if (!capital) return null;

  const capitalKeys = new Set(capital.cells.map(cellKey));
  const participantIds = new Set(rebellion.participantFactionIds);
  const controllers = new Set<string>();

  for (const [armyId, army] of Object.entries(runtime.armies)) {
    if (army.health.hp <= 0 || !participantIds.has(army.sideId)) continue;
    const cell = runtime.armyCells[armyId];
    if (!cell || !capitalKeys.has(cellKey(cell))) continue;
    controllers.add(army.sideId);
    if (controllers.size > 1) return null;
  }

  return controllers.size === 1 ? [...controllers][0] ?? null : null;
}

export function getRebellionFactionStrength(
  scene: SceneState,
  rebellionId: string,
  factionId: string,
  runtime: RebellionRuntimeContext = EMPTY_RUNTIME
): RebellionFactionStrength {
  const rebellion = (scene.rebellions ?? []).find((entry) => entry.id === rebellionId);
  if (!rebellion || !rebellion.participantFactionIds.includes(factionId)) {
    return { armyCount: 0, currentHp: 0, maxHp: 0 };
  }

  const snapshotKeys = new Set(rebellion.recognizedTerritorySnapshot.map(cellKey));
  let armyCount = 0;
  let currentHp = 0;
  let maxHp = 0;

  for (const [armyId, army] of Object.entries(runtime.armies)) {
    if (army.sideId !== factionId || army.health.hp <= 0) continue;
    const cell = runtime.armyCells[armyId];
    if (!cell || !snapshotKeys.has(cellKey(cell))) continue;
    armyCount += 1;
    currentHp += army.health.hp;
    maxHp += army.health.maxHp;
  }

  return { armyCount, currentHp, maxHp };
}
