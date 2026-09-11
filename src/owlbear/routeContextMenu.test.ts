import { describe, expect, it } from "vitest";
import { METADATA_KEYS } from "../shared/constants";
import {
  ROUTE_SET_CONTEXT_MENU_ID,
  registerRouteContextMenu,
  type RouteContextMenuActionService,
  type RouteContextMenuPort
} from "./routeContextMenu";

function harness() {
  const entries: Array<Parameters<RouteContextMenuPort["create"]>[0]> = [];
  const removed: string[] = [];
  const opened: string[] = [];
  const port: RouteContextMenuPort = {
    create: async (entry) => { entries.push(entry); },
    remove: async (id) => { removed.push(id); }
  };
  const service: RouteContextMenuActionService = {
    openRouteForLocalItem: async (itemId) => { opened.push(itemId); }
  };
  return { port, service, entries, removed, opened };
}

describe("unit route Owlbear context menu", () => {
  it("keeps a fallback icon visible for any Letopis clone even if hasRoute metadata is temporarily absent", async () => {
    const test = harness();
    await registerRouteContextMenu(test.port, test.service, "/icon.png");

    expect(test.entries).toHaveLength(1);
    expect(test.entries[0]).toMatchObject({
      id: ROUTE_SET_CONTEXT_MENU_ID,
      icons: expect.arrayContaining([
        expect.objectContaining({
          label: "Маршрут Летописи",
          filter: expect.objectContaining({
            min: 1,
            max: 1,
            every: [
              { key: ["metadata", METADATA_KEYS.localClone], operator: "!=", value: undefined }
            ]
          })
        })
      ])
    });
  });

  it("opens the same route editor action regardless of the current icon state", async () => {
    const test = harness();
    await registerRouteContextMenu(test.port, test.service, "/icon.png");
    const entry = test.entries[0];

    await entry?.onClick({ items: [{ id: "clone-ship" }] });

    expect(test.opened).toEqual(["clone-ship"]);
  });

  it("removes the single persistent route action on disposal", async () => {
    const test = harness();
    const dispose = await registerRouteContextMenu(test.port, test.service, "/icon.png");
    await dispose();
    expect(test.removed).toEqual([ROUTE_SET_CONTEXT_MENU_ID]);
  });
});