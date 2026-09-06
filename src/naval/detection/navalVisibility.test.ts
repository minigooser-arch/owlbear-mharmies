import { describe, expect, it } from "vitest";
import type { NavalBattleState, ShipState } from "../../shared/types";
import { createRegisteredShip } from "../ships/shipLifecycle";
import type { NavalDetectionGraph } from "./navalDetection";
import { applyBattleRevealUntilNextTurn, visibleShipIdsForPlayer } from "./navalVisibility";

function ship(sideId: string): ShipState {
  return createRegisteredShip(sideId, "CRUISER", "NORTH");
}

function graph(entries: Record<string, string[]> = {}): NavalDetectionGraph {
  return {
    visibleTargetsBySide: new Map(Object.entries(entries).map(([sideId, ids]) => [sideId, new Set(ids)])),
    observersBySide: new Map()
  };
}

function battle(participantShipIds: string[]): Pick<NavalBattleState, "participantShipIds"> {
  return { participantShipIds };
}

describe("naval player visibility", () => {
  const ships = {
    red: ship("red"),
    blue: ship("blue"),
    green: ship("green")
  };

  it("lets GM see every registered ship", () => {
    expect(visibleShipIdsForPlayer({
      isGM: true,
      playerSideIds: [],
      ships,
      detectionGraph: graph(),
      revealUntilTurn: {},
      currentTurn: 4
    })).toEqual(new Set(["red", "blue", "green"]));
  });

  it("lets a side always see its own ships", () => {
    expect(visibleShipIdsForPlayer({
      isGM: false,
      playerSideIds: ["red"],
      ships,
      detectionGraph: graph(),
      revealUntilTurn: {},
      currentTurn: 4
    })).toEqual(new Set(["red"]));
  });

  it("adds enemies detected by any of the player's sides", () => {
    expect(visibleShipIdsForPlayer({
      isGM: false,
      playerSideIds: ["red"],
      ships,
      detectionGraph: graph({ red: ["blue"] }),
      revealUntilTurn: {},
      currentTurn: 4
    })).toEqual(new Set(["red", "blue"]));
  });

  it("keeps a stored battle reveal active only before its exclusive expiry turn", () => {
    const revealUntilTurn = { red: { blue: 5 } };
    expect(visibleShipIdsForPlayer({
      isGM: false,
      playerSideIds: ["red"],
      ships,
      detectionGraph: graph(),
      revealUntilTurn,
      currentTurn: 4
    })).toEqual(new Set(["red", "blue"]));
    expect(visibleShipIdsForPlayer({
      isGM: false,
      playerSideIds: ["red"],
      ships,
      detectionGraph: graph(),
      revealUntilTurn,
      currentTurn: 5
    })).toEqual(new Set(["red"]));
  });
});

describe("naval battle reveal persistence", () => {
  it("reveals every opposing battle participant to each participating side until next turn", () => {
    const ships = {
      "red-a": ship("red"),
      "red-b": ship("red"),
      "blue-a": ship("blue"),
      "blue-b": ship("blue"),
      outsider: ship("green")
    };
    expect(applyBattleRevealUntilNextTurn({
      ships,
      battle: battle(["red-a", "red-b", "blue-a", "blue-b"]),
      revealUntilTurn: {},
      currentTurn: 7
    })).toEqual({
      red: { "blue-a": 8, "blue-b": 8 },
      blue: { "red-a": 8, "red-b": 8 }
    });
  });

  it("preserves a later existing reveal instead of shortening it", () => {
    const ships = { red: ship("red"), blue: ship("blue") };
    expect(applyBattleRevealUntilNextTurn({
      ships,
      battle: battle(["red", "blue"]),
      revealUntilTurn: { red: { blue: 12 } },
      currentTurn: 7
    })).toEqual({
      red: { blue: 12 },
      blue: { red: 8 }
    });
  });
});
