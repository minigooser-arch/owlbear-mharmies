/* @vitest-environment jsdom */

import { screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  const readyCallbacks: Array<() => void> = [];
  return {
    readyCallbacks,
    onReady: vi.fn((callback: () => void) => {
      readyCallbacks.push(callback);
    }),
    createServices: vi.fn(async () => {
      throw new Error("simulated startup failure");
    })
  };
});

vi.mock("@owlbear-rodeo/sdk", () => ({
  default: {
    onReady: harness.onReady
  }
}));

vi.mock("../owlbear/extensionServicesV7", () => ({
  createOwlbearExtensionServices: harness.createServices
}));

it("renders a visible loading state before Owlbear is ready and a visible error if startup fails", async () => {
  document.body.innerHTML = '<div id="root"></div>';

  await import("./main");

  expect(await screen.findByText("Загрузка…")).toBeVisible();
  expect(harness.readyCallbacks).toHaveLength(1);

  harness.readyCallbacks[0]?.();

  const alert = await screen.findByRole("alert");
  expect(alert).toBeVisible();
  expect(alert).toHaveTextContent("Не удалось запустить интерфейс расширения");
});
