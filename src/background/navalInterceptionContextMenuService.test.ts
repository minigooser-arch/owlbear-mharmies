import { describe, expect, it } from "vitest";
import {
  CommandTimeoutError,
  NoCoordinatorError,
  type CommandAck
} from "../commands/commandGateway";
import { COMMAND_PROTOCOL_VERSION, type ArmyCommand } from "../shared/types";
import {
  NavalInterceptionContextMenuService,
  type NavalInterceptionContextMenuServicePort
} from "./navalInterceptionContextMenuService";

function accepted(command: ArmyCommand): CommandAck {
  return {
    protocolVersion: COMMAND_PROTOCOL_VERSION,
    requestId: command.requestId,
    status: "ACCEPTED",
    coordinatorConnectionId: "gm-connection",
    recipientConnectionId: command.senderConnectionId
  };
}

function harness(sendImpl?: (command: ArmyCommand) => Promise<CommandAck>) {
  const sent: ArmyCommand[] = [];
  const notifications: Array<{ message: string; variant: "INFO" | "WARNING" | "ERROR" }> = [];
  const port: NavalInterceptionContextMenuServicePort = {
    getPlayerIdentity: async () => ({
      id: "leader",
      role: "PLAYER",
      connectionId: "leader-connection"
    }),
    getSceneRevision: async () => 12,
    show: async (message, variant) => { notifications.push({ message, variant }); }
  };
  const gateway = {
    send: async (command: ArmyCommand) => {
      sent.push(command);
      return sendImpl ? sendImpl(command) : accepted(command);
    }
  };
  return {
    service: new NavalInterceptionContextMenuService(port, gateway),
    sent,
    notifications
  };
}

describe("NavalInterceptionContextMenuService", () => {
  it("sends a coordinator command envelope for the clicked cruiser", async () => {
    const test = harness();

    await test.service.activateInterception("cruiser-red");

    expect(test.sent).toHaveLength(1);
    expect(test.sent[0]).toMatchObject({
      protocolVersion: COMMAND_PROTOCOL_VERSION,
      requestId: expect.any(String),
      senderPlayerId: "leader",
      senderConnectionId: "leader-connection",
      expectedRevision: 12,
      type: "NAVAL_ACTIVATE_INTERCEPTION",
      shipId: "cruiser-red"
    });
    expect(test.notifications).toEqual([]);
  });

  it("shows the authoritative rejection from the coordinator", async () => {
    const test = harness(async (command) => ({
      protocolVersion: COMMAND_PROTOCOL_VERSION,
      requestId: command.requestId,
      status: "REJECTED",
      coordinatorConnectionId: "gm-connection",
      recipientConnectionId: command.senderConnectionId,
      reason: "SHIP_NOT_ACTIVE"
    }));

    await test.service.activateInterception("cruiser-red");

    expect(test.notifications).toEqual([{
      message: "Сейчас ход другого корабля.",
      variant: "WARNING"
    }]);
  });

  it("maps gateway availability failures to the existing Russian notifications", async () => {
    const noCoordinator = harness(async (command) => {
      throw new NoCoordinatorError(command.requestId);
    });
    await noCoordinator.service.activateInterception("cruiser-red");
    expect(noCoordinator.notifications[0]?.message).toBe(
      "Координатор ещё не готов. Повторите попытку через несколько секунд."
    );

    const timeout = harness(async (command) => {
      throw new CommandTimeoutError(command.requestId);
    });
    await timeout.service.activateInterception("cruiser-red");
    expect(timeout.notifications[0]?.message).toBe(
      "Фоновая часть расширения не отвечает. Перезапустите расширение."
    );
  });
});
