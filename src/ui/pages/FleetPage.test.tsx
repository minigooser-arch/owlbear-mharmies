// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Side } from "../../shared/types";
import type { ShipView } from "../state/useExtensionState";
import { FleetPage } from "./FleetPage";

const sides: Side[] = [
  { id: "red", name: "Красные", color: "#f00", playerIds: ["leader", "member"], leaderPlayerIds: ["leader"], stateId: null }
];

function ship(patch: Partial<ShipView> = {}): ShipView {
  return {
    id: "ship",
    name: "Севастополь",
    sideId: "red",
    sideName: "Красные",
    classId: "IRONCLAD",
    className: "Броненосец",
    status: "READY",
    hp: 25,
    maxHp: 25,
    temporaryHp: 0,
    armor: 2,
    movementMax: 4,
    movementRemaining: 4,
    plannedRouteCellCount: 0,
    facing: "EAST",
    normalDice: 2,
    normalRangeMin: 1,
    normalRangeMax: 2,
    embarkedArmyId: null,
    detectionOverride: null,
    effectiveDetectionRange: 6,
    ...patch
  };
}

afterEach(() => cleanup());

function renderFleet(input: {
  role?: "GM" | "PLAYER";
  leaderSideIds?: ReadonlySet<string>;
  ship?: ShipView;
}) {
  const onAction = vi.fn();
  render(
    <FleetPage
      ships={[input.ship ?? ship()]}
      armies={[]}
      sides={sides}
      role={input.role ?? "PLAYER"}
      leaderSideIds={input.leaderSideIds ?? new Set(["red"])}
      onAction={onAction}
    />
  );
  return onAction;
}

describe("fleet strategic route action", () => {
  it("lets a faction leader open the ship route tool", () => {
    const onAction = renderFleet({});
    fireEvent.click(screen.getByRole("button", { name: "Проложить переход" }));
    expect(onAction).toHaveBeenCalledWith({ type: "EDIT_SHIP_ROUTE", shipId: "ship" });
  });

  it("does not expose route planning to an ordinary faction member", () => {
    renderFleet({ leaderSideIds: new Set() });
    expect(screen.queryByRole("button", { name: "Проложить переход" })).toBeNull();
  });

  it.each([
    ["battle", ship({ status: "IN_NAVAL_BATTLE" })],
    ["planned", ship({ plannedRouteCellCount: 1 })],
    ["no movement", ship({ movementRemaining: 0 })]
  ])("disables route planning for %s ship", (_label, current) => {
    renderFleet({ ship: current });
    expect(screen.getByRole("button", { name: "Проложить переход" })).toBeDisabled();
  });

  it("lets the GM plan a route for any READY ship", () => {
    const onAction = renderFleet({ role: "GM", leaderSideIds: new Set() });
    fireEvent.click(screen.getByRole("button", { name: "Проложить переход" }));
    expect(onAction).toHaveBeenCalledWith({ type: "EDIT_SHIP_ROUTE", shipId: "ship" });
  });
});
