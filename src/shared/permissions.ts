import type { ArmyCommand, ArmyState, SceneSettings, ShipState, Side } from "./types";

export interface AuthorizationContext {
  role: "GM" | "PLAYER";
  playerId: string;
  armies: ReadonlyMap<string, ArmyState>;
  ships?: ReadonlyMap<string, ShipState>;
  sides: readonly Side[];
  settings: SceneSettings;
  connectedPlayerIds: ReadonlySet<string>;
}

export type AuthorizationResult =
  | { allowed: true }
  | {
      allowed: false;
      reason:
        | "GM_ONLY"
        | "NOT_SIDE_LEADER"
        | "ARMY_NOT_FOUND"
        | "SHIP_NOT_FOUND"
        | "SIDE_NOT_FOUND"
        | "NOT_FACTION_MEMBER"
        | "SENDER_MISMATCH";
    };

function ledBy(context: AuthorizationContext, sideId: string): AuthorizationResult {
  const side = context.sides?.find((candidate) => candidate.id === sideId);
  if (!side) return { allowed: false, reason: "SIDE_NOT_FOUND" };
  if (!side.leaderPlayerIds.includes(context.playerId)) {
    return { allowed: false, reason: "NOT_SIDE_LEADER" };
  }
  return { allowed: true };
}

export function authorizeArmyCommand(
  context: AuthorizationContext,
  command: ArmyCommand
): AuthorizationResult {
  if (command.senderPlayerId !== context.playerId) {
    return { allowed: false, reason: "SENDER_MISMATCH" };
  }
  if (context.role === "GM") return { allowed: true };

  if (command.type === "ADD_SIDE_PLAYER" || command.type === "REMOVE_SIDE_PLAYER") {
    return ledBy(context, command.sideId);
  }

  if (command.type === "REQUEST_ARMY_DISBAND") {
    const army = context.armies.get(command.armyId);
    if (!army) return { allowed: false, reason: "ARMY_NOT_FOUND" };
    const side = context.sides.find((candidate) => candidate.id === army.sideId);
    if (!side) return { allowed: false, reason: "SIDE_NOT_FOUND" };
    return side.playerIds.includes(context.playerId)
      ? { allowed: true }
      : { allowed: false, reason: "NOT_FACTION_MEMBER" };
  }

  if (command.type === "SET_ROUTE" || command.type === "CLEAR_ROUTE") {
    const army = context.armies.get(command.armyId);
    if (!army) return { allowed: false, reason: "ARMY_NOT_FOUND" };
    return ledBy(context, army.sideId);
  }

  if (command.type === "REQUEST_NAVAL_BATTLE") {
    const ship = context.ships?.get(command.initiatingShipId);
    if (!ship) return { allowed: false, reason: "SHIP_NOT_FOUND" };
    return ledBy(context, ship.sideId);
  }

  if (command.type === "EMBARK_ARMY" || command.type === "DISEMBARK_ARMY") {
    const ship = context.ships?.get(command.shipId);
    if (!ship) return { allowed: false, reason: "SHIP_NOT_FOUND" };
    return ledBy(context, ship.sideId);
  }

  if (command.type === "ACCEPT_EMBARK_ARMY") {
    const army = context.armies.get(command.armyId);
    if (!army) return { allowed: false, reason: "ARMY_NOT_FOUND" };
    return ledBy(context, army.sideId);
  }

  if (
    command.type === "SET_SHIP_ROUTE" ||
    command.type === "NAVAL_MOVE_FORWARD" ||
    command.type === "NAVAL_TURN_SHIP" ||
    command.type === "END_NAVAL_SHIP_TURN" ||
    command.type === "NAVAL_HOSPITAL_SUPPORT" ||
    command.type === "NAVAL_SHORE_BOMBARDMENT"
  ) {
    const ship = context.ships?.get(command.shipId);
    if (!ship) return { allowed: false, reason: "SHIP_NOT_FOUND" };
    return ledBy(context, ship.sideId);
  }

  return { allowed: false, reason: "GM_ONLY" };
}
