import type {
  GridCellCoord,
  NavalBattleShipSnapshot,
  NavalBattleState,
  NavalSceneState
} from "../../shared/types";
import { applyBattleRevealUntilNextTurn } from "../detection/navalVisibility";
import { rollNavalInitiative, type RollD20 } from "./navalInitiative";
import { startNavalRound } from "./navalRoundFlow";

export interface StartNavalBattleInput {
  battleId: string;
  requestId: string | null;
  initiatingShipId: string;
  participantShipIds: readonly string[];
  areaCells: readonly GridCellCoord[];
  snapshots: Readonly<Record<string, NavalBattleShipSnapshot>>;
  startedAt: number;
  rollD20: RollD20;
}

function cloneCell(cell: GridCellCoord): GridCellCoord {
  return { x: cell.x, y: cell.y };
}

function cloneSnapshot(snapshot: NavalBattleShipSnapshot): NavalBattleShipSnapshot {
  return {
    shipId: snapshot.shipId,
    strategicCell: cloneCell(snapshot.strategicCell),
    strategicPosition: { ...snapshot.strategicPosition },
    strategicFacing: snapshot.strategicFacing
  };
}

export function startNavalBattle(
  scene: NavalSceneState,
  input: StartNavalBattleInput
): NavalSceneState {
  if (scene.activeNavalBattle) throw new Error("Naval battle already active");

  const participantShipIds = [...new Set(input.participantShipIds)];
  if (!participantShipIds.includes(input.initiatingShipId)) {
    throw new Error("Initiating ship must participate");
  }

  const snapshots: Record<string, NavalBattleShipSnapshot> = {};
  for (const shipId of participantShipIds) {
    const participant = scene.ships[shipId];
    if (!participant) throw new Error(`Missing naval battle participant: ${shipId}`);
    if (participant.hp <= 0) throw new Error(`Destroyed naval battle participant: ${shipId}`);

    const snapshot = input.snapshots[shipId];
    if (!snapshot) throw new Error(`Missing naval battle snapshot: ${shipId}`);
    if (snapshot.shipId !== shipId) throw new Error(`Invalid naval battle snapshot: ${shipId}`);
    snapshots[shipId] = cloneSnapshot(snapshot);
  }

  const initiatingShip = scene.ships[input.initiatingShipId];
  if (!initiatingShip) throw new Error(`Missing naval battle participant: ${input.initiatingShipId}`);

  const initiative = rollNavalInitiative(
    participantShipIds,
    input.initiatingShipId,
    input.rollD20
  );

  const baseBattle: NavalBattleState = {
    version: 1,
    id: input.battleId,
    requestId: input.requestId,
    initiatorSideId: initiatingShip.sideId,
    areaCells: input.areaCells.map(cloneCell),
    participantShipIds,
    snapshots,
    initiative,
    roundNumber: 1,
    currentShipId: null,
    completedShipIdsThisRound: [],
    movementRemainingByShip: {},
    actionUsedByShip: {},
    exitedShipIds: [],
    status: "ACTIVE",
    events: [],
    startedOnTurn: scene.turn.turnNumber,
    startedAt: input.startedAt,
    revision: 0
  };

  const next = structuredClone(scene);
  for (const shipId of participantShipIds) {
    const participant = next.ships[shipId];
    if (!participant) continue;
    participant.status = "IN_NAVAL_BATTLE";
    participant.battleId = input.battleId;
    participant.revision += 1;
  }

  const activeBattle = startNavalRound(baseBattle, next.ships);
  next.activeNavalBattle = activeBattle;
  next.turn.phase = "POST_MOVEMENT";
  if (input.requestId !== null) {
    next.navalBattleRequests = next.navalBattleRequests.filter(
      (request) => request.id !== input.requestId
    );
  }
  next.navalRevealUntilTurn = applyBattleRevealUntilNextTurn({
    ships: next.ships,
    battle: activeBattle,
    revealUntilTurn: next.navalRevealUntilTurn,
    currentTurn: next.turn.turnNumber
  });
  next.revision += 1;
  return next;
}

export function completeNavalBattle(scene: NavalSceneState): NavalSceneState {
  const activeBattle = scene.activeNavalBattle;
  if (!activeBattle) throw new Error("No active naval battle");

  const next = structuredClone(scene);
  const completedBattle = structuredClone(activeBattle);
  completedBattle.status = "COMPLETED";
  completedBattle.currentShipId = null;
  completedBattle.revision += 1;

  for (const shipId of activeBattle.participantShipIds) {
    const participant = next.ships[shipId];
    if (!participant || participant.battleId !== activeBattle.id) continue;
    participant.status = "READY";
    participant.battleId = null;
    participant.temporaryHp = 0;
    participant.revision += 1;
  }

  next.navalBattleHistory.push(completedBattle);
  next.activeNavalBattle = null;
  next.turn.phase = "POST_MOVEMENT";
  next.revision += 1;
  return next;
}
