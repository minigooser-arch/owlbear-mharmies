// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Side, StateEntity, WarState } from "../../shared/types";
import { WarsPage } from "./WarsPage";

const sides: Side[] = [
  { id: "russia", name: "Россия", color: "#5577aa", playerIds: [], leaderPlayerIds: [], stateId: "russian-empire" },
  { id: "germany", name: "Германия", color: "#aa7755", playerIds: [], leaderPlayerIds: [], stateId: "german-empire" }
];
const states: StateEntity[] = [
  { id: "russian-empire", name: "Российская империя", rulingFactionId: "russia", active: true },
  { id: "german-empire", name: "Германская империя", rulingFactionId: "germany", active: true }
];
const wars: WarState[] = [
  { id: "war-1", name: "Русско-германская война", participantFactionIds: ["russia", "germany"], participantStateIds: ["russian-empire", "german-empire"], active: true }
];

afterEach(cleanup);

it("shows active war participants and an explicit end action", () => {
  render(<WarsPage wars={wars} sides={sides} states={states} onAction={vi.fn()} />);
  expect(screen.getByText("Русско-германская война")).toBeInTheDocument();
  expect(screen.getByText(/Фракции: Россия, Германия/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Завершить войну" })).toBeInTheDocument();
});


it("shows state participants separately from faction participants", () => {
  render(<WarsPage wars={wars} sides={sides} states={states} onAction={vi.fn()} />);
  expect(screen.getByText(/Государства: Российская империя, Германская империя/)).toBeInTheDocument();
  expect(screen.getAllByText(/Государства/).length).toBeGreaterThan(0);
});
