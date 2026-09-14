import { resolveCityDeFactoState } from "../cities/strategicCities";
import type { SceneState, StrategicCity, TerritorialScore } from "../shared/types";
import { areStatesAtWar } from "../states/stateRelations";

export interface TerritorialCityContribution {
  cityId: string;
  cityName: string;
  holderStateId: string;
  opponentStateId: string;
  income: number;
}

export function cityIncome(city: StrategicCity): number {
  return 1 + city.historicalBuildTypeCount;
}

export function territorialCityContributions(scene: SceneState): TerritorialCityContribution[] {
  return (scene.strategicCities ?? [])
    .flatMap((city): TerritorialCityContribution[] => {
      const holderStateId = resolveCityDeFactoState(city, scene.gridMap);
      if (!holderStateId || holderStateId === city.recognizedStateId) return [];
      if (!areStatesAtWar(scene.stateRelations ?? {}, holderStateId, city.recognizedStateId)) return [];
      return [{
        cityId: city.id,
        cityName: city.name,
        holderStateId,
        opponentStateId: city.recognizedStateId,
        income: cityIncome(city)
      }];
    })
    .sort((left, right) =>
      left.holderStateId.localeCompare(right.holderStateId) ||
      left.opponentStateId.localeCompare(right.opponentStateId) ||
      left.cityId.localeCompare(right.cityId)
    );
}

function scoreKey(holderStateId: string, opponentStateId: string): string {
  return `${holderStateId}\u0000${opponentStateId}`;
}

export function applyTerritorialScoreCheckpoint(scene: SceneState, turnNumber: number): SceneState {
  if (!Number.isInteger(turnNumber) || turnNumber < 1) {
    throw new Error("INVALID_TURN_NUMBER");
  }

  const checkpoint = scene.turnCheckpoint;
  if (
    !checkpoint ||
    checkpoint.turnNumber !== turnNumber ||
    !checkpoint.encirclementDone ||
    checkpoint.territorialScoreDone
  ) {
    return scene;
  }

  const next = structuredClone(scene);
  const scores = new Map<string, TerritorialScore>();
  for (const score of next.territorialScores ?? []) {
    scores.set(scoreKey(score.holderStateId, score.opponentStateId), { ...score });
  }

  for (const contribution of territorialCityContributions(next)) {
    const key = scoreKey(contribution.holderStateId, contribution.opponentStateId);
    const current = scores.get(key);
    scores.set(key, {
      holderStateId: contribution.holderStateId,
      opponentStateId: contribution.opponentStateId,
      points: (current?.points ?? 0) + contribution.income
    });
  }

  next.territorialScores = [...scores.values()].sort((left, right) =>
    left.holderStateId.localeCompare(right.holderStateId) ||
    left.opponentStateId.localeCompare(right.opponentStateId)
  );
  next.turnCheckpoint = {
    ...checkpoint,
    territorialScoreDone: true
  };
  return next;
}
