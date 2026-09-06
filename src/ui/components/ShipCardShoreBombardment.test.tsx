// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ShipView } from "../state/useExtensionState";
import { ShipCard } from "./ShipCard";

const battleship: ShipView = {
  id: "battleship",
  name: "Петропавловск",
  sideId: "red",
  sideName: "Красные",
  classId: "BATTLESHIP",
  className: "Линкор",
  status: "READY",
  hp: 40,
  maxHp: 40,
  temporaryHp: 0,
  armor: 3,
  movementMax: 3,
  movementRemaining: 3,
  plannedRouteCellCount: 0,
  facing: "EAST",
  normalDice: 3,
  normalRangeMin: 2,
  normalRangeMax: 4,
  embarkedArmyId: null,
  detectionOverride: null,
  effectiveDetectionRange: 6,
  shoreBombardmentTargets: [
    { id: "enemy", name: "Синяя армия", sideId: "blue", sideName: "Синие" },
    { id: "ally", name: "Зелёная армия", sideId: "green", sideName: "Зелёные" },
    { id: "own", name: "Красная армия", sideId: "red", sideName: "Красные" }
  ]
};

const relations = {
  red: { blue: "ENEMY", green: "ALLY" },
  blue: { red: "ENEMY" },
  green: { red: "ALLY" }
} as const;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ShipCard shore bombardment", () => {
  it("fires at an enemy without friendly-fire confirmation and shows battleship dice", () => {
    const onAction = vi.fn();
    const confirm = vi.spyOn(window, "confirm");
    render(
      <ShipCard
        ship={battleship}
        sideColor="#f00"
        isGM={false}
        canPlanRoute
        relations={relations}
        onAction={onAction}
      />
    );

    expect(screen.getByRole("option", { name: "Синяя армия — Синие" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Береговой обстрел (3d6)" }));

    expect(confirm).not.toHaveBeenCalled();
    expect(onAction).toHaveBeenCalledWith({
      type: "NAVAL_SHORE_BOMBARDMENT",
      shipId: "battleship",
      armyId: "enemy",
      friendlyFireConfirmed: false
    });
  });

  it("requires explicit confirmation before firing at an allied army", () => {
    const onAction = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <ShipCard
        ship={battleship}
        sideColor="#f00"
        isGM={false}
        canPlanRoute
        relations={relations}
        onAction={onAction}
      />
    );

    fireEvent.change(screen.getByLabelText("Цель берегового обстрела Петропавловск"), {
      target: { value: "ally" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Береговой обстрел (3d6)" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(onAction).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Береговой обстрел (3d6)" }));
    expect(onAction).toHaveBeenCalledWith({
      type: "NAVAL_SHORE_BOMBARDMENT",
      shipId: "battleship",
      armyId: "ally",
      friendlyFireConfirmed: true
    });
  });

  it("uses 2d6 for a cruiser and hides the control when no targets are exposed", () => {
    const { rerender } = render(
      <ShipCard
        ship={{ ...battleship, id: "cruiser", classId: "CRUISER", className: "Крейсер" }}
        sideColor="#f00"
        isGM={false}
        canPlanRoute
        relations={relations}
        onAction={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Береговой обстрел (2d6)" })).toBeInTheDocument();

    rerender(
      <ShipCard
        ship={{ ...battleship, shoreBombardmentTargets: [] }}
        sideColor="#f00"
        isGM={false}
        canPlanRoute
        relations={relations}
        onAction={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: /Береговой обстрел/ })).toBeNull();
  });
});