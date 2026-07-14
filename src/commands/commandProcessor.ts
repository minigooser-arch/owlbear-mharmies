import { releaseBattleGroup } from "../battles/battleGroupService";
import { authorizeArmyCommand } from "../shared/permissions";
import type {
  ArmyCommand,
  ArmyState,
  BarrierState,
  SceneState,
  Vector2
} from "../shared/types";

export interface CommandState {
  scene: SceneState;
  armies: Record<string, ArmyState>;
  barriers: Record<string, BarrierState>;
  positions?: Record<string, Vector2>;
}

export interface CommandContext {
  role: "GM" | "PLAYER";
  playerId: string;
  connectionId: string;
  connectedPlayerIds: ReadonlySet<string>;
  state: CommandState;
}

export type CommandExecutionResult =
  | { status: "ACCEPTED"; state: CommandState }
  | { status: "REJECTED"; reason: string }
  | { status: "CONFLICT"; actualRevision: number };

function armyMap(state: CommandState): Map<string, ArmyState> {
  return new Map(Object.entries(state.armies));
}

function updateArmy(
  state: CommandState,
  armyId: string,
  update: (army: ArmyState) => ArmyState
): boolean {
  const army = state.armies[armyId];
  if (!army) return false;
  state.armies[armyId] = update(army);
  return true;
}

function bumpArmy(army: ArmyState, patch: Partial<ArmyState>): ArmyState {
  return { ...army, ...patch, revision: army.revision + 1 };
}

export class CommandProcessor {
  execute(context: CommandContext, command: ArmyCommand): CommandExecutionResult {
    if (
      command.senderConnectionId !== context.connectionId ||
      command.senderPlayerId !== context.playerId
    ) {
      return { status: "REJECTED", reason: "FORGED_CONNECTION" };
    }
    if (command.expectedRevision !== context.state.scene.revision) {
      return { status: "CONFLICT", actualRevision: context.state.scene.revision };
    }
    const authorization = authorizeArmyCommand(
      {
        role: context.role,
        playerId: context.playerId,
        armies: armyMap(context.state),
        settings: context.state.scene.settings,
        connectedPlayerIds: context.connectedPlayerIds
      },
      command
    );
    if (!authorization.allowed) return { status: "REJECTED", reason: authorization.reason };

    const state = structuredClone(context.state);
    const rejected = this.apply(state, command);
    if (rejected) return { status: "REJECTED", reason: rejected };
    state.scene.revision += 1;
    return { status: "ACCEPTED", state };
  }

  private apply(state: CommandState, command: ArmyCommand): string | undefined {
    switch (command.type) {
      case "REGISTER_ARMY": {
        if (state.armies[command.itemId]) return "ALREADY_REGISTERED";
        if (!state.scene.sides.some((side) => side.id === command.sideId)) return "SIDE_NOT_FOUND";
        const registered: ArmyState = {
          version: 1,
          registered: true,
          sideId: command.sideId,
          status: "READY",
          overrides: {},
          route: [],
          currentWaypointIndex: 0,
          segmentProgressCells: 0,
          ignoresMovementBarriers: false,
          ignoresVisionBarriers: false,
          revision: 1
        };
        if (command.directOwnerPlayerId) registered.directOwnerPlayerId = command.directOwnerPlayerId;
        state.armies[command.itemId] = registered;
        return undefined;
      }
      case "UNREGISTER_ARMY":
        if (!state.armies[command.armyId]) return "ARMY_NOT_FOUND";
        state.armies = Object.fromEntries(
          Object.entries(state.armies).filter(([armyId]) => armyId !== command.armyId)
        );
        state.scene.battleGroups = state.scene.battleGroups
          .map((group) => ({
            ...group,
            participantIds: group.participantIds.filter((id) => id !== command.armyId)
          }))
          .filter((group) => group.participantIds.length >= 2);
        return undefined;
      case "CREATE_SIDE":
        if (state.scene.sides.some((side) => side.id === command.side.id)) return "SIDE_EXISTS";
        state.scene.sides.push(command.side);
        return undefined;
      case "RENAME_SIDE": {
        const side = state.scene.sides.find((candidate) => candidate.id === command.sideId);
        if (!side) return "SIDE_NOT_FOUND";
        side.name = command.name;
        return undefined;
      }
      case "DELETE_SIDE": {
        if (!state.scene.sides.some((side) => side.id === command.sideId)) return "SIDE_NOT_FOUND";
        if (command.strategy === "REASSIGN_ARMIES") {
          if (!command.targetSideId || !state.scene.sides.some((side) => side.id === command.targetSideId)) {
            return "TARGET_SIDE_NOT_FOUND";
          }
          for (const [armyId, army] of Object.entries(state.armies)) {
            if (army.sideId === command.sideId) {
              state.armies[armyId] = bumpArmy(army, { sideId: command.targetSideId });
            }
          }
        } else {
          state.armies = Object.fromEntries(
            Object.entries(state.armies).filter(([, army]) => army.sideId !== command.sideId)
          );
        }
        state.scene.sides = state.scene.sides.filter((side) => side.id !== command.sideId);
        const relations: SceneState["relations"] = {};
        for (const [left, entries] of Object.entries(state.scene.relations)) {
          if (left === command.sideId) continue;
          relations[left] = Object.fromEntries(
            Object.entries(entries).filter(([right]) => right !== command.sideId)
          );
        }
        state.scene.relations = relations;
        return undefined;
      }
      case "ADD_SIDE_PLAYER":
      case "REMOVE_SIDE_PLAYER": {
        const side = state.scene.sides.find((candidate) => candidate.id === command.sideId);
        if (!side) return "SIDE_NOT_FOUND";
        if (command.type === "ADD_SIDE_PLAYER") {
          side.playerIds = [...new Set([...side.playerIds, command.playerId])];
        } else {
          side.playerIds = side.playerIds.filter((playerId) => playerId !== command.playerId);
        }
        return undefined;
      }
      case "SET_RELATION": {
        const leftRelations = state.scene.relations[command.leftSideId] ?? {};
        const rightRelations = state.scene.relations[command.rightSideId] ?? {};
        leftRelations[command.rightSideId] = command.relation;
        rightRelations[command.leftSideId] = command.relation;
        state.scene.relations[command.leftSideId] = leftRelations;
        state.scene.relations[command.rightSideId] = rightRelations;
        return undefined;
      }
      case "UPDATE_SETTINGS":
        state.scene.settings = { ...state.scene.settings, ...command.settings };
        return undefined;
      case "UPDATE_ARMY_OVERRIDES":
        return updateArmy(state, command.armyId, (army) =>
          bumpArmy(army, { overrides: { ...army.overrides, ...command.overrides } })
        )
          ? undefined
          : "ARMY_NOT_FOUND";
      case "SET_ROUTE":
        return updateArmy(state, command.armyId, (army) =>
          bumpArmy(army, {
            route: command.route.map((point) => ({ ...point })),
            currentWaypointIndex: 0,
            segmentProgressCells: 0,
            status: "READY"
          })
        )
          ? undefined
          : "ARMY_NOT_FOUND";
      case "CLEAR_ROUTE":
        return updateArmy(state, command.armyId, (army) =>
          bumpArmy(army, { route: [], currentWaypointIndex: 0, segmentProgressCells: 0, status: "READY" })
        )
          ? undefined
          : "ARMY_NOT_FOUND";
      case "MOVE_ARMY":
        if (!state.armies[command.armyId]) return "ARMY_NOT_FOUND";
        state.positions ??= {};
        state.positions[command.armyId] = { ...command.position };
        return undefined;
      case "START_ARMY":
      case "RESUME_ARMY":
        return updateArmy(state, command.armyId, (army) => bumpArmy(army, { status: "MOVING" }))
          ? undefined
          : "ARMY_NOT_FOUND";
      case "PAUSE_ARMY":
        return updateArmy(state, command.armyId, (army) => bumpArmy(army, { status: "PAUSED" }))
          ? undefined
          : "ARMY_NOT_FOUND";
      case "STOP_ARMY":
        return updateArmy(state, command.armyId, (army) =>
          bumpArmy(army, { status: "READY", currentWaypointIndex: 0, segmentProgressCells: 0 })
        )
          ? undefined
          : "ARMY_NOT_FOUND";
      case "START_ALL":
      case "RESUME_ALL":
      case "PAUSE_ALL":
      case "STOP_ALL":
        for (const [armyId, army] of Object.entries(state.armies)) {
          const status =
            command.type === "START_ALL" || command.type === "RESUME_ALL"
              ? "MOVING"
              : command.type === "PAUSE_ALL"
                ? "PAUSED"
                : "READY";
          state.armies[armyId] = bumpArmy(army, { status });
        }
        return undefined;
      case "CREATE_BARRIER":
        if (state.barriers[command.itemId]) return "BARRIER_EXISTS";
        state.barriers[command.itemId] = command.barrier;
        return undefined;
      case "UPDATE_BARRIER": {
        const barrier = state.barriers[command.itemId];
        if (!barrier) return "BARRIER_NOT_FOUND";
        state.barriers[command.itemId] = {
          ...barrier,
          ...command.barrier,
          version: 1,
          revision: barrier.revision + 1
        };
        return undefined;
      }
      case "DELETE_BARRIER":
        if (!state.barriers[command.itemId]) return "BARRIER_NOT_FOUND";
        state.barriers = Object.fromEntries(
          Object.entries(state.barriers).filter(([itemId]) => itemId !== command.itemId)
        );
        return undefined;
      case "RELEASE_BATTLE_GROUP": {
        const result = releaseBattleGroup(
          state.scene.battleGroups,
          new Map(Object.entries(state.armies)),
          command.battleId
        );
        state.scene.battleGroups = result.groups;
        state.armies = Object.fromEntries(result.armies);
        return undefined;
      }
      case "REMOVE_BATTLE_PARTICIPANT": {
        const group = state.scene.battleGroups.find((candidate) => candidate.battleId === command.battleId);
        if (!group || !group.participantIds.includes(command.armyId)) return "PARTICIPANT_NOT_FOUND";
        group.participantIds = group.participantIds.filter((armyId) => armyId !== command.armyId);
        group.revision += 1;
        if (group.participantIds.length < 2) {
          state.scene.battleGroups = state.scene.battleGroups.filter(
            (candidate) => candidate.battleId !== command.battleId
          );
        }
        updateArmy(state, command.armyId, (army) => bumpArmy(army, { status: "PAUSED" }));
        return undefined;
      }
      default: {
        const exhaustive: never = command;
        return exhaustive;
      }
    }
  }
}
