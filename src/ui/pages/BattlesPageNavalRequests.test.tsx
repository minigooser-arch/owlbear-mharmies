// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  ship("blue-ship", "Баян", "blue", "Синие"),
  ship("red-escort", "Новик", "red", "Красные")
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

  it("lets the GM select a tactical area, add participants, and launch the request", () => {
    const onAction = vi.fn();
    const { rerender } = render(
      <BattlesPage
        battles={[]}
        ships={ships}
        pendingNavalBattleRequests={requests}
        isGM
        onAction={onAction}
      />
    );

    const startButton = screen.getByRole("button", { name: "Начать морской бой" });
    expect(startButton).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Выбрать область боя" }));
    expect(onAction).toHaveBeenLastCalledWith({
      type: "OPEN_NAVAL_BATTLE_AREA",
      requestId: "request-1"
    });

    rerender(
      <BattlesPage
        battles={[]}
        ships={ships}
        pendingNavalBattleRequests={requests}
        navalBattleAreaDraft={{ requestId: "request-1", cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }}
        isGM
        onAction={onAction}
      />
    );

    expect(screen.getByText("Область: 2 клетки")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Добавить в бой: Новик — Красные" }));
    const enabledStart = screen.getByRole("button", { name: "Начать морской бой" });
    expect(enabledStart).toBeEnabled();
    fireEvent.click(enabledStart);

    expect(onAction).toHaveBeenLastCalledWith({
      type: "START_NAVAL_BATTLE_FROM_REQUEST",
      requestId: "request-1",
      initiatingShipId: "red-ship",
      targetShipId: "blue-ship",
      participantShipIds: ["red-ship", "blue-ship", "red-escort"],
      areaCells: [{ x: 0, y: 0 }, { x: 1, y: 0 }]
    });
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
