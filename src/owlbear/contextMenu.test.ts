import { expect, it } from "vitest";
import type { ArmyCommand } from "../shared/types";
import {
  setupContextMenu,
  type ArmyContextActionType,
  type ContextMenuPort
} from "./contextMenu";

function createPort(sent: ArmyCommand[]) {
  let handler:
    | ((itemId: string, actionType: ArmyContextActionType) => Promise<void>)
    | undefined;
  const port: ContextMenuPort = {
    register: (_actions, callback) => {
      handler = callback;
      return () => undefined;
    },
    resolveSourceItemId: async () => "source-a",
    commandEnvelope: () => ({
      requestId: "r",
      senderPlayerId: "p",
      senderConnectionId: "c",
      expectedRevision: 1
    }),
    send: async (command) => { sent.push(command); }
  };
  return {
    port,
    invoke(itemId: string, actionType: ArmyContextActionType) {
      if (!handler) throw new Error("Context menu handler was not registered");
      return handler(itemId, actionType);
    }
  };
}

it("routes a single local clone action to its source through a typed command", async () => {
  const sent: ArmyCommand[] = [];
  const { port, invoke } = createPort(sent);

  setupContextMenu(port, "PAUSE_ARMY");
  await invoke("local-clone", "PAUSE_ARMY");

  expect(sent).toEqual([
    expect.objectContaining({ type: "PAUSE_ARMY", armyId: "source-a" })
  ]);
});

it("routes each registered action using the action that was actually clicked", async () => {
  const sent: ArmyCommand[] = [];
  const { port, invoke } = createPort(sent);

  setupContextMenu(port);
  await invoke("local-clone", "START_ARMY");
  await invoke("local-clone", "CLEAR_ROUTE");
  await invoke("local-clone", "UNREGISTER_ARMY");

  expect(sent).toEqual([
    expect.objectContaining({ type: "START_ARMY", armyId: "source-a" }),
    expect.objectContaining({ type: "CLEAR_ROUTE", armyId: "source-a" }),
    expect.objectContaining({ type: "UNREGISTER_ARMY", armyId: "source-a" })
  ]);
});
