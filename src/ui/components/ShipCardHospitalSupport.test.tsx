// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ShipView } from "../state/useExtensionState";
import { ShipCard } from "./ShipCard";

const hospital: ShipView = {
  id: "hospital",
  name: "Госпиталь",
  sideId: "red",
  sideName: "Красные",
  classId: "HOSPITAL",
  className: "Госпитальное судно",
  status: "IN_NAVAL_BATTLE",
  hp: 20,
  maxHp: 20,
  temporaryHp: 0,
  armor: 0,
  movementMax: 4,
  movementRemaining: 4,
  plannedRouteCellCount: 0,
  facing: "EAST",
  normalDice: 0,
  normalRangeMin: 0,
  normalRangeMax: 0,
  embarkedArmyId: null,
  detectionOverride: null,
  effectiveDetectionRange: 6,
  navalRoundNumber: 2,
  isCurrentNavalTurn: true,
  navalMovementRemaining: 4,
  navalActionUsed: false,
  hospitalSupportTargets: [
    { id: "target", name: "Аврора", sideId: "red", sideName: "Красные" }
  ]
};

afterEach(cleanup);

it("lets the active hospital ship support an eligible target", () => {
  const onAction = vi.fn();
  render(
    <ShipCard ship={hospital} sideColor="#f00" isGM={false} canPlanRoute onAction={onAction} />
  );

  expect(screen.getByRole("option", { name: "Аврора — Красные" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Оказать поддержку (2d6)" }));

  expect(onAction).toHaveBeenCalledWith({
    type: "NAVAL_HOSPITAL_SUPPORT",
    shipId: "hospital",
    targetShipId: "target"
  });
});

it("hides hospital support when the action is unavailable", () => {
  render(
    <ShipCard
      ship={{ ...hospital, isCurrentNavalTurn: false }}
      sideColor="#f00"
      isGM={false}
      canPlanRoute
      onAction={vi.fn()}
    />
  );
  expect(screen.queryByRole("button", { name: "Оказать поддержку (2d6)" })).toBeNull();
});
