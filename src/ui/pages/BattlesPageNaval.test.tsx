// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ShipView } from "../state/useExtensionState";
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
