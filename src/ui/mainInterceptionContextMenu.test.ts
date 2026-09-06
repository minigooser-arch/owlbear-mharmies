import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  let readyCallback: (() => void) | undefined;
  return {
    render: vi.fn(),
    createServices: vi.fn(),
    setupContextMenu: vi.fn(),
    contextMenuCreate: vi.fn(),
    contextMenuRemove: vi.fn(),
    onReady: vi.fn((callback: () => void) => { readyCallback = callback; }),
    readyCallback: () => readyCallback
  };
});

vi.mock("react-dom/client", () => ({
  createRoot: () => ({ render: mocks.render })
}));

vi.mock("@owlbear-rodeo/sdk", () => ({
  default: {
    onReady: mocks.onReady,
    contextMenu: {
      create: mocks.contextMenuCreate,
      remove: mocks.contextMenuRemove
    }
  }
}));

vi.mock("../owlbear/extensionServices", () => ({
  createOwlbearExtensionServices: mocks.createServices
}));

vi.mock("../owlbear/navalInterceptionContextMenu", () => ({
  setupNavalInterceptionContextMenu: mocks.setupContextMenu
}));

vi.mock("./App", () => ({ App: () => null }));

beforeEach(() => {
  vi.resetModules();
  mocks.render.mockClear();
  mocks.createServices.mockReset();
  mocks.setupContextMenu.mockReset();
  mocks.contextMenuCreate.mockReset();
  mocks.contextMenuRemove.mockReset();
  mocks.onReady.mockClear();
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { getElementById: () => ({}) }
  });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "document");
});

it("installs the Owlbear interception context menu when the extension UI becomes ready", async () => {
  const services = {
    getSnapshot: vi.fn(),
    subscribe: vi.fn(),
    send: vi.fn(),
    runDiagnostic: vi.fn(),
    stop: vi.fn()
  };
  mocks.createServices.mockResolvedValue(services);
  mocks.setupContextMenu.mockResolvedValue(async () => undefined);

  await import("./main");
  mocks.readyCallback()?.();
  await vi.waitFor(() => expect(mocks.createServices).toHaveBeenCalledTimes(1));

  expect(mocks.setupContextMenu).toHaveBeenCalledTimes(1);
  expect(mocks.setupContextMenu).toHaveBeenCalledWith(
    expect.objectContaining({
      create: expect.any(Function),
      remove: expect.any(Function)
    }),
    services
  );
});
