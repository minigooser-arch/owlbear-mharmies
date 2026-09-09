// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Side } from "../../shared/types";
import type { ArmyView, ShipView } from "../state/useExtensionState";
import { FleetPage } from "./FleetPage";

const sides: Side[] = [
  { id: "red", name: "Красные", color: "#f00", playerIds: ["leader"], leaderPlayerIds: ["leader"], stateId: null },
  { id: "blue", name: "Синие", color: "#00f", playerIds: ["blue"], leaderPlayerIds: ["blue"], stateId: null }
];

const cruiser: ShipView = {
  id: "cruiser", name: "Аврора", sideId: "red", sideName: "Красные",
  classId: "CRUISER", className: "Крейсер", status: "READY", hp: 20, maxHp: 20, temporaryHp: 0,
  armor: 1, movementMax: 5, movementRemaining: 5, plannedRouteCellCount: 0, facing: "EAST",
  normalDice: 2, normalRangeMin: 1, normalRangeMax: 3, embarkedArmyId: null,
  detectionOverride: null, effectiveDetectionRange: 6
};

const transport: ShipView = {
  ...cruiser, id: "transport", name: "Транспорт", classId: "TRANSPORT", className: "Транспорт",
  normalDice: 0, normalRangeMin: 0, normalRangeMax: 0
};

const army: ArmyView = {
  id: "army", name: "Десант", sideId: "red", sideName: "Красные", status: "READY", route: [],
  movementMaxUnits: 10, movementRemainingUnits: 10, routeCostUnits: 0, routeCellCount: 0,
  routeRequiresReplan: false, atWar: false, healthHp: 50, healthMaxHp: 50, supplied: true,
  supplyCheckedOnTurn: 1, disbandPending: false, embarkedOnShipId: null
};

afterEach(cleanup);

it("in MOVEMENT keeps transport interaction available but prevents premature naval battle requests", () => {
  render(
    <FleetPage
      ships={[cruiser, transport]}
      armies={[army]}
      sides={sides}
      role="PLAYER"
      leaderSideIds={new Set(["red"])}
      navalRequestTargets={[{ id: "enemy", name: "Враг", sideId: "blue", sideName: "Синие" }]}
      turnPhase="MOVEMENT"
      onAction={vi.fn()}
    />
  );

  expect(screen.getByRole("button", { name: "Погрузить армию" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Инициировать морской бой" })).toBeDisabled();
  expect(screen.getByText("Заявка на морской бой доступна после завершения фазы перемещения.")).toBeInTheDocument();
});

it("in POST_MOVEMENT enables naval battle requests and removes impossible transport actions", () => {
  render(
    <FleetPage
      ships={[cruiser, transport]}
      armies={[army]}
      sides={sides}
      role="PLAYER"
      leaderSideIds={new Set(["red"])}
      navalRequestTargets={[{ id: "enemy", name: "Враг", sideId: "blue", sideName: "Синие" }]}
      turnPhase="POST_MOVEMENT"
      onAction={vi.fn()}
    />
  );

  expect(screen.getByRole("button", { name: "Инициировать морской бой" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Погрузить армию" })).toBeNull();
});

it("hides ship route actions after MOVEMENT and explains why", () => {
  render(
    <FleetPage
      ships={[cruiser]}
      armies={[]}
      sides={sides}
      role="PLAYER"
      leaderSideIds={new Set(["red"])}
      turnPhase="POST_MOVEMENT"
      onAction={vi.fn()}
    />
  );

  expect(screen.queryByRole("button", { name: "Проложить переход" })).toBeNull();
  expect(screen.getByText("Маршрут корабля задаётся только в фазе перемещения.")).toBeInTheDocument();
});
