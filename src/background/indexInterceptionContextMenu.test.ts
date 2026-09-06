import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  let readyCallback: (() => void) | undefined;
  let unloadCallback: (() => void) | undefined;
  return {
    onReady: vi.fn((callback: () => void) => { readyCallback = callback; }),
    readyCallback: () => readyCallback,
    setUnloadCallback: (callback: () => void) => { unloadCallback = callback; },
    unloadCallback: () => unloadCallback,
    startBackgroundApplication: vi.fn(),
    registerContextMenu: vi.fn(),
    contextMenuCreate: vi.fn(),
    contextMenuRemove: vi.fn(),
    notificationShow: vi.fn()
  };
});

vi.mock("@owlbear-rodeo/sdk", () => ({
  default: {
    onReady: mocks.onReady,
    contextMenu: {
      create: mocks.contextMenuCreate,
      remove: mocks.contextMenuRemove
    },
    notification: { show: mocks.notificationShow }
  }
}));

vi.mock("./application", () => ({
  startBackgroundApplication: mocks.startBackgroundApplication
}));

vi.mock("../owlbear/navalInterceptionContextMenu", () => ({
  registerNavalInterceptionContextMenu: mocks.registerContextMenu
}));

beforeEach(() => {
  vi.resetModules();
  mocks.onReady.mockClear();
  mocks.startBackgroundApplication.mockReset();
  mocks.registerContextMenu.mockReset();
  mocks.contextMenuCreate.mockReset();
  mocks.contextMenuRemove.mockReset();
  mocks.notificationShow.mockReset();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener: vi.fn((_event: string, callback: () => void) => {
        mocks.setUnloadCallback(callback);
      })
    }
  });
});

it("registers interception right-click in the persistent background and disposes it on unload", async () => {
  const application = {
    activateInterception: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined)
  };
  const removeContextMenu = vi.fn(async () => undefined);
  mocks.startBackgroundApplication.mockResolvedValue(application);
  mocks.registerContextMenu.mockResolvedValue(removeContextMenu);

  await import("./index");
  mocks.readyCallback()?.();

  await vi.waitFor(() => expect(mocks.startBackgroundApplication).toHaveBeenCalledTimes(1));
  await vi.waitFor(() => expect(mocks.registerContextMenu).toHaveBeenCalledTimes(1));
  expect(mocks.registerContextMenu).toHaveBeenCalledWith(
    expect.objectContaining({
      create: mocks.contextMenuCreate,
      remove: mocks.contextMenuRemove
    }),
    application,
    expect.stringContaining("icon-1.2.png")
  );

  mocks.unloadCallback()?.();
  await vi.waitFor(() => expect(removeContextMenu).toHaveBeenCalledTimes(1));
  await vi.waitFor(() => expect(application.stop).toHaveBeenCalledTimes(1));
});
