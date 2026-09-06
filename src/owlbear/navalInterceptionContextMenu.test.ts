import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE, METADATA_KEYS } from "../shared/constants";
import type { ExtensionServices, RawExtensionSnapshot, ShipView, UiCommand } from "../ui/state/useExtensionState";
import {
  NAVAL_INTERCEPTION_CONTEXT_MENU_ID,
  setupNavalInterceptionContextMenu,
  type NavalInterceptionContextMenuPort
} from "./navalInterceptionContextMenu";

function cruiser(overrides: Partial<ShipView> = {}): ShipView {
  return {
    id: "cruiser",
    name: "Крейсер",
    sideId: "red",
    sideName: "Красные",
    classId: "CRUISER",
    className: "Крейсер",
    status: "IN_NAVAL_BATTLE",
    hp: 12,
    maxHp: 12,
    temporaryHp: 0,
    armor: 1,
    movementMax: 3,
    movementRemaining: 3,
    plannedRouteCellCount: 0,
    facing: "NORTH",
    normalDice: 2,
    normalRangeMin: 1,
    normalRangeMax: 2,
    embarkedArmyId: null,
    detectionOverride: null,
    effectiveDetectionRange: 6,
    navalRoundNumber: 2,
    isCurrentNavalTurn: true,
    navalMovementRemaining: 3,
    navalActionUsed: false,
    navalExited: false,
    ...overrides
  };
}

function snapshot(overrides: Partial<RawExtensionSnapshot> = {}): RawExtensionSnapshot {
  return {
    ready: true,
    sceneReady: true,
    futureSchema: false,
    role: "PLAYER",
    playerId: "leader",
    players: [],
    memberSideIds: new Set(["red"]),
    leaderSideIds: new Set(["red"]),
    mapVisibleSourceIds: new Set(["cruiser"]),
    armies: [],
    ships: [cruiser()],
    sides: [],
    states: [],
    relations: {},
    battleGroups: [],
    settings: DEFAULT_SETTINGS,
    terrain: DEFAULT_TERRAIN,
    wars: [],
    turn: { ...DEFAULT_TURN_STATE, phase: "POST_MOVEMENT" },
    ...overrides
  };
}

function harness(currentSnapshot: RawExtensionSnapshot) {
  let entry: Parameters<NavalInterceptionContextMenuPort["create"]>[0] | undefined;
  const sent: UiCommand[] = [];
  const removed: string[] = [];
  const port: NavalInterceptionContextMenuPort = {
    create: async (value) => { entry = value; },
    remove: async (id) => { removed.push(id); }
  };
  const services: ExtensionServices = {
    getSnapshot: () => currentSnapshot,
    subscribe: () => () => undefined,
    send: async (command) => { sent.push(command); },
    runDiagnostic: async () => undefined
  };
  return { port, services, sent, removed, entry: () => entry };
}

describe("naval interception Owlbear context menu", () => {
  it("registers a right-click action restricted to registered cruisers", async () => {
    const test = harness(snapshot());
    const dispose = await setupNavalInterceptionContextMenu(test.port, test.services);

    expect(test.entry()).toMatchObject({
      id: NAVAL_INTERCEPTION_CONTEXT_MENU_ID,
      icons: [{
        label: "Перехват",
        filter: {
          min: 1,
          max: 1,
          every: [
            { key: ["metadata", METADATA_KEYS.ship], operator: "!=", value: undefined },
            { key: ["metadata", METADATA_KEYS.ship, "classId"], value: "CRUISER" }
          ]
        }
      }]
    });

    await dispose();
    expect(test.removed).toEqual([NAVAL_INTERCEPTION_CONTEXT_MENU_ID]);
  });

  it("sends NAVAL_ACTIVATE_INTERCEPTION for an eligible cruiser controlled by its leader", async () => {
    const test = harness(snapshot());
    await setupNavalInterceptionContextMenu(test.port, test.services);

    await test.entry()?.onClick({ items: [{ id: "cruiser" }] });

    expect(test.sent).toEqual([{ type: "NAVAL_ACTIVATE_INTERCEPTION", shipId: "cruiser" }]);
  });

  it("does not send interception when the viewer cannot control the cruiser or its action is unavailable", async () => {
    const unauthorized = harness(snapshot({ leaderSideIds: new Set() }));
    await setupNavalInterceptionContextMenu(unauthorized.port, unauthorized.services);
    await unauthorized.entry()?.onClick({ items: [{ id: "cruiser" }] });
    expect(unauthorized.sent).toEqual([]);

    const spent = harness(snapshot({ ships: [cruiser({ navalActionUsed: true })] }));
    await setupNavalInterceptionContextMenu(spent.port, spent.services);
    await spent.entry()?.onClick({ items: [{ id: "cruiser" }] });
    expect(spent.sent).toEqual([]);
  });
});
