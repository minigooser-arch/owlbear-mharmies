/* @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AppErrorBoundary } from "./AppErrorBoundary";

function BrokenView(): never {
  throw new Error("render exploded");
}

it("shows a visible diagnostic instead of leaving the popover empty after a render crash", () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

  render(
    <AppErrorBoundary>
      <BrokenView />
    </AppErrorBoundary>
  );

  expect(screen.getByRole("alert")).toBeVisible();
  expect(screen.getByText("Ошибка интерфейса расширения.")).toBeVisible();
  expect(screen.getByText("render exploded")).toBeVisible();

  spy.mockRestore();
});
