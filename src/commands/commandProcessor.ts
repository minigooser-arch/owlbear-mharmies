import type { ArmyCommand } from "../shared/types";
import {
  createStrategicCity,
  deleteStrategicCity,
  updateStrategicCity
} from "../cities/strategicCities";
import { addCityBuilding, removeCityBuilding } from "../cities/cityBuildingRules";
import {
  isStrategicCityCommand,
  type StrategicCityCommand
} from "../cities/strategicCityCommands";
import { recalculateArmySupply } from "../supply/supplyService";
import type { GridCellCoord, Vector2 } from "../shared/types";
import {
  CommandProcessor as CoreCommandProcessor,
  type CommandContext,
  type CommandExecutionResult
} from "./commandProcessorCore";

export * from "./commandProcessorCore";

export class CommandProcessor {
  private readonly core: CoreCommandProcessor;
  private readonly cellForPosition: ((position: Vector2) => GridCellCoord) | undefined;

  constructor(...args: ConstructorParameters<typeof CoreCommandProcessor>) {
    this.cellForPosition = args[1];
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
    const result = command.type === "CREATE_STRATEGIC_CITY" || command.type === "CREATE_STRATEGIC_CITY_FROM_TOKEN"
      ? createStrategicCity(cities, command.city, state.scene.gridMap, state.scene.states)
      : command.type === "UPDATE_STRATEGIC_CITY"
        ? updateStrategicCity(cities, command.cityId, command.patch, state.scene.gridMap, state.scene.states)
        : command.type === "DELETE_STRATEGIC_CITY"
          ? deleteStrategicCity(cities, command.cityId)
          : command.type === "ADD_CITY_BUILDING"
            ? (() => {
                const city = cities.find((candidate) => candidate.id === command.cityId);
                if (!city) return { ok: false as const, reason: "CITY_NOT_FOUND" as const };
                const added = addCityBuilding(city, command.building, cities);
                return added.ok
                  ? { ok: true as const, cities: cities.map((candidate) => candidate.id === city.id ? added.city : structuredClone(candidate)) }
                  : { ok: false as const, reason: added.reason };
              })()
            : (() => {
                const city = cities.find((candidate) => candidate.id === command.cityId);
                if (!city) return { ok: false as const, reason: "CITY_NOT_FOUND" as const };
                const removed = removeCityBuilding(city, command.buildingId);
                return removed.ok
                  ? { ok: true as const, cities: cities.map((candidate) => candidate.id === city.id ? removed.city : structuredClone(candidate)) }
                  : { ok: false as const, reason: removed.reason };
              })();
    if (!result.ok) return { status: "REJECTED", reason: result.reason };
    state.scene.strategicCities = result.cities;
    state.scene.revision += 1;
    // City mutations can create, move or remove a supply source. Recheck every
    // mapped army immediately, not only when the next global turn completes.
    const cellForPosition = this.cellForPosition;
    if (cellForPosition) {
      const armyCells = Object.fromEntries(Object.entries(state.armies).flatMap(([armyId]) => {
        const position = state.positions?.[armyId] ?? state.items[armyId]?.position;
        return position ? [[armyId, cellForPosition(position)]] : [];
      }));
      state.armies = recalculateArmySupply(state.scene, state.armies, armyCells);
    }
    return { status: "ACCEPTED", state };
  }
}

