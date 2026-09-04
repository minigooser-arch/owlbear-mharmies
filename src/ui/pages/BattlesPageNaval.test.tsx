// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { NavalBattleView, ShipView } from "../state/useExtensionState";
import { BattlesPage } from "./BattlesPage";

const ship = (id: string, name: string, isCurrentNavalTurn: boolean): ShipView => ({
  id,
  name,
  sideId: id,
  sideName: id,
  classId: "CRUISER",
  className: "Крейсер",
  status: "IN_NAVAL_BATTLE",
  hp: 25,
  maxHp: 25,
  temporaryHp: 0,
  armor: 1,
  movementMax: 3,
  movementRemaining: 2,
  plannedRouteCellCount: 0,
  facing: "EAST",
  normalDice: 2,
  normalRangeMin: 1,
  normalRangeMax: 2,
  embarkedArmyId: null,
  detectionOverride: null,
  effectiveDetectionRange: 5,
  navalRoundNumber: 3,
  isCurrentNavalTurn,
  navalMovementRemaining: 2,
  navalActionUsed: false
});

afterEach(cleanup);

it("shows a GM the active naval battle and sends manual completion", () => {
  const onAction = vi.fn();
  const props = {
    battles: [],
    ships: [ship("red", "Аврора", true), ship("blue", "Варяг", false)],
    isGM: true,
    onAction
  } as Parameters<typeof BattlesPage>[0] & { ships: ShipView[] };

  render(<BattlesPage {...props} />);

  expect(screen.getByRole("heading", { name: "Морской бой" })).toBeInTheDocument();
  expect(screen.getByText("Раунд: 3")).toBeInTheDocument();
  expect(screen.getByText("Кораблей: 2")).toBeInTheDocument();
  expect(screen.getByText("Ход: Аврора")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Завершить морской бой" }));
  expect(onAction).toHaveBeenCalledWith({ type: "COMPLETE_NAVAL_BATTLE" });
});

it("shows persistent initiative order and round status to the GM", () => {
  const red = ship("red", "Аврора", false);
  red.navalExited = true;
  const blue = ship("blue", "Варяг", true);
  const battle = {
    id: "naval-1",
    roundNumber: 3,
    participantCount: 2,
    currentShipId: "blue",
    initiative: [
      { shipId: "red", total: 20 },
      { shipId: "blue", total: 14 }
    ],
    completedShipIdsThisRound: ["red"],
    exitedShipIds: ["red"]
  } as NavalBattleView;

  render(
    <BattlesPage
      battles={[]}
      ships={[red, blue]}
      activeNavalBattle={battle}
      isGM
      onAction={vi.fn()}
    />
  );

  const initiative = screen.getByRole("list", { name: "Порядок инициативы" });
  expect(initiative).toHaveTextContent("1. Аврора");
  expect(initiative).toHaveTextContent("20");
  expect(initiative).toHaveTextContent("Вышел");
  expect(initiative).toHaveTextContent("2. Варяг");
  expect(initiative).toHaveTextContent("14");
  expect(initiative).toHaveTextContent("Ход");
});

it("does not expose the global naval completion control to a player", () => {
  const props = {
    battles: [],
    ships: [ship("red", "Аврора", true)],
    isGM: false,
    onAction: vi.fn()
  } as Parameters<typeof BattlesPage>[0] & { ships: ShipView[] };

  render(<BattlesPage {...props} />);
  expect(screen.queryByRole("button", { name: "Завершить морской бой" })).not.toBeInTheDocument();
});
