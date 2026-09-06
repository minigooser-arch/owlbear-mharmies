// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Side } from "../../shared/types";
import type { ArmyView, ShipView, TransportEmbarkTargetView } from "../state/useExtensionState";
import { FleetPage } from "./FleetPage";

const sides: Side[] = [
  { id: "red", name: "Красные", color: "#f00", playerIds: ["leader"], leaderPlayerIds: ["leader"], stateId: null },
  { id: "blue", name: "Синие", color: "#00f", playerIds: ["blue"], leaderPlayerIds: ["blue"], stateId: null }
];

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
  embarkedArmyId: null,
  detectionOverride: null,
  effectiveDetectionRange: 6
};

const ownArmy: ArmyView = {
  id: "red-army",
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
  embarkedOnShipId: null
};

const foreignTarget: TransportEmbarkTargetView = {
  id: "blue-army",
  name: "Синяя армия",
  sideId: "blue",
  sideName: "Синие"
};

afterEach(cleanup);

it("lets a transport leader initiate embarkation for own or visible foreign armies", () => {
  const onAction = vi.fn();
  render(
    <FleetPage
      ships={[transport]}
      armies={[ownArmy]}
      sides={sides}
      role="PLAYER"
      leaderSideIds={new Set(["red"])}
      transportEmbarkTargets={[foreignTarget]}
      onAction={onAction}
    />
  );

  const armySelect = screen.getByRole("combobox", { name: "Армия для погрузки" });
  expect(within(armySelect).getByRole("option", { name: "1-я армия — Красные" })).toBeInTheDocument();
  expect(within(armySelect).getByRole("option", { name: "Синяя армия — Синие" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Погрузить армию" }));
  expect(onAction).toHaveBeenLastCalledWith({
    type: "EMBARK_ARMY",
    shipId: "transport",
    armyId: "red-army"
  });

  fireEvent.change(armySelect, { target: { value: "blue-army" } });
  fireEvent.click(screen.getByRole("button", { name: "Погрузить армию" }));
  expect(onAction).toHaveBeenLastCalledWith({
    type: "EMBARK_ARMY",
    shipId: "transport",
    armyId: "blue-army"
  });
});

it("hides embark controls from an ordinary faction member", () => {
  render(
    <FleetPage
      ships={[transport]}
      armies={[ownArmy]}
      sides={sides}
      role="PLAYER"
      leaderSideIds={new Set()}
      transportEmbarkTargets={[]}
      onAction={vi.fn()}
    />
  );

  expect(screen.queryByRole("button", { name: "Погрузить армию" })).toBeNull();
});
