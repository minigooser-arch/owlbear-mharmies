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
    registerInterceptionContextMenu: vi.fn(),
    registerRouteContextMenu: vi.fn(),
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
  registerNavalInterceptionContextMenu: mocks.registerInterceptionContextMenu
}));

vi.mock("../owlbear/routeContextMenu", () => ({
  registerRouteContextMenu: mocks.registerRouteContextMenu
}));

beforeEach(() => {
  vi.resetModules();
  mocks.onReady.mockClear();
  mocks.startBackgroundApplication.mockReset();
  mocks.registerInterceptionContextMenu.mockReset();
  mocks.registerRouteContextMenu.mockReset();
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

it("registers persistent interception and token route context menus and disposes both on unload", async () => {
  const application = {
    activateInterception: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined)
  };
  const removeInterceptionContextMenu = vi.fn(async () => undefined);
  const removeRouteContextMenu = vi.fn(async () => undefined);
  mocks.startBackgroundApplication.mockResolvedValue(application);
  mocks.registerInterceptionContextMenu.mockResolvedValue(removeInterceptionContextMenu);
  mocks.registerRouteContextMenu.mockResolvedValue(removeRouteContextMenu);

  await import("./index");
  mocks.readyCallback()?.();

  await vi.waitFor(() => expect(mocks.startBackgroundApplication).toHaveBeenCalledTimes(1));
  await vi.waitFor(() => expect(mocks.registerInterceptionContextMenu).toHaveBeenCalledTimes(1));
  await vi.waitFor(() => expect(mocks.registerRouteContextMenu).toHaveBeenCalledTimes(1));

  const expectedPort = expect.objectContaining({
    create: expect.any(Function),
    remove: expect.any(Function)
  });
  expect(mocks.registerInterceptionContextMenu).toHaveBeenCalledWith(
    expectedPort,
    application,
    "/icon-1.2.png"
  );
  expect(mocks.registerRouteContextMenu).toHaveBeenCalledWith(
    expectedPort,
    expect.anything(),
    "/icon-1.2.png"
  );
  const routeService = mocks.registerRouteContextMenu.mock.calls[0]?.[1] as {
    openRouteForLocalItem?: unknown;
  };
  expect(typeof routeService.openRouteForLocalItem).toBe("function");

  const contextMenuPort = mocks.registerRouteContextMenu.mock.calls[0]?.[0] as {
    create(entry: unknown): unknown;
    remove(id: string): unknown;
  };
  const sdkEntry = { id: "route-test" };
  contextMenuPort.create(sdkEntry);
  contextMenuPort.remove("route-test");
  expect(mocks.contextMenuCreate).toHaveBeenCalledWith(sdkEntry);
  expect(mocks.contextMenuRemove).toHaveBeenCalledWith("route-test");

  mocks.unloadCallback()?.();
  await vi.waitFor(() => expect(removeInterceptionContextMenu).toHaveBeenCalledTimes(1));
  await vi.waitFor(() => expect(removeRouteContextMenu).toHaveBeenCalledTimes(1));
  await vi.waitFor(() => expect(application.stop).toHaveBeenCalledTimes(1));
});
