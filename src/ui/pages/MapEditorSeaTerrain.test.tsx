// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DEFAULT_TERRAIN } from "../../shared/constants";
import { MapEditorPage } from "./MapEditorPage";

afterEach(cleanup);

it("does not offer delete or disable actions for the built-in sea terrain", () => {
  render(<MapEditorPage terrain={DEFAULT_TERRAIN} sides={[]} states={[]} onAction={vi.fn()} />);

  const nameInput = screen.getByLabelText("Название местности sea");
  const row = nameInput.closest("article");
  expect(row).not.toBeNull();
  if (!row) return;

  expect(within(row).queryByRole("button", { name: "Удалить" })).toBeNull();
  expect(within(row).queryByRole("button", { name: "Отключить" })).toBeNull();
  expect(within(row).getByRole("button", { name: "Сохранить" })).toBeEnabled();
});
