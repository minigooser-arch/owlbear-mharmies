import type { ArmyCommand, ArmyState, SceneSettings } from "./types";

export interface AuthorizationContext {
  role: "GM" | "PLAYER";
  playerId: string;
  armies: ReadonlyMap<string, ArmyState>;
  settings: SceneSettings;
  connectedPlayerIds: ReadonlySet<string>;
}

export type AuthorizationResult =
  | { allowed: true }
  | {
      allowed: false;
      reason:
        | "GM_ONLY"
        | "NOT_DIRECT_OWNER"
        | "OWNER_DISCONNECTED"
        | "PLAYER_ROUTES_DISABLED"
        | "PLAYER_START_DISABLED"
        | "ARMY_NOT_FOUND"
        | "SENDER_MISMATCH";
    };

function armyIdForOwnerCommand(command: ArmyCommand): string | undefined {
  switch (command.type) {
    case "SET_ROUTE":
    case "CLEAR_ROUTE":
    case "MOVE_ARMY":
    case "START_ARMY":
    case "PAUSE_ARMY":
    case "RESUME_ARMY":
    case "STOP_ARMY":
      return command.armyId;
    default:
      return undefined;
  }
}

export function authorizeArmyCommand(
  context: AuthorizationContext,
  command: ArmyCommand
): AuthorizationResult {
  if (command.senderPlayerId !== context.playerId) {
    return { allowed: false, reason: "SENDER_MISMATCH" };
  }
  if (context.role === "GM") return { allowed: true };

  const armyId = armyIdForOwnerCommand(command);
  if (!armyId) return { allowed: false, reason: "GM_ONLY" };
  const army = context.armies.get(armyId);
  if (!army) return { allowed: false, reason: "ARMY_NOT_FOUND" };
  if (army.directOwnerPlayerId !== context.playerId) {
    return { allowed: false, reason: "NOT_DIRECT_OWNER" };
  }
  if (!context.connectedPlayerIds.has(context.playerId)) {
    return { allowed: false, reason: "OWNER_DISCONNECTED" };
  }
  if (
    (command.type === "SET_ROUTE" || command.type === "CLEAR_ROUTE" || command.type === "MOVE_ARMY") &&
    !context.settings.allowPlayersToCreateRoutes
  ) {
    return { allowed: false, reason: "PLAYER_ROUTES_DISABLED" };
  }
  if (
    (command.type === "START_ARMY" ||
      command.type === "PAUSE_ARMY" ||
      command.type === "RESUME_ARMY" ||
      command.type === "STOP_ARMY") &&
    !context.settings.allowPlayersToStartOwnArmies
  ) {
    return { allowed: false, reason: "PLAYER_START_DISABLED" };
  }
  return { allowed: true };
}
