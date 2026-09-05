// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NavalBattleRequestView, ShipView } from "../state/useExtensionState";
import { BattlesPage } from "./BattlesPage";

function ship(id: string, name: string, sideId: string, sideName: string): ShipView {
  return {
    id,
    name,
    sideId,
    sideName,
    classId: "CRUISER",
    className: "Крейсер",
    status: "READY",
    hp: 20,
    maxHp: 20,
    temporaryHp: 0,
    armor: 1,
    movementMax: 5,
    movementRemaining: 5,
    plannedRouteCellCount: 0,
    facing: "EAST",
    normalDice: 2,
    normalRangeMin: 1,
    normalRangeMax: 3,
    embarkedArmyId: null,
    detectionOverride: null,
    effectiveDetectionRange: 6
  };
}

const ships = [
  ship("red-ship", "Аврора", "red", "Красные"),
  ship("blue-ship", "Баян", "blue", "Синие")
];

const requests: NavalBattleRequestView[] = [{
  id: "request-1",
  initiatingShipId: "red-ship",
  targetShipId: "blue-ship",
  createdOnTurn: 7
}];

afterEach(cleanup);

describe("GM naval battle request queue", () => {
  it("shows pending requests to the GM with ship and faction names", () => {
    render(
      <BattlesPage
        battles={[]}
        ships={ships}
        pendingNavalBattleRequests={requests}
        isGM
        onAction={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "Заявки на морской бой" })).toBeInTheDocument();
    expect(screen.getByText("Аврора")).toBeInTheDocument();
    expect(screen.getByText("Красные")).toBeInTheDocument();
    expect(screen.getByText("Баян")).toBeInTheDocument();
    expect(screen.getByText("Синие")).toBeInTheDocument();
    expect(screen.getByText("Ход 7")).toBeInTheDocument();
    expect(screen.queryByText("Активных боёв нет.")).not.toBeInTheDocument();
  });

  it("does not expose the GM request queue to players", () => {
    render(
      <BattlesPage
        battles={[]}
        ships={ships}
        pendingNavalBattleRequests={requests}
        isGM={false}
        onAction={vi.fn()}
      />
    );

    expect(screen.queryByRole("heading", { name: "Заявки на морской бой" })).not.toBeInTheDocument();
    expect(screen.getByText("Активных боёв нет.")).toBeInTheDocument();
  });
});
