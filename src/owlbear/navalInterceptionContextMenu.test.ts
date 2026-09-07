import { describe, expect, it } from "vitest";
import { METADATA_KEYS } from "../shared/constants";
import {
  NAVAL_INTERCEPTION_CONTEXT_MENU_ID,
  registerNavalInterceptionContextMenu,
  type NavalInterceptionActionService,
  type NavalInterceptionContextMenuPort
} from "./navalInterceptionContextMenu";

function harness() {
  let entry: Parameters<NavalInterceptionContextMenuPort["create"]>[0] | undefined;
  const activated: string[] = [];
  const removed: string[] = [];
  const port: NavalInterceptionContextMenuPort = {
    create: async (value) => { entry = value; },
    remove: async (id) => { removed.push(id); }
  };
  const service: NavalInterceptionActionService = {
    activateInterception: async (shipId) => { activated.push(shipId); }
  };
  return { port, service, activated, removed, entry: () => entry };
}

describe("naval interception Owlbear context menu", () => {
  it("registers a right-click action restricted to a living cruiser in naval battle", async () => {
    const test = harness();
    const dispose = await registerNavalInterceptionContextMenu(
      test.port,
      test.service,
      "/owlbear-mharmies/icon-1.2.png"
    );

    expect(test.entry()).toMatchObject({
      id: NAVAL_INTERCEPTION_CONTEXT_MENU_ID,
      icons: [{
        icon: "/owlbear-mharmies/icon-1.2.png",
        label: "Перехват",
        filter: {
          min: 1,
          max: 1,
          every: [
            { key: ["metadata", METADATA_KEYS.ship], operator: "!=", value: undefined },
            { key: ["metadata", METADATA_KEYS.ship, "classId"], value: "CRUISER" },
            { key: ["metadata", METADATA_KEYS.ship, "status"], value: "IN_NAVAL_BATTLE" },
            { key: ["metadata", METADATA_KEYS.ship, "hp"], operator: "!=", value: 0 }
          ]
        }
      }]
    });

    await dispose();
    expect(test.removed).toEqual([NAVAL_INTERCEPTION_CONTEXT_MENU_ID]);
  });

  it("passes the clicked cruiser id to the persistent interception action service", async () => {
    const test = harness();
    await registerNavalInterceptionContextMenu(test.port, test.service, "/icon.png");

    await test.entry()?.onClick({ items: [{ id: "cruiser" }] });

    expect(test.activated).toEqual(["cruiser"]);
  });

  it("ignores an empty Owlbear context selection", async () => {
    const test = harness();
    await registerNavalInterceptionContextMenu(test.port, test.service, "/icon.png");

    await test.entry()?.onClick({ items: [] });

    expect(test.activated).toEqual([]);
  });
});
