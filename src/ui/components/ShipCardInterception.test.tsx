// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ShipView } from "../state/useExtensionState";
import { ShipCard } from "./ShipCard";

const cruiser: ShipView = {
  id: "cruiser",
  name: "Варяг",
  sideId: "red",
  sideName: "Красные",
  classId: "CRUISER",
  className: "Крейсер",
  status: "IN_NAVAL_BATTLE",
  hp: 25,
  maxHp: 25,
  temporaryHp: 0,
  armor: 1,
  movementMax: 3,
  movementRemaining: 3,
  plannedRouteCellCount: 0,
  facing: "NORTH",
  normalDice: 2,
  normalRangeMin: 1,
  normalRangeMax: 2,
  embarkedArmyId: null,
  detectionOverride: null,
  effectiveDetectionRange: 6,
  navalRoundNumber: 2,
  isCurrentNavalTurn: true,
  navalMovementRemaining: 2,
  navalActionUsed: false
};

afterEach(cleanup);

it("lets the active cruiser spend its action on interception", () => {
  const onAction = vi.fn();
  render(
    <ShipCard ship={cruiser} sideColor="#f00" isGM={false} canPlanRoute onAction={onAction} />
  );

  fireEvent.click(screen.getByRole("button", { name: "Перехват" }));
  expect(onAction).toHaveBeenCalledWith({
    type: "NAVAL_ACTIVATE_INTERCEPTION",
    shipId: "cruiser"
  });
});

it("does not expose interception outside an available active cruiser action", () => {
  const { rerender } = render(
    <ShipCard
      ship={{ ...cruiser, isCurrentNavalTurn: false }}
      sideColor="#f00"
      isGM={false}
      canPlanRoute
      onAction={vi.fn()}
    />
  );
  expect(screen.queryByRole("button", { name: "Перехват" })).toBeNull();

  rerender(
    <ShipCard
      ship={{ ...cruiser, navalActionUsed: true }}
      sideColor="#f00"
      isGM={false}
      canPlanRoute
      onAction={vi.fn()}
    />
  );
  expect(screen.getByRole("button", { name: "Перехват" })).toBeDisabled();
});
