import { joinReinforcements, releaseBattleGroup } from "../battles/battleGroupService";
import { destroyArmy } from "../armies/armyLifecycle";
import { healArmy } from "../health/armyHealth";
import { requestArmyDisband } from "../disband/disbandService";
import { cancelTurnDeferral, completeTurn, deferTurn, pauseAutoTurns, resumeAutoTurns } from "../turns/turnService";
import { parseCellKey } from "../grid/strategicGrid";
import { applyCellPatchBatch, readCell } from "../terrain/gridMap";
import { validatePlannedRoute } from "../movement/movementRules";
import { unenteredRouteCells } from "../movement/strategicProgress";
import { createRegisteredShip, destroyShip } from "../naval/ships/shipLifecycle";
import { SHIP_CLASSES } from "../naval/ships/shipClasses";
import { cellSupportsDomain } from "../terrain/movementDomains";
import { authorizeArmyCommand } from "../shared/permissions";
import { METADATA_KEYS } from "../shared/constants";
import type {
  ArmyCommand,
  ArmyState,
  BarrierState,
  SceneItemRecord,
  SceneState,
  NavalSceneState,
  GridCellCoord,
  ShipState,
  Vector2
} from "../shared/types";
import { applyShipStrategicRouteCommand } from "./shipStrategicRouteCommand";
import { applyForwardTacticalStep, applyTacticalTurn, forwardCell } from "../naval/battle/navalTacticalMovement";
import { endNavalShipTurn } from "../naval/battle/navalRoundFlow";
import { setActiveNavalShipOverride } from "../naval/battle/navalTurnOverride";
import { confirmNavalShipExit } from "../naval/battle/navalExit";
import { completeNavalBattle, startNavalBattle } from "../naval/battle/navalBattleLifecycle";
import { createNavalBattleRequest } from "../naval/battle/navalBattleRequest";
import { embarkArmy, disembarkArmy, validateTransportInteraction } from "../naval/transport/transportRules";
import { commitHospitalSupport } from "../naval/hospital/hospitalSupport";
import { commitShoreBombardment, type ShoreBombardmentSectorResolver } from "../naval/shore/shoreBombardment";

export interface CommandState {
  scene: SceneState;
  armies: Record<string, ArmyState>;
  barriers: Record<string, BarrierState>;
  items: Record<string, SceneItemRecord>;
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

function commandPosition(state: CommandState, id: string): Vector2 | undefined {
  return state.positions?.[id] ?? state.items[id]?.position;
}

function sameCell(left: GridCellCoord, right: GridCellCoord): boolean {
  return left.x === right.x && left.y === right.y;
}

function relationForSides(scene: SceneState, leftSideId: string, rightSideId: string): "ALLY" | "NEUTRAL" | "ENEMY" {
  if (leftSideId === rightSideId) return "ALLY";
  return scene.relations[leftSideId]?.[rightSideId] ?? scene.relations[rightSideId]?.[leftSideId] ?? "NEUTRAL";
}

function destroyReciprocalTransportCargo(
  state: CommandState,
  shipId: string,
  ship: ShipState
): void {
  if (ship.classId !== "TRANSPORT" || ship.embarkedArmyId == null) return;
  const cargoId = ship.embarkedArmyId;
  const cargo = state.armies[cargoId];
  if (!cargo || cargo.embarkedOnShipId !== shipId) return;
  const destroyed = destroyArmy(state.armies, state.scene.battleGroups, cargoId);
  state.armies = destroyed.armies;
  state.scene.battleGroups = destroyed.battleGroups;
  state.scene.transportEmbarkRequests = (state.scene.transportEmbarkRequests ?? [])
    .filter((request) => request.shipId !== shipId && request.armyId !== cargoId);
}

function emptyPlannedRoute(startCell: GridCellCoord = { x: 0, y: 0 }): ArmyState["plannedRoute"] {
  return {
    startCell: { ...startCell },
    executeOnTurn: 0,
    cells: [],
    totalCostUnits: 0,
    validatedRevision: 0,
    requiresReplan: false
  };
}

function revalidateArmyRoute(state: CommandState, armyId: string): void {
  const army = state.armies[armyId];
  if (!army || army.plannedRoute.requiresReplan || army.plannedRoute.cells.length === 0) return;
  const enteredCount = Math.max(
    0,
    Math.min(army.plannedRoute.cells.length, army.movement.enteredRouteCellCount)
  );
  const remainingCells = unenteredRouteCells(army.plannedRoute.cells, enteredCount);
  const remainingStart = enteredCount === 0
    ? army.plannedRoute.startCell
    : army.plannedRoute.cells[enteredCount - 1] ?? army.plannedRoute.startCell;
  const result = validatePlannedRoute({
    start: remainingStart,
    cells: remainingCells,
    sideId: army.sideId,
    terrain: state.scene.terrain,
    wars: state.scene.wars,
    remainingUnits: army.plannedRoute.executeOnTurn > state.scene.turn.turnNumber
      ? 10
      : army.movement.remainingUnits,
    readCell: (cell) => readCell(state.scene.gridMap, cell),
    armyStateAllowsMovement: army.status === "READY" || army.status === "PAUSED" || army.status === "MOVING"
  });
  const plannedRoute: ArmyState["plannedRoute"] = result.valid
    ? {
        startCell: { ...army.plannedRoute.startCell },
        executeOnTurn: army.plannedRoute.executeOnTurn,
        cells: army.plannedRoute.cells.map((cell) => ({ ...cell })),
        totalCostUnits: result.totalCostUnits,
        validatedRevision: state.scene.revision + 1,
        requiresReplan: false
      }
    : {
        ...army.plannedRoute,
        totalCostUnits: result.totalCostUnits,
        validatedRevision: state.scene.revision + 1,
        requiresReplan: false,
        invalidReason: result.reason,
        invalidCell: { ...result.problemCell }
      };
  state.armies[armyId] = bumpArmy(army, { plannedRoute });
}

function revalidateAllRoutes(state: CommandState): void {
  for (const armyId of Object.keys(state.armies)) revalidateArmyRoute(state, armyId);
}

export class CommandProcessor {
  constructor(
    private readonly now: () => Date = () => new Date(),
    private readonly cellForPosition?: (position: Vector2) => GridCellCoord,
    private readonly positionForCell?: (cell: GridCellCoord) => Vector2,
    private readonly detectedNavalTargetsForSide: (sideId: string) => ReadonlySet<string> = () => new Set(),
    private readonly rollD6: () => number = () => Math.floor(Math.random() * 6) + 1,
    private readonly visibleArmyTargetsForSide: (sideId: string) => ReadonlySet<string> = () => new Set(),
    private readonly shoreBombardmentSectorResolver: ShoreBombardmentSectorResolver = () => false,
    private readonly shoreBombardmentDistanceCells: (from: GridCellCoord, to: GridCellCoord) => number = () => Number.POSITIVE_INFINITY,
    private readonly shoreBombardmentHasLineOfSight: (from: GridCellCoord, to: GridCellCoord) => boolean = () => false
  ) {}

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
        ships: new Map(Object.entries(context.state.scene.ships ?? {})),
        sides: context.state.scene.sides,
        settings: context.state.scene.settings,
        connectedPlayerIds: context.connectedPlayerIds
      },
      command
    );
    if (!authorization.allowed) return { status: "REJECTED", reason: authorization.reason };

    const state = structuredClone(context.state);
    const rejected = this.apply(state, command, context.connectedPlayerIds);
    if (rejected) return { status: "REJECTED", reason: rejected };
    state.scene.revision += 1;
    return { status: "ACCEPTED", state };
  }

  private navalTacticalFailure(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "Ship is not active") return "SHIP_NOT_ACTIVE";
    if (message === "Ship already exited naval battle") return "SHIP_ALREADY_EXITED";
    if (message === "Outside naval battle area") return "OUTSIDE_NAVAL_BATTLE_AREA";
    if (message === "Insufficient naval movement") return "INSUFFICIENT_NAVAL_MOVEMENT";
    if (message === "Naval action already used") return "NAVAL_ACTION_ALREADY_USED";
    return "INVALID_NAVAL_TACTICAL_ACTION";
  }

  private apply(
    state: CommandState,
    command: ArmyCommand,
    connectedPlayerIds: ReadonlySet<string>
  ): string | undefined {
    switch (command.type) {
      case "REGISTER_ARMY": {
        const item = state.items[command.itemId];
        if (!item) return "ITEM_NOT_FOUND";
        if (item.type !== "IMAGE") return "IMAGE_REQUIRED";
        if (state.armies[command.itemId] || item.metadata[METADATA_KEYS.army] !== undefined) {
          return "ALREADY_REGISTERED";
        }
        if (!state.scene.sides.some((side) => side.id === command.sideId)) return "SIDE_NOT_FOUND";
        const maxUnits = 10;
        const registered: ArmyState = {
          version: 3,
          registered: true,
          sideId: command.sideId,
          status: "READY",
          overrides: {},
          route: [],
          plannedRoute: emptyPlannedRoute(),
          movement: { maxUnits, remainingUnits: maxUnits, enteredRouteCellCount: 0 },
          health: { hp: 50, maxHp: 50 },
          supply: { supplied: true, checkedOnTurn: 0 },
          disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
          currentWaypointIndex: 0,
          segmentProgressCells: 0,
          ignoresMovementBarriers: false,
          ignoresVisionBarriers: false,
          revision: 1
        };
        state.armies[command.itemId] = registered;
        return undefined;
      }
      case "UNREGISTER_ARMY": {
        if (!state.armies[command.armyId]) return "ARMY_NOT_FOUND";
        const destroyed = destroyArmy(state.armies, state.scene.battleGroups, command.armyId);
        state.armies = destroyed.armies;
        state.scene.battleGroups = destroyed.battleGroups;
        return undefined;
      }
      case "REGISTER_SHIP": {
        const item = state.items[command.itemId];
        if (!item) return "ITEM_NOT_FOUND";
        if (item.type !== "IMAGE") return "IMAGE_REQUIRED";
        state.scene.ships ??= {};
        if (
          state.armies[command.itemId] ||
          item.metadata[METADATA_KEYS.army] !== undefined ||
          state.scene.ships[command.itemId] ||
          item.metadata[METADATA_KEYS.ship] !== undefined
        ) {
          return "ALREADY_REGISTERED";
        }
        if (!state.scene.sides.some((side) => side.id === command.sideId)) return "SIDE_NOT_FOUND";
        if (!this.cellForPosition) return "SHIP_REQUIRES_SEA";
        const cell = this.cellForPosition(item.position);
        if (!cellSupportsDomain(state.scene, cell, "SEA")) return "SHIP_REQUIRES_SEA";
        state.scene.ships[command.itemId] = createRegisteredShip(
          command.sideId,
          command.classId,
          command.facing
        );
        return undefined;
      }
      case "UNREGISTER_SHIP": {
        const ship = state.scene.ships?.[command.shipId];
        if (!ship) return "SHIP_NOT_FOUND";
        destroyReciprocalTransportCargo(state, command.shipId, ship);
        const sceneRevision = state.scene.revision;
        const destroyed = destroyShip(state.scene as NavalSceneState, command.shipId);
        state.scene = destroyed.scene;
        state.scene.revision = sceneRevision;
        return undefined;
      }
      case "SET_SHIP_ROUTE":
        return applyShipStrategicRouteCommand(state, command, this.cellForPosition);
      case "EMBARK_ARMY": {
        if (state.scene.turn.phase !== "MOVEMENT") return "NOT_MOVEMENT_PHASE";
        const ship = state.scene.ships?.[command.shipId];
        if (!ship) return "SHIP_NOT_FOUND";
        const army = state.armies[command.armyId];
        if (!army) return "ARMY_NOT_FOUND";
        if (!this.cellForPosition) return "TRANSPORT_POSITION_UNAVAILABLE";
        const shipPosition = commandPosition(state, command.shipId);
        const armyPosition = commandPosition(state, command.armyId);
        if (!shipPosition || !armyPosition) return "TRANSPORT_POSITION_UNAVAILABLE";
        const shipCell = this.cellForPosition(shipPosition);
        const armyCell = this.cellForPosition(armyPosition);
        const geometry = validateTransportInteraction({
          action: "EMBARK",
          phase: state.scene.turn.phase,
          ship,
          army,
          shipCell,
          interactionCell: armyCell,
          sameCellSupportsLandAndSea: sameCell(shipCell, armyCell) &&
            cellSupportsDomain(state.scene, shipCell, "LAND") &&
            cellSupportsDomain(state.scene, shipCell, "SEA")
        });
        if (!geometry.ok) return geometry.reason;
        if (ship.sideId !== army.sideId) {
          state.scene.transportEmbarkRequests ??= [];
          state.scene.transportEmbarkRequests = state.scene.transportEmbarkRequests
            .filter((request) => request.shipId !== command.shipId && request.armyId !== command.armyId);
          state.scene.transportEmbarkRequests.push({
            id: command.requestId,
            shipId: command.shipId,
            armyId: command.armyId
          });
          return undefined;
        }
        const embarked = embarkArmy(command.shipId, ship, command.armyId, army);
        state.scene.ships ??= {};
        state.scene.ships[command.shipId] = embarked.ship;
        state.armies[command.armyId] = embarked.army;
        return undefined;
      }
      case "ACCEPT_EMBARK_ARMY": {
        if (state.scene.turn.phase !== "MOVEMENT") return "NOT_MOVEMENT_PHASE";
        const request = state.scene.transportEmbarkRequests?.find((candidate) =>
          candidate.id === command.embarkRequestId &&
          candidate.shipId === command.shipId &&
          candidate.armyId === command.armyId
        );
        if (!request) return "EMBARK_REQUEST_NOT_FOUND";
        const ship = state.scene.ships?.[command.shipId];
        if (!ship) return "SHIP_NOT_FOUND";
        const army = state.armies[command.armyId];
        if (!army) return "ARMY_NOT_FOUND";
        if (!this.cellForPosition) return "TRANSPORT_POSITION_UNAVAILABLE";
        const shipPosition = commandPosition(state, command.shipId);
        const armyPosition = commandPosition(state, command.armyId);
        if (!shipPosition || !armyPosition) return "TRANSPORT_POSITION_UNAVAILABLE";
        const shipCell = this.cellForPosition(shipPosition);
        const armyCell = this.cellForPosition(armyPosition);
        const geometry = validateTransportInteraction({
          action: "EMBARK",
          phase: state.scene.turn.phase,
          ship,
          army,
          shipCell,
          interactionCell: armyCell,
          sameCellSupportsLandAndSea: sameCell(shipCell, armyCell) &&
            cellSupportsDomain(state.scene, shipCell, "LAND") &&
            cellSupportsDomain(state.scene, shipCell, "SEA")
        });
        if (!geometry.ok) return geometry.reason;
        const embarked = embarkArmy(command.shipId, ship, command.armyId, army);
        state.scene.ships ??= {};
        state.scene.ships[command.shipId] = embarked.ship;
        state.armies[command.armyId] = embarked.army;
        state.scene.transportEmbarkRequests = (state.scene.transportEmbarkRequests ?? [])
          .filter((candidate) => candidate.id !== request.id);
        return undefined;
      }
      case "DISEMBARK_ARMY": {
        if (state.scene.turn.phase !== "MOVEMENT") return "NOT_MOVEMENT_PHASE";
        const ship = state.scene.ships?.[command.shipId];
        if (!ship) return "SHIP_NOT_FOUND";
        const army = state.armies[command.armyId];
        if (!army) return "ARMY_NOT_FOUND";
        if (!this.cellForPosition || !this.positionForCell) return "TRANSPORT_POSITION_UNAVAILABLE";
        const shipPosition = commandPosition(state, command.shipId);
        if (!shipPosition) return "TRANSPORT_POSITION_UNAVAILABLE";
        if (!cellSupportsDomain(state.scene, command.targetCell, "LAND")) return "LANDING_REQUIRES_LAND";
        const shipCell = this.cellForPosition(shipPosition);
        const geometry = validateTransportInteraction({
          action: "DISEMBARK",
          phase: state.scene.turn.phase,
          ship,
          army,
          shipCell,
          interactionCell: command.targetCell,
          sameCellSupportsLandAndSea: sameCell(shipCell, command.targetCell) &&
            cellSupportsDomain(state.scene, shipCell, "LAND") &&
            cellSupportsDomain(state.scene, shipCell, "SEA")
        });
        if (!geometry.ok) return geometry.reason;
        const disembarked = disembarkArmy(command.shipId, ship, command.armyId, army);
        if (!disembarked.ok) return disembarked.reason;
        const occupantIds = Object.entries(state.armies)
          .filter(([armyId, candidate]) => armyId !== command.armyId && candidate.health.hp > 0 && candidate.embarkedOnShipId == null)
          .filter(([armyId]) => {
            const position = commandPosition(state, armyId);
            return position ? sameCell(this.cellForPosition?.(position) ?? { x: NaN, y: NaN }, command.targetCell) : false;
          })
          .map(([armyId]) => armyId);
        const nonEnemyOccupant = occupantIds.find((armyId) => {
          const occupant = state.armies[armyId];
          return occupant ? relationForSides(state.scene, army.sideId, occupant.sideId) !== "ENEMY" : false;
        });
        if (nonEnemyOccupant) return "LANDING_CELL_OCCUPIED";
        state.scene.ships ??= {};
        state.scene.ships[command.shipId] = disembarked.ship;
        state.armies[command.armyId] = disembarked.army;
        state.positions ??= {};
        state.positions[command.armyId] = this.positionForCell(command.targetCell);
        const enemyOccupants = occupantIds.filter((armyId) => {
          const occupant = state.armies[armyId];
          return occupant ? relationForSides(state.scene, army.sideId, occupant.sideId) === "ENEMY" : false;
        });
        if (enemyOccupants.length > 0) {
          const contacts = enemyOccupants.map((armyId) => [command.armyId, armyId] as const);
          state.scene.battleGroups = joinReinforcements(state.scene.battleGroups, contacts, () => command.requestId);
          const group = state.scene.battleGroups.find((candidate) => candidate.participantIds.includes(command.armyId));
          if (group) {
            for (const participantId of group.participantIds) {
              const participant = state.armies[participantId];
              if (!participant) continue;
              state.armies[participantId] = bumpArmy(participant, {
                status: "IN_BATTLE",
                stopReason: "BATTLE",
                movement: { ...participant.movement, remainingUnits: 0 },
                battleGroupId: group.battleId
              });
            }
          }
        }
        return undefined;
      }
      case "REQUEST_NAVAL_BATTLE": {
        const initiatingShip = state.scene.ships?.[command.initiatingShipId];
        if (!initiatingShip) return "SHIP_NOT_FOUND";
        const result = createNavalBattleRequest({
          scene: state.scene as NavalSceneState,
          requestId: command.requestId,
          initiatingShipId: command.initiatingShipId,
          targetShipId: command.targetShipId,
          detectedTargetShipIds: this.detectedNavalTargetsForSide(initiatingShip.sideId)
        });
        if (!result.ok) return result.reason;
        state.scene.navalBattleRequests ??= [];
        state.scene.navalBattleRequests.push(result.request);
        return undefined;
      }
      case "NAVAL_MOVE_FORWARD": {
        const battle = state.scene.activeNavalBattle;
        if (!battle || battle.status !== "ACTIVE") return "NO_ACTIVE_NAVAL_BATTLE";
        const ship = state.scene.ships?.[command.shipId];
        if (!ship) return "SHIP_NOT_FOUND";
        if (ship.status !== "IN_NAVAL_BATTLE" || ship.battleId !== battle.id) return "SHIP_NOT_IN_NAVAL_BATTLE";
        if (ship.hp <= 0) return "SHIP_DESTROYED";
        if (battle.currentShipId !== command.shipId) return "SHIP_NOT_ACTIVE";
        const position = state.positions?.[command.shipId] ?? state.items[command.shipId]?.position;
        if (!position || !this.cellForPosition || !this.positionForCell) return "SHIP_POSITION_UNAVAILABLE";
        const from = this.cellForPosition(position);
        try {
          const result = applyForwardTacticalStep(
            battle, command.shipId, ship, from, forwardCell(from, ship.facing)
          );
          state.scene.activeNavalBattle = result.battle;
          state.positions ??= {};
          state.positions[command.shipId] = this.positionForCell(result.destination);
          return undefined;
        } catch (error) {
          return this.navalTacticalFailure(error);
        }
      }
      case "NAVAL_TURN_SHIP": {
        const battle = state.scene.activeNavalBattle;
        if (!battle || battle.status !== "ACTIVE") return "NO_ACTIVE_NAVAL_BATTLE";
        const ship = state.scene.ships?.[command.shipId];
        if (!ship) return "SHIP_NOT_FOUND";
        if (ship.status !== "IN_NAVAL_BATTLE" || ship.battleId !== battle.id) return "SHIP_NOT_IN_NAVAL_BATTLE";
        if (ship.hp <= 0) return "SHIP_DESTROYED";
        if (battle.currentShipId !== command.shipId) return "SHIP_NOT_ACTIVE";
        try {
          const result = applyTacticalTurn(battle, command.shipId, ship, command.direction);
          state.scene.activeNavalBattle = result.battle;
          state.scene.ships ??= {};
          state.scene.ships[command.shipId] = result.ship;
          return undefined;
        } catch (error) {
          return this.navalTacticalFailure(error);
        }
      }
      case "NAVAL_SHORE_BOMBARDMENT": {
        const ship = state.scene.ships?.[command.shipId];
        if (!ship) return "SHIP_NOT_FOUND";
        const target = state.armies[command.armyId];
        if (!target) return "ARMY_NOT_FOUND";
        if (!this.cellForPosition) return "NAVAL_POSITION_UNAVAILABLE";
        const shipPosition = commandPosition(state, command.shipId);
        const targetPosition = commandPosition(state, command.armyId);
        if (!shipPosition || !targetPosition) return "NAVAL_POSITION_UNAVAILABLE";
        const shipCell = this.cellForPosition(shipPosition);
        const targetCell = this.cellForPosition(targetPosition);
        const activeBattle = state.scene.activeNavalBattle?.status === "ACTIVE"
          ? state.scene.activeNavalBattle
          : undefined;
        const result = commitShoreBombardment({
          attackerId: command.shipId,
          attacker: ship,
          targetId: command.armyId,
          target,
          attackerCell: shipCell,
          targetCell,
          currentTurn: state.scene.turn.turnNumber,
          targetVisible: this.visibleArmyTargetsForSide(ship.sideId).has(command.armyId),
          targetCellSupportsLand:
            target.embarkedOnShipId == null && cellSupportsDomain(state.scene, targetCell, "LAND"),
          sectorResolver: this.shoreBombardmentSectorResolver,
          distanceCells: this.shoreBombardmentDistanceCells,
          hasLineOfSight: this.shoreBombardmentHasLineOfSight,
          ...(activeBattle ? { battle: activeBattle, battleShips: state.scene.ships ?? {} } : {}),
          rollD6: this.rollD6
        });
        if (!result.ok) return result.reason;
        state.scene.ships ??= {};
        state.scene.ships[command.shipId] = result.attacker;
        if (result.target.health.hp <= 0) {
          const destroyed = destroyArmy(state.armies, state.scene.battleGroups, command.armyId);
          state.armies = destroyed.armies;
          state.scene.battleGroups = destroyed.battleGroups;
        } else {
          state.armies[command.armyId] = result.target;
        }
        if (result.battle) state.scene.activeNavalBattle = result.battle;
        return undefined;
      }
      case "NAVAL_HOSPITAL_SUPPORT": {
        const battle = state.scene.activeNavalBattle;
        if (!battle || battle.status !== "ACTIVE") return "NO_ACTIVE_NAVAL_BATTLE";
        const hospital = state.scene.ships?.[command.shipId];
        if (!hospital) return "SHIP_NOT_FOUND";
        const target = state.scene.ships?.[command.targetShipId];
        if (!target) return "TARGET_SHIP_NOT_FOUND";
        if (
          hospital.status !== "IN_NAVAL_BATTLE" ||
          hospital.battleId !== battle.id ||
          !battle.participantShipIds.includes(command.shipId)
        ) return "SHIP_NOT_IN_NAVAL_BATTLE";
        if (
          target.status !== "IN_NAVAL_BATTLE" ||
          target.battleId !== battle.id ||
          !battle.participantShipIds.includes(command.targetShipId)
        ) return "TARGET_NOT_IN_NAVAL_BATTLE";
        if (!this.cellForPosition) return "NAVAL_POSITION_UNAVAILABLE";
        const hospitalPosition = commandPosition(state, command.shipId);
        const targetPosition = commandPosition(state, command.targetShipId);
        if (!hospitalPosition || !targetPosition) return "NAVAL_POSITION_UNAVAILABLE";
        const result = commitHospitalSupport({
          battle,
          ships: state.scene.ships ?? {},
          hospitalId: command.shipId,
          targetId: command.targetShipId,
          hospital,
          target,
          hospitalCell: this.cellForPosition(hospitalPosition),
          targetCell: this.cellForPosition(targetPosition),
          rollD6: this.rollD6
        });
        if (!result.ok) return result.reason;
        state.scene.ships ??= {};
        state.scene.ships[command.targetShipId] = result.target;
        state.scene.activeNavalBattle = result.battle;
        return undefined;
      }
      case "CONFIRM_NAVAL_SHIP_EXIT": {
        const battle = state.scene.activeNavalBattle;
        if (!battle || battle.status !== "ACTIVE") return "NO_ACTIVE_NAVAL_BATTLE";
        const ship = state.scene.ships?.[command.shipId];
        if (!ship) return "SHIP_NOT_FOUND";
        if (ship.status !== "IN_NAVAL_BATTLE" || ship.battleId !== battle.id) return "SHIP_NOT_IN_NAVAL_BATTLE";
        if (ship.hp <= 0) return "SHIP_DESTROYED";
        try {
          state.scene.activeNavalBattle = confirmNavalShipExit(
            battle,
            state.scene.ships ?? {},
            command.shipId
          );
          if (ship.temporaryHp > 0) {
            state.scene.ships ??= {};
            state.scene.ships[command.shipId] = {
              ...ship,
              temporaryHp: 0,
              revision: ship.revision + 1
            };
          }
          return undefined;
        } catch (error) {
          return this.navalTacticalFailure(error);
        }
      }
      case "END_NAVAL_SHIP_TURN": {
        const battle = state.scene.activeNavalBattle;
        if (!battle || battle.status !== "ACTIVE") return "NO_ACTIVE_NAVAL_BATTLE";
        const ship = state.scene.ships?.[command.shipId];
        if (!ship) return "SHIP_NOT_FOUND";
        if (ship.status !== "IN_NAVAL_BATTLE" || ship.battleId !== battle.id) return "SHIP_NOT_IN_NAVAL_BATTLE";
        if (ship.hp <= 0) return "SHIP_DESTROYED";
        if (battle.currentShipId !== command.shipId) return "SHIP_NOT_ACTIVE";
        try {
          state.scene.activeNavalBattle = endNavalShipTurn(battle, state.scene.ships ?? {}, command.shipId);
          return undefined;
        } catch (error) {
          return this.navalTacticalFailure(error);
        }
      }
      case "SET_ACTIVE_NAVAL_SHIP": {
        const battle = state.scene.activeNavalBattle;
        if (!battle || battle.status !== "ACTIVE") return "NO_ACTIVE_NAVAL_BATTLE";
        const override = setActiveNavalShipOverride(
          battle,
          state.scene.ships ?? {},
          command.shipId
        );
        if (!override.ok) return override.reason;
        state.scene.activeNavalBattle = override.battle;
        return undefined;
      }
      case "START_NAVAL_BATTLE": {
        if (command.areaCells.some((cell) => !cellSupportsDomain(state.scene, cell, "SEA"))) {
          return "INVALID_NAVAL_BATTLE_AREA";
        }
        if (!this.cellForPosition) return "SHIP_POSITION_UNAVAILABLE";
        const snapshots: Record<string, import("../shared/types").NavalBattleShipSnapshot> = {};
        for (const shipId of command.participantShipIds) {
          const ship = state.scene.ships?.[shipId];
          if (!ship) return "SHIP_NOT_FOUND";
          const position = state.positions?.[shipId] ?? state.items[shipId]?.position;
          if (!position) return "SHIP_POSITION_UNAVAILABLE";
          snapshots[shipId] = {
            shipId,
            strategicCell: this.cellForPosition(position),
            strategicPosition: { ...position },
            strategicFacing: ship.facing
          };
        }
        const sceneRevision = state.scene.revision;
        try {
          const started = startNavalBattle(state.scene as NavalSceneState, {
            battleId: command.battleId,
            requestId: command.navalRequestId,
            initiatingShipId: command.initiatingShipId,
            participantShipIds: command.participantShipIds,
            areaCells: command.areaCells,
            snapshots,
            startedAt: this.now().getTime(),
            rollD20: () => Math.floor(Math.random() * 20) + 1
          });
          started.revision = sceneRevision;
          state.scene = started;
          return undefined;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (message === "Naval battle already active") return "NAVAL_BATTLE_ALREADY_ACTIVE";
          if (message.startsWith("Destroyed naval battle participant:")) return "SHIP_DESTROYED";
          if (message.startsWith("Missing naval battle participant:")) return "SHIP_NOT_FOUND";
          return "INVALID_NAVAL_BATTLE";
        }
      }
      case "COMPLETE_NAVAL_BATTLE": {
        const battle = state.scene.activeNavalBattle;
        if (!battle || battle.status !== "ACTIVE") return "NO_ACTIVE_NAVAL_BATTLE";
        const sceneRevision = state.scene.revision;
        const completed = completeNavalBattle(state.scene as NavalSceneState);
        completed.revision = sceneRevision;
        state.positions ??= {};
        for (const [shipId, snapshot] of Object.entries(battle.snapshots)) {
          const ship = completed.ships[shipId];
          if (!ship) continue;
          completed.ships[shipId] = {
            ...ship,
            facing: snapshot.strategicFacing
          };
          state.positions[shipId] = { ...snapshot.strategicPosition };
        }
        state.scene = completed;
        return undefined;
      }
      case "SET_SHIP_DETECTION_OVERRIDE": {
        const ship = state.scene.ships?.[command.shipId];
        if (!ship) return "SHIP_NOT_FOUND";
        state.scene.ships ??= {};
        state.scene.ships[command.shipId] = {
          ...ship,
          detectionOverride: command.detectionOverride,
          revision: ship.revision + 1
        };
        return undefined;
      }
      case "SET_SHIP_HP": {
        const ship = state.scene.ships?.[command.shipId];
        if (!ship) return "SHIP_NOT_FOUND";
        const maxHp = SHIP_CLASSES[ship.classId].maxHp;
        if (command.hp > maxHp) return "INVALID_HP";
        if (command.hp <= 0) {
          destroyReciprocalTransportCargo(state, command.shipId, ship);
        }
        state.scene.ships ??= {};
        state.scene.ships[command.shipId] = {
          ...ship,
          hp: command.hp,
          embarkedArmyId: command.hp <= 0 && ship.classId === "TRANSPORT"
            ? null
            : ship.embarkedArmyId,
          revision: ship.revision + 1
        };
        const battle = state.scene.activeNavalBattle;
        if (
          command.hp <= 0 &&
          battle?.status === "ACTIVE" &&
          battle.currentShipId === command.shipId &&
          ship.status === "IN_NAVAL_BATTLE" &&
          ship.battleId === battle.id
        ) {
          state.scene.activeNavalBattle = endNavalShipTurn(
            battle,
            state.scene.ships,
            command.shipId
          );
        }
        return undefined;
      }
      case "CREATE_SIDE":
        if (state.scene.sides.some((side) => side.id === command.side.id)) return "SIDE_EXISTS";
        state.scene.sides.push({
          ...command.side,
          playerIds: [...new Set([...command.side.playerIds, ...command.side.leaderPlayerIds])],
          leaderPlayerIds: [...new Set(command.side.leaderPlayerIds)],
          stateId: command.side.stateId ?? null
        });
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
          return "ARMY_TRANSFER_FORBIDDEN";
        } else {
          const removedArmyIds = new Set(
            Object.entries(state.armies)
              .filter(([, army]) => army.sideId === command.sideId)
              .map(([armyId]) => armyId)
          );
          state.armies = Object.fromEntries(
            Object.entries(state.armies).filter(([, army]) => army.sideId !== command.sideId)
          );
          state.scene.battleGroups = state.scene.battleGroups
            .map((group) => {
              const participantIds = group.participantIds.filter(
                (armyId) => !removedArmyIds.has(armyId)
              );
              if (participantIds.length === group.participantIds.length) return group;
              return {
                ...group,
                participantIds,
                revision: group.revision + 1
              };
            })
            .filter((group) => group.participantIds.length >= 2);

          const sceneRevision = state.scene.revision;
          const removedShipIds = Object.entries(state.scene.ships ?? {})
            .filter(([, ship]) => ship.sideId === command.sideId)
            .map(([shipId]) => shipId);
          for (const shipId of removedShipIds) {
            const destroyed = destroyShip(state.scene as NavalSceneState, shipId);
            state.scene = destroyed.scene;
            state.scene.revision = sceneRevision;
          }
        }
        state.scene.sides = state.scene.sides.filter((side) => side.id !== command.sideId);
        if (state.scene.navalRevealUntilTurn) {
          state.scene.navalRevealUntilTurn = Object.fromEntries(
            Object.entries(state.scene.navalRevealUntilTurn)
              .filter(([sideId]) => sideId !== command.sideId)
          );
        }
        for (const stateEntity of state.scene.states) {
          if (stateEntity.rulingFactionId === command.sideId) stateEntity.rulingFactionId = null;
        }
        const relations: SceneState["relations"] = {};
        for (const [left, entries] of Object.entries(state.scene.relations)) {
          if (left === command.sideId) continue;
          relations[left] = Object.fromEntries(
            Object.entries(entries).filter(([right]) => right !== command.sideId)
          );
        }
        state.scene.relations = relations;
        state.scene.wars = state.scene.wars
          .map((war) => ({ ...war, participantFactionIds: war.participantFactionIds.filter((id) => id !== command.sideId) }))
          .filter((war) => war.participantFactionIds.length >= 2 || war.participantStateIds.length >= 2);
        const gridOperations = Object.entries(state.scene.gridMap.cells).flatMap(([key, cell]) => {
          if (!cell.factionTerritoryIds.includes(command.sideId)) return [];
          const parsed = parseCellKey(key);
          return [{ cell: parsed, patch: { factionTerritoryIds: cell.factionTerritoryIds.filter((id) => id !== command.sideId) } }];
        });
        state.scene.gridMap = applyCellPatchBatch(state.scene.gridMap, gridOperations);
        revalidateAllRoutes(state);
        return undefined;
      }
      case "ADD_SIDE_PLAYER":
      case "REMOVE_SIDE_PLAYER": {
        const side = state.scene.sides.find((candidate) => candidate.id === command.sideId);
        if (!side) return "SIDE_NOT_FOUND";
        if (command.type === "ADD_SIDE_PLAYER") {
          if (!connectedPlayerIds.has(command.playerId)) return "PLAYER_NOT_CONNECTED";
          side.playerIds = [...new Set([...side.playerIds, command.playerId])];
        } else {
          if (side.leaderPlayerIds.includes(command.playerId)) return "PLAYER_IS_LEADER";
          side.playerIds = side.playerIds.filter((playerId) => playerId !== command.playerId);
        }
        return undefined;
      }
      case "ADD_SIDE_LEADER":
      case "REMOVE_SIDE_LEADER": {
        const side = state.scene.sides.find((candidate) => candidate.id === command.sideId);
        if (!side) return "SIDE_NOT_FOUND";
        if (command.type === "ADD_SIDE_LEADER") {
          if (!connectedPlayerIds.has(command.playerId)) return "PLAYER_NOT_CONNECTED";
          side.playerIds = [...new Set([...side.playerIds, command.playerId])];
          side.leaderPlayerIds = [...new Set([...side.leaderPlayerIds, command.playerId])];
        } else {
          side.leaderPlayerIds = side.leaderPlayerIds.filter(
            (playerId) => playerId !== command.playerId
          );
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
      case "UPDATE_ARMY_OVERRIDES": {
        const army = state.armies[command.armyId];
        if (!army) return "ARMY_NOT_FOUND";
        const overrides = { ...army.overrides, ...command.overrides };
        state.armies[command.armyId] = bumpArmy(army, { overrides });
        revalidateArmyRoute(state, command.armyId);
        return undefined;
      }
      case "SET_ROUTE": {
        const army = state.armies[command.armyId];
        if (!army) return "ARMY_NOT_FOUND";
        if (army.status !== "READY") return "ARMY_NOT_READY";
        if (command.route.length !== command.cells.length) return "INVALID_COMMAND";
        const validation = validatePlannedRoute({
          start: command.startCell,
          cells: command.cells,
          sideId: army.sideId,
          terrain: state.scene.terrain,
          wars: state.scene.wars,
          remainingUnits: 10,
          readCell: (cell) => readCell(state.scene.gridMap, cell),
          armyStateAllowsMovement: true
        });
        if (!validation.valid) return validation.reason;
        state.armies[command.armyId] = bumpArmy(army, {
          route: command.route.map((point) => ({ ...point })),
          movement: { ...army.movement, enteredRouteCellCount: 0 },
          plannedRoute: {
            startCell: { ...command.startCell },
            executeOnTurn: state.scene.turn.turnNumber + 1,
            cells: command.cells.map((cell) => ({ ...cell })),
            totalCostUnits: validation.totalCostUnits,
            validatedRevision: state.scene.revision + 1,
            requiresReplan: false
          },
          currentWaypointIndex: 0,
          segmentProgressCells: 0
        });
        return undefined;
      }
      case "CLEAR_ROUTE": {
        const army = state.armies[command.armyId];
        if (!army) return "ARMY_NOT_FOUND";
        if (army.status !== "READY") return "ARMY_NOT_READY";
        state.armies[command.armyId] = bumpArmy(army, {
          route: [],
          plannedRoute: emptyPlannedRoute(army.plannedRoute.startCell),
          movement: { ...army.movement, enteredRouteCellCount: 0 },
          currentWaypointIndex: 0,
          segmentProgressCells: 0
        });
        return undefined;
      }
      case "MOVE_ARMY":
        if (!state.armies[command.armyId]) return "ARMY_NOT_FOUND";
        state.positions ??= {};
        state.positions[command.armyId] = { ...command.position };
        return undefined;
      case "START_ARMY":
      case "RESUME_ARMY": {
        const army = state.armies[command.armyId];
        if (!army) return "ARMY_NOT_FOUND";
        revalidateArmyRoute(state, command.armyId);
        const current = state.armies[command.armyId];
        if (!current) return "ARMY_NOT_FOUND";
        if (current.stopReason === "BATTLE") return "MOVEMENT_CONSUMED_FOR_TURN";
        if (current.plannedRoute.executeOnTurn !== state.scene.turn.turnNumber) return "ROUTE_NOT_ACTIVE_TURN";
        if (current.plannedRoute.requiresReplan) return "ROUTE_REQUIRES_REPLAN";
        if (current.plannedRoute.invalidReason) return current.plannedRoute.invalidReason;
        if (current.route.length === 0 || current.plannedRoute.cells.length === 0) return "ROUTE_EMPTY";
        state.armies[command.armyId] = bumpArmy(current, { status: "MOVING" });
        return undefined;
      }
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
        if (command.type === "START_ALL" || command.type === "RESUME_ALL") revalidateAllRoutes(state);
        for (const [armyId, army] of Object.entries(state.armies)) {
          let status: ArmyState["status"];
          if (command.type === "START_ALL" || command.type === "RESUME_ALL") {
            status = army.stopReason !== "BATTLE" &&
              army.plannedRoute.executeOnTurn === state.scene.turn.turnNumber &&
              !army.plannedRoute.requiresReplan && !army.plannedRoute.invalidReason && army.route.length > 0
              ? "MOVING"
              : army.status;
          } else status = command.type === "PAUSE_ALL" ? "PAUSED" : "READY";
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
      case "RENAME_BATTLE_GROUP": {
        const group = state.scene.battleGroups.find(
          (candidate) => candidate.battleId === command.battleId
        );
        if (!group) return "BATTLE_NOT_FOUND";
        group.name = command.name.trim();
        group.revision += 1;
        return undefined;
      }
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
      case "SET_TERRAIN_CELLS": {
        if (command.terrainId !== null && !state.scene.terrain.types[command.terrainId]) return "TERRAIN_NOT_FOUND";
        state.scene.gridMap = applyCellPatchBatch(state.scene.gridMap, command.cells.map((cell) => ({ cell, patch: { terrainId: command.terrainId } })));
        revalidateAllRoutes(state);
        return undefined;
      }
      case "SET_IMPASSABLE_CELLS":
        state.scene.gridMap = applyCellPatchBatch(state.scene.gridMap, command.cells.map((cell) => ({ cell, patch: { impassable: command.impassable } })));
        revalidateAllRoutes(state);
        return undefined;
      case "UPDATE_FACTION_TERRITORY_CELLS": {
        if (!state.scene.sides.some((side) => side.id === command.sideId)) return "SIDE_NOT_FOUND";
        state.scene.gridMap = applyCellPatchBatch(state.scene.gridMap, command.cells.map((cell) => {
          const current = readCell(state.scene.gridMap, cell).factionTerritoryIds;
          const next = command.operation === "ADD"
            ? [...new Set([...current, command.sideId])]
            : current.filter((id) => id !== command.sideId);
          return { cell, patch: { factionTerritoryIds: next } };
        }));
        revalidateAllRoutes(state);
        return undefined;
      }
      case "CLEAR_CELL_PROPERTIES": {
        if (command.target === "SELECTED_FACTION" && (!command.sideId || !state.scene.sides.some((side) => side.id === command.sideId))) return "SIDE_NOT_FOUND";
        state.scene.gridMap = applyCellPatchBatch(state.scene.gridMap, command.cells.map((cell) => {
          const current = readCell(state.scene.gridMap, cell);
          if (command.target === "TERRAIN") return { cell, patch: { terrainId: null } };
          if (command.target === "IMPASSABLE") return { cell, patch: { impassable: false } };
          if (command.target === "SELECTED_FACTION") return { cell, patch: { factionTerritoryIds: current.factionTerritoryIds.filter((id) => id !== command.sideId) } };
          if (command.target === "RECOGNIZED_STATE") return { cell, patch: { recognizedStateId: null } };
          if (command.target === "DEFACTO_STATE") return { cell, patch: { deFactoStateId: null } };
          return { cell, patch: { terrainId: null, impassable: false, factionTerritoryIds: [], recognizedStateId: null, deFactoStateId: null } };
        }));
        revalidateAllRoutes(state);
        return undefined;
      }
      case "CREATE_TERRAIN_TYPE":
        if (state.scene.terrain.types[command.terrain.id]) return "TERRAIN_EXISTS";
        state.scene.terrain.types[command.terrain.id] = { ...command.terrain };
        return undefined;
      case "UPDATE_TERRAIN_TYPE": {
        const terrain = state.scene.terrain.types[command.terrainId];
        if (!terrain) return "TERRAIN_NOT_FOUND";
        state.scene.terrain.types[command.terrainId] = { ...terrain, ...command.patch, id: command.terrainId };
        revalidateAllRoutes(state);
        return undefined;
      }
      case "DELETE_TERRAIN_TYPE": {
        if (!state.scene.terrain.types[command.terrainId]) return "TERRAIN_NOT_FOUND";
        if (command.terrainId === state.scene.terrain.defaultTerrainId) return "DEFAULT_TERRAIN_REQUIRED";
        const replacement = command.replacementTerrainId ?? state.scene.terrain.defaultTerrainId;
        if (!state.scene.terrain.types[replacement]) return "TERRAIN_NOT_FOUND";
        Reflect.deleteProperty(state.scene.terrain.types, command.terrainId);
        const operations = Object.entries(state.scene.gridMap.cells).flatMap(([key, cell]) => {
          if (cell.terrainId !== command.terrainId) return [];
          const parsed = parseCellKey(key);
          return [{ cell: parsed, patch: { terrainId: replacement === state.scene.terrain.defaultTerrainId ? null : replacement } }];
        });
        state.scene.gridMap = applyCellPatchBatch(state.scene.gridMap, operations);
        revalidateAllRoutes(state);
        return undefined;
      }
      case "CREATE_STATE":
        if (state.scene.states.some((candidate) => candidate.id === command.state.id)) return "STATE_EXISTS";
        if (command.state.rulingFactionId && !state.scene.sides.some((side) => side.id === command.state.rulingFactionId)) return "SIDE_NOT_FOUND";
        state.scene.states.push(structuredClone(command.state));
        return undefined;
      case "UPDATE_STATE": {
        const current = state.scene.states.find((candidate) => candidate.id === command.stateId);
        if (!current) return "STATE_NOT_FOUND";
        if (command.patch.rulingFactionId && !state.scene.sides.some((side) => side.id === command.patch.rulingFactionId)) return "SIDE_NOT_FOUND";
        Object.assign(current, command.patch);
        return undefined;
      }
      case "DELETE_STATE": {
        if (!state.scene.states.some((candidate) => candidate.id === command.stateId)) return "STATE_NOT_FOUND";
        state.scene.states = state.scene.states.filter((candidate) => candidate.id !== command.stateId);
        for (const side of state.scene.sides) if (side.stateId === command.stateId) side.stateId = null;
        const operations = Object.entries(state.scene.gridMap.cells).flatMap(([key, cell]) => {
          if (cell.recognizedStateId !== command.stateId && cell.deFactoStateId !== command.stateId) return [];
          const parsed = parseCellKey(key);
          return [{
            cell: parsed,
            patch: {
              ...(cell.recognizedStateId === command.stateId ? { recognizedStateId: null } : {}),
              ...(cell.deFactoStateId === command.stateId ? { deFactoStateId: null } : {})
            }
          }];
        });
        state.scene.gridMap = applyCellPatchBatch(state.scene.gridMap, operations);
        state.scene.wars = state.scene.wars
          .map((war) => ({ ...war, participantStateIds: war.participantStateIds.filter((id) => id !== command.stateId) }))
          .filter((war) => war.participantFactionIds.length >= 2 || war.participantStateIds.length >= 2);
        return undefined;
      }
      case "SET_SIDE_STATE": {
        const side = state.scene.sides.find((candidate) => candidate.id === command.sideId);
        if (!side) return "SIDE_NOT_FOUND";
        if (command.stateId !== null && !state.scene.states.some((candidate) => candidate.id === command.stateId)) return "STATE_NOT_FOUND";
        side.stateId = command.stateId;
        return undefined;
      }
      case "SET_RECOGNIZED_STATE_CELLS":
        if (command.stateId !== null && !state.scene.states.some((candidate) => candidate.id === command.stateId)) return "STATE_NOT_FOUND";
        state.scene.gridMap = applyCellPatchBatch(state.scene.gridMap, command.cells.map((cell) => ({ cell, patch: { recognizedStateId: command.stateId } })));
        return undefined;
      case "SET_DEFACTO_STATE_CELLS":
        if (command.stateId !== null && !state.scene.states.some((candidate) => candidate.id === command.stateId)) return "STATE_NOT_FOUND";
        state.scene.gridMap = applyCellPatchBatch(state.scene.gridMap, command.cells.map((cell) => ({ cell, patch: { deFactoStateId: command.stateId } })));
        return undefined;
      case "SET_ARMY_HP": {
        const army = state.armies[command.armyId];
        if (!army) return "ARMY_NOT_FOUND";
        const maxHp = command.maxHp ?? army.health.maxHp;
        if (maxHp <= 0 || command.hp < 0) return "INVALID_HP";
        const hp = Math.min(command.hp, maxHp);
        if (hp === 0) {
          const destroyed = destroyArmy(state.armies, state.scene.battleGroups, command.armyId);
          state.armies = destroyed.armies;
          state.scene.battleGroups = destroyed.battleGroups;
          return undefined;
        }
        state.armies[command.armyId] = bumpArmy(army, { health: { hp, maxHp } });
        return undefined;
      }
      case "HEAL_ARMY": {
        const army = state.armies[command.armyId];
        if (!army) return "ARMY_NOT_FOUND";
        const healed = healArmy(army, command.amount);
        if (!healed) return army.supply.supplied ? "ARMY_DESTROYED" : "ARMY_ENCIRCLED";
        state.armies[command.armyId] = healed;
        return undefined;
      }
      case "REQUEST_ARMY_DISBAND": {
        const army = state.armies[command.armyId];
        if (!army) return "ARMY_NOT_FOUND";
        const requested = requestArmyDisband(army, state.scene.turn.turnNumber, command.senderPlayerId);
        if (!requested) return "DISBAND_ALREADY_REQUESTED";
        state.armies[command.armyId] = requested;
        return undefined;
      }
      case "CREATE_WAR":
        if (state.scene.wars.some((war) => war.id === command.war.id)) return "WAR_EXISTS";
        if (command.war.participantFactionIds.some((id) => !state.scene.sides.some((side) => side.id === id))) return "SIDE_NOT_FOUND";
        if (command.war.participantStateIds.some((id) => !state.scene.states.some((stateEntity) => stateEntity.id === id))) return "STATE_NOT_FOUND";
        state.scene.wars.push(structuredClone(command.war));
        revalidateAllRoutes(state);
        return undefined;
      case "UPDATE_WAR": {
        const index = state.scene.wars.findIndex((war) => war.id === command.warId);
        if (index < 0) return "WAR_NOT_FOUND";
        const current = state.scene.wars[index];
        if (!current) return "WAR_NOT_FOUND";
        const next = { ...current, ...command.patch, id: current.id };
        if (next.participantFactionIds.some((id) => !state.scene.sides.some((side) => side.id === id))) return "SIDE_NOT_FOUND";
        if (next.participantStateIds.some((id) => !state.scene.states.some((stateEntity) => stateEntity.id === id))) return "STATE_NOT_FOUND";
        state.scene.wars[index] = next;
        revalidateAllRoutes(state);
        return undefined;
      }
      case "END_WAR": {
        const war = state.scene.wars.find((candidate) => candidate.id === command.warId);
        if (!war) return "WAR_NOT_FOUND";
        war.active = false;
        revalidateAllRoutes(state);
        return undefined;
      }
      case "DEFER_TURN": {
        const until = new Date(command.until);
        const result = deferTurn(state.scene.turn, until, this.now());
        if (!result.ok) return result.reason;
        state.scene.turn = result.turn;
        return undefined;
      }
      case "CANCEL_TURN_DEFERRAL":
        state.scene.turn = cancelTurnDeferral(state.scene.turn, this.now());
        return undefined;
      case "PAUSE_AUTO_TURNS":
        state.scene.turn = pauseAutoTurns(state.scene.turn);
        return undefined;
      case "RESUME_AUTO_TURNS":
        state.scene.turn = resumeAutoTurns(state.scene.turn, this.now());
        return undefined;
      case "COMPLETE_TURN_NOW": {
        const armyCells = Object.fromEntries(Object.entries(state.armies).flatMap(([armyId]) => {
          const position = state.positions?.[armyId];
          if (!position || !this.cellForPosition) return [];
          return [[armyId, this.cellForPosition(position)]];
        }));
        const hasStateBoundArmyWithoutCell = Object.entries(state.armies).some(([armyId, army]) => {
          const side = state.scene.sides.find((candidate) => candidate.id === army.sideId);
          return Boolean(side?.stateId) && !armyCells[armyId];
        });
        if (hasStateBoundArmyWithoutCell) return "TURN_POSITION_UNAVAILABLE";
        const result = completeTurn(state.scene, state.armies, {
          source: "MANUAL",
          completedAt: this.now(),
          armyCells
        });
        if (!result.changed) return result.reason;
        state.scene = result.scene;
        state.armies = result.armies;
        return undefined;
      }
      default:
        return "INVALID_COMMAND";
    }
  }
}
