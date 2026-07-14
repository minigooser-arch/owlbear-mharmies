import { expect, it } from "vitest";
import type { ArmyCommand } from "../shared/types";
import { setupContextMenu, type ContextMenuPort } from "./contextMenu";

it("routes a local clone action to its source through a typed command", async () => {
  let handler: ((itemId: string) => Promise<void>) | undefined;
  const sent: ArmyCommand[] = [];
  const port: ContextMenuPort = {
    register: (_actions, callback) => { handler = callback; return () => undefined; },
    resolveSourceItemId: async () => "source-a",
    commandEnvelope: () => ({
      requestId: "r",
      senderPlayerId: "p",
      senderConnectionId: "c",
      expectedRevision: 1
    }),
    send: async (command) => { sent.push(command); }
  };
  setupContextMenu(port, "PAUSE_ARMY");
  await handler?.("local-clone");
  expect(sent).toEqual([
    expect.objectContaining({ type: "PAUSE_ARMY", armyId: "source-a" })
  ]);
});
