import type { ArmyCommand } from "../shared/types";
import {
  createStrategicCity,
  deleteStrategicCity,
  updateStrategicCity
} from "../cities/strategicCities";
import {
  isStrategicCityCommand,
  type StrategicCityCommand
} from "../cities/strategicCityCommands";
import {
  CommandProcessor as CoreCommandProcessor,
  type CommandContext,
  type CommandExecutionResult
} from "./commandProcessorCore";

export * from "./commandProcessorCore";

export class CommandProcessor {
  private readonly core: CoreCommandProcessor;

  constructor(...args: ConstructorParameters<typeof CoreCommandProcessor>) {
    this.core = new CoreCommandProcessor(...args);
  }

  execute(context: CommandContext, command: ArmyCommand | StrategicCityCommand): CommandExecutionResult {
    if (!isStrategicCityCommand(command)) return this.core.execute(context, command);
    if (
      command.senderConnectionId !== context.connectionId ||
      command.senderPlayerId !== context.playerId
    ) {
      return { status: "REJECTED", reason: "FORGED_CONNECTION" };
    }
    if (command.expectedRevision !== context.state.scene.revision) {
      return { status: "CONFLICT", actualRevision: context.state.scene.revision };
    }
    if (context.role !== "GM") return { status: "REJECTED", reason: "GM_ONLY" };

    const state = structuredClone(context.state);
    const cities = state.scene.strategicCities ?? [];
    const result = command.type === "CREATE_STRATEGIC_CITY"
      ? createStrategicCity(cities, command.city, state.scene.gridMap, state.scene.states)
      : command.type === "UPDATE_STRATEGIC_CITY"
        ? updateStrategicCity(cities, command.cityId, command.patch, state.scene.gridMap, state.scene.states)
        : deleteStrategicCity(cities, command.cityId);
    if (!result.ok) return { status: "REJECTED", reason: result.reason };
    state.scene.strategicCities = result.cities;
    state.scene.revision += 1;
    return { status: "ACCEPTED", state };
  }
}
