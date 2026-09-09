import { describe, expect, it } from "vitest";
import { METADATA_KEYS } from "../shared/constants";
import {
  ROUTE_EDIT_CONTEXT_MENU_ID,
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
  it("offers set and edit route actions based on local-clone route metadata", async () => {
    const test = harness();
    await registerRouteContextMenu(test.port, test.service, "/icon.png");

    expect(test.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: ROUTE_SET_CONTEXT_MENU_ID,
        icons: [expect.objectContaining({
          label: "Задать маршрут",
          filter: expect.objectContaining({
            min: 1,
            max: 1,
            every: expect.arrayContaining([
              { key: ["metadata", METADATA_KEYS.localClone], operator: "!=", value: undefined },
              { key: ["metadata", METADATA_KEYS.localClone, "hasRoute"], value: false }
            ])
          })
        })]
      }),
      expect.objectContaining({
        id: ROUTE_EDIT_CONTEXT_MENU_ID,
        icons: [expect.objectContaining({
          label: "Изменить маршрут",
          filter: expect.objectContaining({
            min: 1,
            max: 1,
            every: expect.arrayContaining([
              { key: ["metadata", METADATA_KEYS.localClone], operator: "!=", value: undefined },
              { key: ["metadata", METADATA_KEYS.localClone, "hasRoute"], value: true }
            ])
          })
        })]
      })
    ]));
  });

  it("opens the route editor for the selected visible clone", async () => {
    const test = harness();
    await registerRouteContextMenu(test.port, test.service, "/icon.png");
    const setEntry = test.entries.find((entry) => entry.id === ROUTE_SET_CONTEXT_MENU_ID);
    const editEntry = test.entries.find((entry) => entry.id === ROUTE_EDIT_CONTEXT_MENU_ID);

    await setEntry?.onClick({ items: [{ id: "clone-army" }] });
    await editEntry?.onClick({ items: [{ id: "clone-ship" }] });

    expect(test.opened).toEqual(["clone-army", "clone-ship"]);
  });

  it("removes both route actions on disposal", async () => {
    const test = harness();
    const dispose = await registerRouteContextMenu(test.port, test.service, "/icon.png");
    await dispose();
    expect(test.removed).toEqual([ROUTE_SET_CONTEXT_MENU_ID, ROUTE_EDIT_CONTEXT_MENU_ID]);
  });
});
