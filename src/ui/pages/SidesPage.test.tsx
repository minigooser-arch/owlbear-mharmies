// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Side } from "../../shared/types";
import { SidesPage } from "./SidesPage";

const red: Side = {
  id: "red",
  name: "Красные",
  color: "#f00",
  playerIds: ["leader", "offline"],
  leaderPlayerIds: ["leader"]
};

const players = [
  { id: "leader", name: "Алекс", color: "#111", role: "PLAYER" as const, connected: true },
  { id: "member", name: "Алекс", color: "#222", role: "PLAYER" as const, connected: true }
];

afterEach(cleanup);

describe("SidesPage", () => {
  it("submits a complete side with a trimmed name", () => {
    const onAction = vi.fn();
    render(
      <SidesPage
        role="GM"
        playerId="gm"
        sides={[]}
        players={[]}
        leaderSideIds={new Set()}
        createId={() => "side-uuid"}
        onAction={onAction}
      />
    );

    fireEvent.change(screen.getByLabelText("Название стороны"), {
      target: { value: "  Красные  " }
    });
    fireEvent.click(screen.getByRole("button", { name: "Добавить сторону" }));

    expect(onAction).toHaveBeenCalledWith({
      type: "CREATE_SIDE",
      side: {
        id: "side-uuid",
        name: "Красные",
        color: "#b3261e",
        playerIds: [],
        leaderPlayerIds: []
      }
    });
  });

  it("uses internal ids for players with identical display names", () => {
    const onAction = vi.fn();
    render(
      <SidesPage
        role="GM"
        playerId="gm"
        sides={[red]}
        players={players}
        leaderSideIds={new Set()}
        onAction={onAction}
      />
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Лидер Алекс (member)" }));
    expect(onAction).toHaveBeenCalledWith({
      type: "ADD_SIDE_LEADER",
      sideId: "red",
      playerId: "member"
    });
  });

  it("lets a leader manage members but not leadership", () => {
    const onAction = vi.fn();
    render(
      <SidesPage
        role="PLAYER"
        playerId="leader"
        sides={[red]}
        players={players}
        leaderSideIds={new Set(["red"])}
        onAction={onAction}
      />
    );

    const card = screen.getByRole("article", { name: "Сторона Красные" });
    expect(within(card).queryByRole("checkbox", { name: /Лидер/ })).not.toBeInTheDocument();
    fireEvent.click(within(card).getByRole("checkbox", { name: "Участник Алекс (member)" }));
    expect(onAction).toHaveBeenCalledWith({
      type: "ADD_SIDE_PLAYER",
      sideId: "red",
      playerId: "member"
    });
  });

  it("keeps disconnected persisted members visible and protects leaders from removal", () => {
    render(
      <SidesPage
        role="GM"
        playerId="gm"
        sides={[red]}
        players={players}
        leaderSideIds={new Set()}
        onAction={vi.fn()}
      />
    );

    expect(screen.getByText("Недоступен: offline")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Участник Алекс (leader)" })).toBeDisabled();
  });
});
