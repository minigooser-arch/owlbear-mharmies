// @vitest-environment jsdom

import type { ComponentType } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Side } from "../../shared/types";
import type { NavalRequestTargetView, ShipView, UiCommand } from "../state/useExtensionState";
import { FleetPage } from "./FleetPage";

const sides: Side[] = [
  {
    id: "red",
    name: "Красные",
    color: "#f00",
    playerIds: ["leader", "member"],
    leaderPlayerIds: ["leader"],
    stateId: null
  },
  {
    id: "blue",
    name: "Синие",
    color: "#00f",
    playerIds: ["blue"],
    leaderPlayerIds: ["blue"],
    stateId: null
  }
];

function ship(id: string, name: string): ShipView {
  return {
    id,
    name,
    sideId: "red",
    sideName: "Красные",
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

const target: NavalRequestTargetView = {
  id: "blue-visible",
  name: "Видимый линкор",
  sideId: "blue",
  sideName: "Синие"
};

type RequestAwareFleetProps = React.ComponentProps<typeof FleetPage> & {
  navalRequestTargets: readonly NavalRequestTargetView[];
};
const RequestAwareFleet = FleetPage as unknown as ComponentType<RequestAwareFleetProps>;

afterEach(() => cleanup());

describe("fleet naval battle request controls", () => {
  it("lets a faction leader request a naval battle against a detected target without starting it", () => {
    const onAction = vi.fn<(command: UiCommand) => void>();
    render(
      <RequestAwareFleet
        ships={[ship("red-1", "Аврора"), ship("red-2", "Паллада")]}
        armies={[]}
        sides={sides}
        role="PLAYER"
        leaderSideIds={new Set(["red"])}
        navalRequestTargets={[target]}
        onAction={onAction}
      />
    );

    expect(screen.getByRole("heading", { name: "Запрос морского боя" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Видимый линкор — Синие" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Корабль-инициатор"), { target: { value: "red-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Инициировать морской бой" }));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith({
      type: "REQUEST_NAVAL_BATTLE",
      initiatingShipId: "red-2",
      targetShipId: "blue-visible"
    });
    expect(onAction).not.toHaveBeenCalledWith(expect.objectContaining({ type: "START_NAVAL_BATTLE" }));
  });

  it("does not expose naval request controls to an ordinary faction member", () => {
    render(
      <RequestAwareFleet
        ships={[ship("red-1", "Аврора")]}
        armies={[]}
        sides={sides}
        role="PLAYER"
        leaderSideIds={new Set()}
        navalRequestTargets={[target]}
        onAction={() => undefined}
      />
    );

    expect(screen.queryByRole("heading", { name: "Запрос морского боя" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Инициировать морской бой" })).toBeNull();
  });

  it("shows a leader that there are no currently detected targets", () => {
    render(
      <RequestAwareFleet
        ships={[ship("red-1", "Аврора")]}
        armies={[]}
        sides={sides}
        role="PLAYER"
        leaderSideIds={new Set(["red"])}
        navalRequestTargets={[]}
        onAction={() => undefined}
      />
    );

    expect(screen.getByText("Обнаруженных целей нет.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Инициировать морской бой" })).toBeDisabled();
  });
});
