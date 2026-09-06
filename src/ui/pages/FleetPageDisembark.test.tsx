// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Side } from "../../shared/types";
import type { ArmyView, ShipView } from "../state/useExtensionState";
import { FleetPage } from "./FleetPage";

const sides: Side[] = [
  { id: "red", name: "Красные", color: "#f00", playerIds: ["leader"], leaderPlayerIds: ["leader"], stateId: null }
];

const army: ArmyView = {
  id: "army",
  name: "1-я армия",
  sideId: "red",
  sideName: "Красные",
  status: "READY",
  route: [],
  movementMaxUnits: 10,
  movementRemainingUnits: 10,
  routeCostUnits: 0,
  routeCellCount: 0,
  routeRequiresReplan: false,
  atWar: false,
  healthHp: 50,
  healthMaxHp: 50,
  supplied: true,
  supplyCheckedOnTurn: 4,
  disbandPending: false,
  embarkedOnShipId: "transport"
};

const transport: ShipView = {
  id: "transport",
  name: "Транспорт №1",
  sideId: "red",
  sideName: "Красные",
  classId: "TRANSPORT",
  className: "Транспорт",
  status: "READY",
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
  embarkedArmyId: "army",
  detectionOverride: null,
  effectiveDetectionRange: 6
};

afterEach(cleanup);

it("opens the landing-cell tool for a controlled transport carrying an army", () => {
  const onAction = vi.fn();
  render(
    <FleetPage
      ships={[transport]}
      armies={[army]}
      sides={sides}
      role="PLAYER"
      leaderSideIds={new Set(["red"])}
      onAction={onAction}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: "Выбрать место высадки" }));
  expect(onAction).toHaveBeenCalledWith({
    type: "OPEN_TRANSPORT_LANDING",
    shipId: "transport",
    armyId: "army"
  });
});

it("does not expose landing controls to an ordinary member", () => {
  render(
    <FleetPage
      ships={[transport]}
      armies={[army]}
      sides={sides}
      role="PLAYER"
      leaderSideIds={new Set()}
      onAction={vi.fn()}
    />
  );

  expect(screen.queryByRole("button", { name: "Выбрать место высадки" })).toBeNull();
});
