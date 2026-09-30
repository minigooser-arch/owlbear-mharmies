import { joinReinforcements, releaseBattleGroup } from "../battles/battleGroupService";
import { destroyArmy } from "../armies/armyLifecycle";
import { canHealArmy, healArmyForTurn } from "../health/armyHealth";
import { applyFormationHp, createFormationArmy, interruptFormation } from "../armies/armyFormation";
import { appendLRTransaction } from "../finance/lrLedger";
import { markLRTransactionRecorded } from "../finance/lrLedger";
import { applyDemographyCorrection, debitHumanResource as debitHumanResourceFromState } from "../finance/humanResourceLedger";
import { recalculateHumanResourceCapacity } from "../population/populationRules";
import { isCityBuildingActive } from "../cities/cityBuildingRules";
import { activeShipyardAtCell, cityForCell, coastalBatteryRetaliationDamage, hasActiveCityBuilding, marineStationAllowsCrossing, repairShipAtShipyard, seaFortBlocksDisembark, transportArmyMovementCostAtCell } from "../cities/cityEffects";
import { requestArmyDisband } from "../disband/disbandService";
import { canRenumberTurn, cancelTurnDeferral, completeTurn, deferTurn, pauseAutoTurns, renumberSceneTurn, resumeAutoTurns } from "../turns/turnService";
import { preCheckpointTurnBlockers } from "../turns/turnCompletionGuard";
import { parseCellKey } from "../grid/strategicGrid";
import { applyCellPatchBatch, readCell } from "../terrain/gridMap";
import { validatePlannedRoute } from "../movement/movementRules";
import { applyDiplomacyForEnteredCells, politicalRouteGate } from "../movement/authoritativeStateMovement";
import { forcedExitRouteGate, reconcileForcedExitStates, validateForcedExitRoute } from "../movement/forcedExitService";
import { unenteredRouteCells } from "../movement/strategicProgress";
import { createRegisteredShip, destroyShip } from "../naval/ships/shipLifecycle";
import { resolvePlannedShipRoutes } from "../naval/ships/shipMovementPhase";
import { occupiedByOtherLiveShip } from "../naval/ships/shipCellOccupancy";
import { cellSupportsDomain } from "../terrain/movementDomains";
import { authorizeArmyCommand } from "../shared/permissions";
import { METADATA_KEYS } from "../shared/constants";
import type {
  ArmyCommand,
  ArmyState,
  BarrierState,
  ForcedExitReason,
  SceneItemRecord,
  SceneState,
  StateDemography,
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
import { commitBroadsideAttack } from "../naval/battle/navalBroadside";
import {
  activateCruiserInterception,
  removeCruiserInterceptionAfterDamage,
  resolveCruiserInterceptionsForStep
} from "../naval/interception/cruiserInterception";
import { hasNavalBattleLineOfSight } from "../naval/battle/navalBattleLineOfSight";
import { embarkArmy, disembarkArmy, shipEmbarkedArmyIds, validateTransportInteraction } from "../naval/transport/transportRules";
import { commitHospitalSupport } from "../naval/hospital/hospitalSupport";
import { commitShoreBombardment, type ShoreBombardmentSectorResolver } from "../naval/shore/shoreBombardment";
import { applyShipRevealUntilNextTurn } from "../naval/detection/navalVisibility";
import { createState, deleteState, setSideState, updateState } from "../states/stateService";
import { removeStateRelations, setMilitaryAccess, setPairWar } from "../states/stateRelations";
import { applyPeaceTransfer, validatePeaceTransfer } from "../territory/peaceTransfer";
import { closeRebellion, startRebellion } from "../rebellions/rebellionService";
import { startCivilWar } from "../rebellions/civilWarService";
import {
  armyRecoveryHpCap,
  landBattleExperience,
  purchaseArmyUpgrade,
  purchaseShipUpgrade,
  shipEffectiveArmor,
  shipEffectiveMaxHp,
  shipEffectiveMovement,
  armyEffectiveMovementUnits,
  terrainRegistryForArmy,
  transportLoadingIsFree
} from "../upgrades/unitUpgrades";

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
  if (ship.classId !== "TRANSPORT") return;
  const cargoIds = shipEmbarkedArmyIds(ship);
  for (const cargoId of cargoIds) {
    const cargo = state.armies[cargoId];
    if (!cargo || cargo.embarkedOnShipId !== shipId) continue;
    const destroyed = destroyArmy(state.armies, state.scene.battleGroups, cargoId);
    state.armies = destroyed.armies;
    state.scene.battleGroups = destroyed.battleGroups;
  }
  const cargoSet = new Set(cargoIds);
  state.scene.transportEmbarkRequests = (state.scene.transportEmbarkRequests ?? [])
    .filter((request) => request.shipId !== shipId && !cargoSet.has(request.armyId));
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
  const political = forcedExitRouteGate(state.scene, armyId, army, remainingStart, remainingCells) ?? politicalRouteGate({
    sideId: army.sideId,
    cells: remainingCells,
    gridMap: state.scene.gridMap,
    sides: state.scene.sides,
    states: state.scene.states,
    stateRelations: state.scene.stateRelations ?? {}
  });
  if (political.allowedCellCount < remainingCells.length && political.blockedReason && political.blockedCell) {
    state.armies[armyId] = bumpArmy(army, {
      plannedRoute: {
        ...army.plannedRoute,
        validatedRevision: state.scene.revision + 1,
        invalidReason: political.blockedReason,
        invalidCell: { ...political.blockedCell }
      }
    });
    return;
  }
  const result = validatePlannedRoute({
    start: remainingStart,
    cells: remainingCells,
    sideId: army.sideId,
    terrain: terrainRegistryForArmy(army, state.scene.terrain),
    wars: state.scene.wars,
    remainingUnits: army.plannedRoute.executeOnTurn > state.scene.turn.turnNumber
      ? armyEffectiveMovementUnits(army)
      : army.movement.remainingUnits,
    readCell: (cell) => readCell(state.scene.gridMap, cell),
    armyStateAllowsMovement: !army.formation?.active && (army.status === "READY" || army.status === "PAUSED" || army.status === "MOVING")
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

function startRoutesForMovementPhase(state: CommandState): void {
  const turnNumber = state.scene.turn.turnNumber;
  for (const [armyId, army] of Object.entries(state.armies)) {
    if (army.plannedRoute.executeOnTurn !== turnNumber + 1 || army.status === "IN_BATTLE" || army.formation?.active) continue;
    revalidateArmyRoute(state, armyId);
    const current = state.armies[armyId];
    if (
      !current ||
      current.status === "IN_BATTLE" ||
      current.stopReason === "BATTLE" ||
      current.plannedRoute.requiresReplan ||
      current.plannedRoute.invalidReason ||
      current.route.length === 0 ||
      current.plannedRoute.cells.length === 0
    ) {
      continue;
    }
    state.armies[armyId] = bumpArmy(current, {
      status: "MOVING",
      plannedRoute: { ...current.plannedRoute, executeOnTurn: turnNumber },
      movement: {
        ...current.movement,
        remainingUnits: current.movement.maxUnits,
        enteredRouteCellCount: 0
      },
      currentWaypointIndex: 0,
      segmentProgressCells: 0
    });
  }
}

function reconcileForcedExits(state: CommandState, cellForPosition: ((position: Vector2) => GridCellCoord) | undefined, reason: ForcedExitReason): void {
  if (!cellForPosition) return;
  const cells = Object.fromEntries(Object.keys(state.armies).flatMap((armyId) => {
    const position = commandPosition(state, armyId);
    return position ? [[armyId, cellForPosition(position)]] : [];
  }));
  state.scene.forcedExitStates = reconcileForcedExitStates(
    state.scene, state.armies, cells, state.scene.turn.turnNumber + 1, reason
  );
}

/**
 * Demographic balances imported from the state sheet are stored in thousands
 * of people (584 means 584,000). Cost settings retain the rules' human-facing
 * values (5,000 LR per HP), so convert legacy/person units at the command
 * boundary for normalized demographic records. Older scenes may still carry
 * absolute-person balances above their capacity; those keep the old scale.
 */
function humanResourceRateInSceneUnits(state: CommandState, sideId: string, configuredRate: number): number {
  const side = state.scene.sides.find((candidate) => candidate.id === sideId);
  const demography = side?.stateId
    ? state.scene.demographics?.find((record) => record.stateId === side.stateId)
    : undefined;
  if (demography && configuredRate >= 1000 && demography.humanResource <= demography.humanResourceCapacity) {
    return configuredRate / 1000;
  }
  return configuredRate;
}

function demographicLawChanges(before: StateDemography, after: StateDemography): Record<string, { before: number; after: number }> {
  const changes: Record<string, { before: number; after: number }> = {};
  for (const key of ["conscriptionRate", "humanResourceCapacity", "humanResource"] as const) {
    if (before[key] !== after[key]) changes[key] = { before: before[key], after: after[key] };
  }
  return changes;
}

export class CommandProcessor {
  constructor(
    private readonly now: () => Date = () => new Date(),
    private readonly cellForPosition?: (position: Vector2) => GridCellCoord,
    private readonly positionForCell?: (cell: GridCellCoord) => Vector2,
    private readonly detectedNavalTargetsForSide: (sideId: string) => ReadonlySet<string> = () => new Set(),
    private readonly rollD6: () => number = () => Math.floor(Math.random() * 6) + 1,
    private readonly visibleArmyTargetsForSide: (sideId: string) => ReadonlySet<string> = () => new Set(),
    shoreBombardmentSectorResolver: ShoreBombardmentSectorResolver = () => false,
    shoreBombardmentDistanceCells: (from: GridCellCoord, to: GridCellCoord) => number = () => Number.POSITIVE_INFINITY,
    shoreBombardmentHasLineOfSight: (from: GridCellCoord, to: GridCellCoord) => boolean = () => false,
    shoreBombardmentWindowOpen: () => boolean = () => false
  ) {
    void shoreBombardmentSectorResolver;
    void shoreBombardmentDistanceCells;
    void shoreBombardmentHasLineOfSight;
    void shoreBombardmentWindowOpen;
  }

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

  private debitHumanResource(
    state: CommandState,
    sideId: string,
    amount: number,
    context: Parameters<typeof debitHumanResourceFromState>[3]
  ): string | undefined {
    if (amount <= 0 || state.scene.demographics === undefined) return undefined;
    const result = debitHumanResourceFromState(state.scene, sideId, amount, context);
    if (!result.ok) return result.reason;
    state.scene.demographics = state.scene.demographics.map((record) =>
      record.stateId === result.demography.stateId ? result.demography : record
    );
    state.scene.lrTransactions = appendLRTransaction(state.scene.lrTransactions ?? [], result.transaction);
    return undefined;
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
          health: { hp: 40, maxHp: 40 },
          supply: { supplied: true, checkedOnTurn: 0 },
          disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
          currentWaypointIndex: 0,
          segmentProgressCells: 0,
          ignoresMovementBarriers: false,
          ignoresVisionBarriers: false,
          revision: 1
        };
        state.armies[command.itemId] = registered;
        state.items[command.itemId] = { ...item, visible: false };
        return undefined;
      }
      case "CREATE_CITY_ARMY": {
        const city = (state.scene.strategicCities ?? []).find((candidate) => candidate.id === command.cityId);
        if (!city) return "CITY_NOT_FOUND";
        const militaryDepartment = (city.buildings ?? []).find((building) => building.type === "MILITARY_DEPARTMENT");
        if (!militaryDepartment || city.factionInfluenceId !== command.sideId ||
            !isCityBuildingActive(city, militaryDepartment, state.scene.gridMap, state.scene.states, state.scene.sides)) {
          return "MILITARY_DEPARTMENT_REQUIRED";
        }
        const side = state.scene.sides.find((candidate) => candidate.id === command.sideId);
        if (!side) return "SIDE_NOT_FOUND";
        const existingItem = command.itemId ? state.items[command.itemId] : undefined;
        if (command.itemId && (!existingItem || existingItem.type !== "IMAGE")) return existingItem ? "IMAGE_REQUIRED" : "ITEM_NOT_FOUND";
        const armyId = command.itemId ?? `army-${command.requestId}`;
        if (state.armies[armyId] || state.items[armyId]?.metadata[METADATA_KEYS.army] !== undefined) return "ALREADY_REGISTERED";
        if (!this.cellForPosition) return "CITY_POSITION_UNAVAILABLE";
        const cityCell = city.cells[0];
        if (!cityCell) return "CITY_POSITION_UNAVAILABLE";
        const itemPosition = existingItem?.position ?? this.positionForCell?.(cityCell);
        if (!itemPosition) return "CITY_POSITION_UNAVAILABLE";
        const existingCell = existingItem ? this.cellForPosition(existingItem.position) : undefined;
        if (existingItem && (!existingCell || !city.cells.some((cell) => sameCell(cell, existingCell)))) return "ARMY_MUST_BE_IN_CITY";
        if (!existingItem && !side.armyTokenAsset) return "ARMY_TOKEN_NOT_CONFIGURED";
        const army = createFormationArmy({
          armyId,
          sideId: command.sideId,
          status: "READY",
          maxUnits: 10,
          turnNumber: state.scene.turn.turnNumber,
          experience: (city.buildings ?? []).reduce(
            (total, building) => total + (building.type === "TRAINING_GROUND" || building.type === "MILITARY_ACADEMY" ? 0.5 : 0),
            0
          )
        });
        army.formation = { active: true, cityId: city.id, hpAddedThisTurn: 0, checkedOnTurn: state.scene.turn.turnNumber };
        state.armies[armyId] = army;
        if (!existingItem && side.armyTokenAsset) {
          state.items[armyId] = {
            id: armyId,
            type: "IMAGE",
            name: side.armyTokenAsset.name,
            position: itemPosition,
            rotation: side.armyTokenAsset.rotation ?? 0,
            scale: side.armyTokenAsset.scale ?? { x: 1, y: 1 },
            layer: "CHARACTER",
            // Authoritative army tokens stay hidden in the shared scene. Each player
            // receives a local clone only when the visibility engine allows it.
            visible: false,
            locked: false,
            metadata: {},
            image: structuredClone(side.armyTokenAsset.image),
            grid: structuredClone(side.armyTokenAsset.grid),
            ...(side.armyTokenAsset.description ? { description: side.armyTokenAsset.description } : {})
          };
          state.positions ??= {};
          state.positions[armyId] = itemPosition;
        } else if (existingItem) {
          state.items[armyId] = { ...existingItem, position: itemPosition };
        }
        state.items[armyId] = { ...state.items[armyId], metadata: { ...state.items[armyId]?.metadata, [METADATA_KEYS.army]: army } } as SceneItemRecord;
        return undefined;
      }
      case "FORM_ARMY": {
        const army = state.armies[command.armyId];
        if (!army) return "ARMY_NOT_FOUND";
        const formationRate = humanResourceRateInSceneUnits(state, army.sideId, state.scene.settings.armyFormationCostPerHp ?? 10000);
        const result = applyFormationHp(
          army,
          command.hp,
          state.scene.turn.turnNumber,
          formationRate,
          Boolean(army.formation?.cityId && hasActiveCityBuilding(state.scene, army.formation.cityId, "TRAINING_GROUND"))
        );
        if (!result.ok) return result.reason;
        const formationKind = result.army.health.hp >= result.army.health.maxHp ? "COMPLETION" : "FORMATION";
        const cityId = army.formation?.cityId ?? null;
        const cityName = (state.scene.strategicCities ?? []).find((city) => city.id === cityId)?.name ?? null;
        const formationDebit = this.debitHumanResource(state, army.sideId, result.amount, {
          requestId: command.requestId,
          actorPlayerId: command.senderPlayerId,
          kind: formationKind,
          armyId: command.armyId,
          armyName: command.armyId,
          cityId,
          cityName,
          hp: command.hp,
          ratePerHp: formationRate,
          turnNumber: state.scene.turn.turnNumber,
          createdAt: this.now().toISOString()
        });
        if (formationDebit) return formationDebit;
        state.armies[command.armyId] = result.army;
        if (state.scene.demographics === undefined) state.scene.lrTransactions = appendLRTransaction(state.scene.lrTransactions ?? [], {
          id: `${command.requestId}:formation`, requestId: command.requestId, createdAt: this.now().toISOString(), turnNumber: state.scene.turn.turnNumber,
          actorPlayerId: command.senderPlayerId, sideId: army.sideId, sideName: state.scene.sides.find((side) => side.id === army.sideId)?.name ?? army.sideId,
          cityId, cityName, armyId: command.armyId, armyName: command.armyId, kind: formationKind, hp: command.hp,
          ratePerHp: formationRate, amount: result.amount
        });
        return undefined;
      }
      case "UNREGISTER_ARMY": {
        if (!state.armies[command.armyId]) return "ARMY_NOT_FOUND";
        const destroyed = destroyArmy(state.armies, state.scene.battleGroups, command.armyId);
        state.armies = destroyed.armies;
        state.scene.battleGroups = destroyed.battleGroups;
        return undefined;
      }
      case "PURCHASE_ARMY_UPGRADE": {
        const army = state.armies[command.armyId];
        if (!army) return "ARMY_NOT_FOUND";
        const result = purchaseArmyUpgrade(army, command.branch, command.level, command.variant);
        if (!result.ok) return result.reason;
        state.armies[command.armyId] = result.army;
        return undefined;
      }
      case "RESOLVE_LAND_BATTLE": {
        const battle = state.scene.battleGroups.find((candidate) => candidate.battleId === command.battleId);
        if (!battle) return "BATTLE_NOT_FOUND";
        const participantIds = [...battle.participantIds].sort();
        const resultIds = command.results.map((entry) => entry.armyId).sort();
        if (
          participantIds.length !== resultIds.length ||
          participantIds.some((armyId, index) => armyId !== resultIds[index])
        ) return "BATTLE_RESULTS_INCOMPLETE";
        for (const result of command.results) {
          const army = state.armies[result.armyId];
          if (!army) return "ARMY_NOT_FOUND";
          state.armies[result.armyId] = {
            ...army,
            experience: (army.experience ?? 0) + landBattleExperience(result.outcome),
            revision: army.revision + 1
          };
        }
        const released = releaseBattleGroup(state.scene.battleGroups, armyMap(state), command.battleId);
        state.scene.battleGroups = released.groups;
        state.armies = Object.fromEntries(released.armies);
        for (const participantId of battle.participantIds) {
          const participant = state.armies[participantId];
          if (!participant || participant.health.hp > 0) continue;
          const destroyed = destroyArmy(state.armies, state.scene.battleGroups, participantId);
          state.armies = destroyed.armies;
          state.scene.battleGroups = destroyed.battleGroups;
        }
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
      case "PURCHASE_SHIP_UPGRADE": {
        const ship = state.scene.ships?.[command.shipId];
        if (!ship) return "SHIP_NOT_FOUND";
        const previousMovement = shipEffectiveMovement(ship);
        const result = purchaseShipUpgrade(ship, command.level, command.variant);
        if (!result.ok) return result.reason;
        state.scene.ships ??= {};
        state.scene.ships[command.shipId] = result.ship;
        const movementGain = Math.max(0, shipEffectiveMovement(result.ship) - previousMovement);
                const battle = state.scene.activeNavalBattle;
        const currentBattleMovement = battle?.movementRemainingByShip[command.shipId];
        if (
          movementGain > 0 &&
          battle?.status === "ACTIVE" &&
          battle.participantShipIds.includes(command.shipId) &&
          currentBattleMovement !== undefined
        ) {
          state.scene.activeNavalBattle = {
            ...battle,
            movementRemainingByShip: {
              ...battle.movementRemainingByShip,
              [command.shipId]: currentBattleMovement + movementGain
            },
            revision: battle.revision + 1
          };
        }
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
        const embarked = embarkArmy(command.shipId, ship, command.armyId, army, transportLoadingIsFree(ship) ? 0 : transportArmyMovementCostAtCell(state.scene, armyCell));
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
        const embarked = embarkArmy(command.shipId, ship, command.armyId, army, transportLoadingIsFree(ship) ? 0 : transportArmyMovementCostAtCell(state.scene, armyCell));
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
        if (seaFortBlocksDisembark(state.scene, command.targetCell, relationForSides(state.scene, ship.sideId, army.sideId) === "ENEMY")) {
          return "SEA_FORT_BLOCKS_LANDING";
        }
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
        const political = politicalRouteGate({
          sideId: army.sideId,
          cells: [command.targetCell],
          gridMap: state.scene.gridMap,
          sides: state.scene.sides,
          states: state.scene.states,
          stateRelations: state.scene.stateRelations ?? {}
        });
        if (political.allowedCellCount === 0) {
          return political.blockedReason ?? "INVALID_POLITICAL_CONFIG";
        }
        const disembarked = disembarkArmy(command.shipId, ship, command.armyId, army, transportLoadingIsFree(ship) ? 0 : transportArmyMovementCostAtCell(state.scene, command.targetCell));
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
        state.scene.stateRelations = applyDiplomacyForEnteredCells({
          sideId: army.sideId,
          cells: [command.targetCell],
          gridMap: state.scene.gridMap,
          sides: state.scene.sides,
          states: state.scene.states,
          stateRelations: state.scene.stateRelations ?? {}
        }).stateRelations;
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
              const battleReady = interruptFormation(participant);
              state.armies[participantId] = bumpArmy(battleReady, {
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
        if (state.scene.turn.phase !== "POST_MOVEMENT") return "NOT_POST_MOVEMENT_PHASE";
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
        const destination = forwardCell(from, ship.facing);
        const shipCells = Object.fromEntries(
          Object.keys(state.scene.ships ?? {}).flatMap((shipId) => {
            const candidatePosition = commandPosition(state, shipId);
            return candidatePosition ? [[shipId, this.cellForPosition?.(candidatePosition)]] : [];
          }).filter((entry): entry is [string, GridCellCoord] => entry[1] !== undefined)
        );
        if (occupiedByOtherLiveShip(state.scene.ships ?? {}, shipCells, command.shipId, destination)) {
          return "SHIP_CELL_OCCUPIED";
        }
        try {
          const result = applyForwardTacticalStep(
            battle, command.shipId, ship, from, destination
          );
          state.positions ??= {};
          state.positions[command.shipId] = this.positionForCell(result.destination);

          const shipCells = Object.fromEntries(
            Object.keys(state.scene.ships ?? {}).flatMap((shipId) => {
              const position = commandPosition(state, shipId);
              if (!position) return [];
              return [[shipId, this.cellForPosition?.(position)]].filter(
                (entry): entry is [string, GridCellCoord] => entry[1] !== undefined
              );
            })
          );
          const occupiedShipCells = Object.entries(state.scene.ships ?? {})
            .filter(([shipId, candidate]) => shipId !== command.shipId && candidate.hp > 0)
            .flatMap(([shipId]) => {
              const position = commandPosition(state, shipId);
              return position
                ? [this.cellForPosition?.(position)].filter(
                    (cell): cell is GridCellCoord => cell !== undefined
                  )
                : [];
            });
          const interception = resolveCruiserInterceptionsForStep({
            battle: result.battle,
            ships: state.scene.ships ?? {},
            movingShipId: command.shipId,
            sourceCell: from,
            destinationCell: result.destination,
            shipCells,
            hasLineOfSight: (losFrom, losTo) => hasNavalBattleLineOfSight({
              scene: state.scene,
              from: losFrom,
              to: losTo,
              occupiedShipCells
            }),
            rollD6: this.rollD6
          });
          state.scene.ships = interception.ships;
          if (interception.triggered.length > 0) {
            const sequenceStart = interception.battle.events.length;
            interception.battle.events = [
              ...interception.battle.events,
              ...interception.triggered.map((trigger, index) => ({
                type: "INTERCEPTION_TRIGGERED",
                sequence: sequenceStart + index + 1,
                roundNumber: battle.roundNumber,
                cruiserShipId: trigger.cruiserShipId,
                targetShipId: command.shipId,
                rolledDamage: trigger.rolledDamage,
                armor: trigger.armor,
                damage: trigger.damage
              }))
            ];
          }
          state.scene.activeNavalBattle = interception.battle;

          const movedShip = state.scene.ships?.[command.shipId];
          if (movedShip && movedShip.hp <= 0 && interception.triggered.length > 0) {
            const xpSides = interception.triggered.flatMap((trigger) => {
              const cruiser = state.scene.ships?.[trigger.cruiserShipId];
              return cruiser && relationForSides(state.scene, cruiser.sideId, movedShip.sideId) === "ENEMY"
                ? [cruiser.sideId]
                : [];
            });
            interception.battle.experienceEligibleSideIds = [
              ...new Set([...(interception.battle.experienceEligibleSideIds ?? []), ...xpSides])
            ];
            state.scene.activeNavalBattle = interception.battle;
            destroyReciprocalTransportCargo(state, command.shipId, movedShip);
            const sceneRevision = state.scene.revision;
            const destroyed = destroyShip(state.scene as NavalSceneState, command.shipId);
            state.scene = destroyed.scene;
            state.scene.revision = sceneRevision;
          }
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
      case "NAVAL_BROADSIDE_ATTACK": {
        const battle = state.scene.activeNavalBattle;
        if (!battle || battle.status !== "ACTIVE") return "NO_ACTIVE_NAVAL_BATTLE";
        const attacker = state.scene.ships?.[command.shipId];
        if (!attacker) return "SHIP_NOT_FOUND";
        const target = state.scene.ships?.[command.targetShipId];
        if (!target) return "TARGET_SHIP_NOT_FOUND";
        if (
          attacker.status !== "IN_NAVAL_BATTLE" ||
          attacker.battleId !== battle.id ||
          !battle.participantShipIds.includes(command.shipId)
        ) return "SHIP_NOT_IN_NAVAL_BATTLE";
        if (
          target.status !== "IN_NAVAL_BATTLE" ||
          target.battleId !== battle.id ||
          !battle.participantShipIds.includes(command.targetShipId)
        ) return "TARGET_NOT_IN_NAVAL_BATTLE";
        const relation = relationForSides(state.scene, attacker.sideId, target.sideId);
        if ((attacker.sideId === target.sideId || relation === "ALLY") && !command.friendlyFireConfirmed) {
          return "FRIENDLY_FIRE_CONFIRMATION_REQUIRED";
        }
        if (!this.cellForPosition) return "NAVAL_POSITION_UNAVAILABLE";
        const attackerPosition = commandPosition(state, command.shipId);
        const targetPosition = commandPosition(state, command.targetShipId);
        if (!attackerPosition || !targetPosition) return "NAVAL_POSITION_UNAVAILABLE";
        const attackerCell = this.cellForPosition(attackerPosition);
        const targetCell = this.cellForPosition(targetPosition);
        const occupiedShipCells = Object.entries(state.scene.ships ?? {})
          .filter(([shipId, ship]) => shipId !== command.shipId && shipId !== command.targetShipId && ship.hp > 0)
          .flatMap(([shipId]) => {
            const position = commandPosition(state, shipId);
            return position ? [this.cellForPosition?.(position)].filter((cell): cell is GridCellCoord => cell !== undefined) : [];
          });
        const result = commitBroadsideAttack({
          battle,
          ships: state.scene.ships ?? {},
          attackerId: command.shipId,
          targetId: command.targetShipId,
          attackerCell,
          targetCell,
          distanceCells: (from, to) => Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)),
          hasLineOfSight: (from, to) => hasNavalBattleLineOfSight({
            scene: state.scene,
            from,
            to,
            occupiedShipCells
          }),
          rollD6: this.rollD6
        });
        if (!result.ok) return result.reason;
        state.scene.ships ??= {};
        state.scene.ships[command.targetShipId] = result.target;

        const actualHpLoss = Math.max(
          0,
          target.hp + target.temporaryHp - result.target.hp - result.target.temporaryHp
        );
        const hadActiveInterception = battle.interceptions?.[command.targetShipId] !== undefined;
        const battleAfterDamage = hadActiveInterception && actualHpLoss > 0
          ? removeCruiserInterceptionAfterDamage(result.battle, command.targetShipId, actualHpLoss)
          : result.battle;
        const broadsideEvent = {
          type: "BROADSIDE_ATTACK",
          sequence: battleAfterDamage.events.length + 1,
          roundNumber: battle.roundNumber,
          attackerShipId: command.shipId,
          targetShipId: command.targetShipId,
          rolledDamage: result.rolledDamage,
          armor: result.armor,
          damage: result.damage,
          special: result.special
        };
        const interceptionRemovalEvent = hadActiveInterception && actualHpLoss > 0
          ? {
              type: "INTERCEPTION_REMOVED_BY_DAMAGE",
              sequence: broadsideEvent.sequence + 1,
              roundNumber: battle.roundNumber,
              cruiserShipId: command.targetShipId,
              actualHpLoss
            }
          : null;
        battleAfterDamage.events = [
          ...battleAfterDamage.events,
          broadsideEvent,
          ...(interceptionRemovalEvent ? [interceptionRemovalEvent] : [])
        ];
        if (result.target.hp <= 0 && relation === "ENEMY") {
          battleAfterDamage.experienceEligibleSideIds = [
            ...new Set([...(battleAfterDamage.experienceEligibleSideIds ?? []), attacker.sideId])
          ];
        }
        state.scene.activeNavalBattle = battleAfterDamage;
        if (result.target.hp <= 0) {
          destroyReciprocalTransportCargo(state, command.targetShipId, result.target);
          const sceneRevision = state.scene.revision;
          const destroyed = destroyShip(state.scene as NavalSceneState, command.targetShipId);
          state.scene = destroyed.scene;
          state.scene.revision = sceneRevision;
        }
        return undefined;
      }
      case "NAVAL_ACTIVATE_INTERCEPTION": {
        const battle = state.scene.activeNavalBattle;
        if (!battle || battle.status !== "ACTIVE") return "NO_ACTIVE_NAVAL_BATTLE";
        const cruiser = state.scene.ships?.[command.shipId];
        if (!cruiser) return "SHIP_NOT_FOUND";
        if (
          cruiser.status !== "IN_NAVAL_BATTLE" ||
          cruiser.battleId !== battle.id ||
          !battle.participantShipIds.includes(command.shipId)
        ) return "SHIP_NOT_IN_NAVAL_BATTLE";
        const result = activateCruiserInterception({
          battle,
          cruiserId: command.shipId,
          cruiser,
          ships: state.scene.ships ?? {}
        });
        if (!result.ok) return result.reason;
        result.battle.events = [
          ...result.battle.events,
          {
            type: "INTERCEPTION_ACTIVATED",
            sequence: result.battle.events.length + 1,
            roundNumber: battle.roundNumber,
            cruiserShipId: command.shipId
          }
        ];
        state.scene.activeNavalBattle = result.battle;
        return undefined;
      }
      case "NAVAL_SHORE_BOMBARDMENT": {
        if (state.scene.turn.phase !== "POST_MOVEMENT") return "NOT_POST_MOVEMENT_PHASE";
        if (state.scene.activeNavalBattle?.status === "ACTIVE") return "NAVAL_BATTLE_ACTIVE";
        const ship = state.scene.ships?.[command.shipId];
        if (!ship) return "SHIP_NOT_FOUND";
        const target = state.armies[command.armyId];
        if (!target) return "ARMY_NOT_FOUND";
        const relation = relationForSides(state.scene, ship.sideId, target.sideId);
        if ((ship.sideId === target.sideId || relation === "ALLY") && !command.friendlyFireConfirmed) {
          return "FRIENDLY_FIRE_CONFIRMATION_REQUIRED";
        }
        if (!this.cellForPosition) return "NAVAL_POSITION_UNAVAILABLE";
        const shipPosition = commandPosition(state, command.shipId);
        const targetPosition = commandPosition(state, command.armyId);
        if (!shipPosition || !targetPosition) return "NAVAL_POSITION_UNAVAILABLE";
        const shipCell = this.cellForPosition(shipPosition);
        const targetCell = this.cellForPosition(targetPosition);
        const occupiedShipCells = Object.entries(state.scene.ships ?? {})
          .filter(([shipId, candidate]) => shipId !== command.shipId && candidate.hp > 0)
          .flatMap(([shipId]) => {
            const position = commandPosition(state, shipId);
            return position
              ? [this.cellForPosition?.(position)].filter(
                  (cell): cell is GridCellCoord => cell !== undefined
                )
              : [];
          });
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
          distanceCells: (from, to) => Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)),
          hasLineOfSight: (from, to) => hasNavalBattleLineOfSight({
            scene: state.scene,
            from,
            to,
            occupiedShipCells
          }),
          rollD6: this.rollD6
        });
        if (!result.ok) return result.reason;
        state.scene.ships ??= {};
        state.scene.ships[command.shipId] = result.attacker;
        state.scene.navalRevealUntilTurn = applyShipRevealUntilNextTurn({
          shipId: command.shipId,
          observerSideId: target.sideId,
          revealUntilTurn: state.scene.navalRevealUntilTurn ?? {},
          currentTurn: state.scene.turn.turnNumber
        });
        if (result.target.health.hp <= 0) {
          const belongsToLandBattle = state.scene.battleGroups.some((group) =>
            group.participantIds.includes(command.armyId)
          );
          if (belongsToLandBattle) {
            state.armies[command.armyId] = result.target;
          } else {
            const destroyed = destroyArmy(state.armies, state.scene.battleGroups, command.armyId);
            state.armies = destroyed.armies;
            state.scene.battleGroups = destroyed.battleGroups;
          }
        } else {
          state.armies[command.armyId] = result.target;
        }
        const retaliation = coastalBatteryRetaliationDamage(
          state.scene,
          targetCell,
          relation === "ENEMY",
          this.rollD6
        );
        if (retaliation > 0) {
          const armor = shipEffectiveArmor(ship);
          const damage = Math.max(0, retaliation - armor);
          const retaliated = { ...result.attacker, hp: Math.max(0, result.attacker.hp - damage), revision: result.attacker.revision + 1 };
          if (retaliated.hp <= 0) {
            const destroyed = destroyShip(state.scene as NavalSceneState, command.shipId);
            state.scene = destroyed.scene;
            if (destroyed.itemIdToDelete) Reflect.deleteProperty(state.items, destroyed.itemIdToDelete);
          } else {
            state.scene.ships[command.shipId] = retaliated;
          }
        }
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
        state.scene.ships[command.shipId] = {
          ...hospital,
          logisticsActionUsedOnTurn: state.scene.turn.turnNumber,
          revision: hospital.revision + 1
        };
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
        if (!this.cellForPosition) return "SHIP_POSITION_UNAVAILABLE";
        const snapshots: Record<string, import("../shared/types").NavalBattleShipSnapshot> = {};
        const normalizedArea = new Map(
          command.areaCells.map((cell) => [`${cell.x},${cell.y}`, { ...cell }])
        );
        for (const shipId of command.participantShipIds) {
          const ship = state.scene.ships?.[shipId];
          if (!ship) return "SHIP_NOT_FOUND";
          const position = state.positions?.[shipId] ?? state.items[shipId]?.position;
          if (!position) return "SHIP_POSITION_UNAVAILABLE";
          const strategicCell = this.cellForPosition(position);
          snapshots[shipId] = {
            shipId,
            strategicCell,
            strategicPosition: { ...position },
            strategicFacing: ship.facing
          };
          normalizedArea.set(`${strategicCell.x},${strategicCell.y}`, { ...strategicCell });
        }
        const areaCells = [...normalizedArea.values()];
        if (areaCells.some((cell) => !cellSupportsDomain(state.scene, cell, "SEA"))) {
          return "INVALID_NAVAL_BATTLE_AREA";
        }
        const sceneRevision = state.scene.revision;
        try {
          const started = startNavalBattle(state.scene as NavalSceneState, {
            battleId: command.battleId,
            requestId: command.navalRequestId,
            initiatingShipId: command.initiatingShipId,
            participantShipIds: command.participantShipIds,
            areaCells,
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
      case "COMPLETE_MOVEMENT_PHASE": {
        if (state.scene.turn.phase !== "MOVEMENT") return "NOT_MOVEMENT_PHASE";
        state.positions ??= {};
        const resolved = resolvePlannedShipRoutes(
          state.scene,
          state.items,
          state.positions,
          this.cellForPosition,
          this.positionForCell
        );
        if (!resolved.ok) return resolved.reason;
        startRoutesForMovementPhase(state);
        state.scene.turn.phase = "POST_MOVEMENT";
        state.scene.transportEmbarkRequests = [];
        return undefined;
      }
      case "REOPEN_MOVEMENT_PHASE":
        if (state.scene.turn.phase !== "POST_MOVEMENT") return "NOT_POST_MOVEMENT_PHASE";
        if (state.scene.activeNavalBattle?.status === "ACTIVE") return "NAVAL_BATTLE_ACTIVE";
        state.scene.turn.phase = "MOVEMENT";
        state.scene.navalBattleRequests = [];
        return undefined;
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
        const maxHp = shipEffectiveMaxHp(ship);
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
          additionalEmbarkedArmyId: command.hp <= 0 && ship.classId === "TRANSPORT"
            ? null
            : ship.additionalEmbarkedArmyId ?? null,
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
        if (command.side.stateId != null && !state.scene.states.some((candidate) => candidate.id === command.side.stateId)) return "STATE_NOT_FOUND";
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
          if (stateEntity.rulingFactionId === command.sideId) {
            stateEntity.rulingFactionId = null;
            stateEntity.active = false;
          }
        }
        const relations: SceneState["relations"] = {};
        for (const [left, entries] of Object.entries(state.scene.relations)) {
          if (left === command.sideId) continue;
          relations[left] = Object.fromEntries(
            Object.entries(entries).filter(([right]) => right !== command.sideId)
          );
        }
        state.scene.relations = relations;
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
      case "UPDATE_STATE_DEMOGRAPHY": {
        const stateEntity = state.scene.states.find((candidate) => candidate.id === command.stateId);
        if (!stateEntity) return "STATE_NOT_FOUND";
        const existingRecord = state.scene.demographics?.find((candidate) => candidate.stateId === command.stateId);
        const defaultLaw = state.scene.conscriptionLaws?.find((law) => law.active) ?? {
          id: "GENERAL_MOBILIZATION", name: "Всеобщая мобилизация", rate: 0.24, active: true
        };
        const record = existingRecord ?? {
          stateId: command.stateId,
          population: 0,
          populationGrowthFactor: 1,
          humanResource: 0,
          conscriptionLawId: defaultLaw.id,
          conscriptionRate: defaultLaw.rate,
          humanResourceCapacity: 0,
          lastPopulationCalculationDate: null
        };
        let corrected: ReturnType<typeof applyDemographyCorrection>;
        try {
          corrected = applyDemographyCorrection(record, command.patch, command.reason, command.senderPlayerId, this.now().toISOString());
        } catch {
          return "DEMOGRAPHY_CORRECTION_REASON_REQUIRED";
        }
        state.scene.demographics = existingRecord
          ? (state.scene.demographics ?? []).map((candidate) => candidate.stateId === command.stateId ? corrected.record : candidate)
          : [...(state.scene.demographics ?? []), corrected.record];
        state.scene.demographyAudit = [...(state.scene.demographyAudit ?? []), corrected.entry];
        return undefined;
      }
      case "UPSERT_CONSCRIPTION_LAW": {
        const existing = state.scene.conscriptionLaws ?? [];
        state.scene.conscriptionLaws = [...existing.filter((law) => law.id !== command.law.id), structuredClone(command.law)];
        const at = this.now().toISOString();
        state.scene.demographics = (state.scene.demographics ?? []).map((record) => {
          if (record.conscriptionLawId !== command.law.id) return record;
          const next = recalculateHumanResourceCapacity(record, state.scene.conscriptionLaws ?? []);
          const changes = demographicLawChanges(record, next);
          if (Object.keys(changes).length === 0) return next;
          state.scene.demographyAudit = [
            ...(state.scene.demographyAudit ?? []),
            {
              id: `law-${command.law.id}-${record.stateId}-${at}`,
              stateId: record.stateId,
              actorPlayerId: command.senderPlayerId,
              reason: command.reason,
              changes,
              createdAt: at
            }
          ];
          return next;
        });
        return undefined;
      }
      case "SET_SIDE_ARMY_TOKEN": {
        const side = state.scene.sides.find((candidate) => candidate.id === command.sideId);
        if (!side) return "SIDE_NOT_FOUND";
        side.armyTokenAsset = structuredClone(command.asset);
        return undefined;
      }
      case "MARK_LR_TRANSACTION_RECORDED": {
        if (!(state.scene.lrTransactions ?? []).some((entry) => entry.id === command.transactionId)) return "TRANSACTION_NOT_FOUND";
        state.scene.lrTransactions = markLRTransactionRecorded(state.scene.lrTransactions ?? [], command.transactionId, command.senderPlayerId, this.now().toISOString());
        return undefined;
      }
      case "REGISTER_CITY_SHIP": {
        const item = state.items[command.itemId];
        if (!item) return "ITEM_NOT_FOUND";
        if (item.type !== "IMAGE") return "IMAGE_REQUIRED";
        state.scene.ships ??= {};
        if (
          state.armies[command.itemId] ||
          item.metadata[METADATA_KEYS.army] !== undefined ||
          state.scene.ships[command.itemId] ||
          item.metadata[METADATA_KEYS.ship] !== undefined
        ) return "ALREADY_REGISTERED";
        if (!state.scene.sides.some((side) => side.id === command.sideId)) return "SIDE_NOT_FOUND";
        if (!this.cellForPosition) return "SHIP_POSITION_UNAVAILABLE";
        const cell = this.cellForPosition(item.position);
        if (!cellSupportsDomain(state.scene, cell, "SEA")) return "SHIP_REQUIRES_SEA";
        if (!activeShipyardAtCell(state.scene, command.cityId, command.sideId, cell)) return "SHIPYARD_REQUIRED";
        const cellForPosition = this.cellForPosition;
        const shipCells = Object.fromEntries(Object.entries(state.scene.ships).flatMap(([shipId]) => {
          const position = commandPosition(state, shipId);
          return position && cellForPosition ? [[shipId, cellForPosition(position)]] : [];
        }));
        if (occupiedByOtherLiveShip(state.scene.ships, shipCells, command.itemId, cell)) return "SHIPYARD_OCCUPIED";
        state.scene.ships[command.itemId] = createRegisteredShip(command.sideId, command.classId, command.facing);
        return undefined;
      }
      case "REPAIR_SHIP_AT_SHIPYARD": {
        const ship = state.scene.ships?.[command.shipId];
        if (!ship) return "SHIP_NOT_FOUND";
        if (!this.cellForPosition) return "SHIP_POSITION_UNAVAILABLE";
        const position = commandPosition(state, command.shipId);
        if (!position) return "SHIP_POSITION_UNAVAILABLE";
        const repaired = repairShipAtShipyard(state.scene, ship, this.cellForPosition(position), command.amount, state.scene.turn.turnNumber);
        if (repaired === ship) return "SHIPYARD_REQUIRED";
        state.scene.ships ??= {};
        state.scene.ships[command.shipId] = repaired;
        return undefined;
      }
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
        if (army.formation?.active) return "ARMY_FORMING";
        if (command.route.length !== command.cells.length) return "INVALID_COMMAND";
        const forcedExit = (state.scene.forcedExitStates ?? []).find((candidate) =>
          candidate.armyId === command.armyId && candidate.startedOnTurn <= state.scene.turn.turnNumber + 1
        );
        if (forcedExit) {
          const forcedValidation = validateForcedExitRoute(
            state.scene, army, command.startCell, command.cells
          );
          if (!forcedValidation.ok) return forcedValidation.reason;
        }
        if (!forcedExit) {
          const political = politicalRouteGate({
            sideId: army.sideId,
            cells: command.cells,
            gridMap: state.scene.gridMap,
            sides: state.scene.sides,
            states: state.scene.states,
            stateRelations: state.scene.stateRelations ?? {}
          });
          if (political.allowedCellCount < command.cells.length) return political.blockedReason ?? "INVALID_POLITICAL_CONFIG";
        }
        const routeCity = (state.scene.strategicCities ?? []).find((city) => city.cells.some((cell) => sameCell(cell, command.startCell)));
        const marineCrossing = routeCity ? marineStationAllowsCrossing(state.scene, routeCity.id, command.cells) : false;
        const routeTerrain = terrainRegistryForArmy(army, state.scene.terrain);
        if (marineCrossing && routeTerrain.types.sea) routeTerrain.types.sea = { ...routeTerrain.types.sea, movementDomains: ["LAND", "SEA"] };
        const validation = validatePlannedRoute({
          start: command.startCell,
          cells: command.cells,
          sideId: army.sideId,
          terrain: routeTerrain,
          wars: state.scene.wars,
          remainingUnits: armyEffectiveMovementUnits(army),
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
      case "MOVE_ARMY": {
        const army = state.armies[command.armyId];
        if (!army) return "ARMY_NOT_FOUND";
        if (this.cellForPosition) {
          const targetCell = this.cellForPosition(command.position);
          const position = commandPosition(state, command.armyId);
          const withdrawal = position ? forcedExitRouteGate(state.scene, command.armyId, army, this.cellForPosition(position), [targetCell]) : null;
          const political = withdrawal ?? politicalRouteGate({
            sideId: army.sideId,
            cells: [targetCell],
            gridMap: state.scene.gridMap,
            sides: state.scene.sides,
            states: state.scene.states,
            stateRelations: state.scene.stateRelations ?? {}
          });
          if (political.allowedCellCount === 0) {
            return political.blockedReason ?? "INVALID_POLITICAL_CONFIG";
          }
          if (!withdrawal) state.scene.stateRelations = applyDiplomacyForEnteredCells({
            sideId: army.sideId,
            cells: [targetCell],
            gridMap: state.scene.gridMap,
            sides: state.scene.sides,
            states: state.scene.states,
            stateRelations: state.scene.stateRelations ?? {}
          }).stateRelations;
        }
        state.positions ??= {};
        state.positions[command.armyId] = { ...command.position };
        return undefined;
      }
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
        const terrainId = command.terrainId === state.scene.terrain.defaultTerrainId ? null : command.terrainId;
        state.scene.gridMap = applyCellPatchBatch(state.scene.gridMap, command.cells.map((cell) => ({ cell, patch: { terrainId } })));
        revalidateAllRoutes(state);
        return undefined;
      }
      case "SET_IMPASSABLE_CELLS":
        state.scene.gridMap = applyCellPatchBatch(state.scene.gridMap, command.cells.map((cell) => ({ cell, patch: { impassable: command.impassable } })));
        revalidateAllRoutes(state);
        return undefined;
      case "CLEAR_CELL_PROPERTIES": {
        state.scene.gridMap = applyCellPatchBatch(state.scene.gridMap, command.cells.map((cell) => {
          if (command.target === "TERRAIN") return { cell, patch: { terrainId: null } };
          if (command.target === "IMPASSABLE") return { cell, patch: { impassable: false } };
          if (command.target === "RECOGNIZED_STATE") return { cell, patch: { recognizedStateId: null } };
          if (command.target === "DEFACTO_STATE") return { cell, patch: { deFactoStateId: null } };
          return { cell, patch: { terrainId: null, impassable: false, recognizedStateId: null, deFactoStateId: null } };
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
      case "CREATE_STATE": {
        const result = createState(state.scene.states, state.scene.sides, command.state);
        if (!result.ok) return result.reason;
        state.scene.states = result.states;
        state.scene.sides = result.sides;
        return undefined;
      }
      case "UPDATE_STATE": {
        const result = updateState(state.scene.states, state.scene.sides, command.stateId, command.patch);
        if (!result.ok) return result.reason;
        state.scene.states = result.states;
        state.scene.sides = result.sides;
        return undefined;
      }
      case "DELETE_STATE": {
        if (
          (state.scene.strategicCities ?? []).some((city) => city.recognizedStateId === command.stateId || city.deFactoStateId === command.stateId) ||
          (state.scene.territorialScores ?? []).some((score) => score.holderStateId === command.stateId || score.opponentStateId === command.stateId) ||
          (state.scene.rebellions ?? []).some((rebellion) => rebellion.sourceStateId === command.stateId)
        ) return "STATE_STILL_REFERENCED";
        const result = deleteState(state.scene.states, state.scene.sides, state.scene.gridMap, command.stateId);
        if (!result.ok) return result.reason;
        state.scene.states = result.states;
        state.scene.sides = result.sides;
        state.scene.stateRelations = removeStateRelations(state.scene.stateRelations ?? {}, command.stateId);
        return undefined;
      }
      case "SET_SIDE_STATE": {
        const result = setSideState(state.scene.states, state.scene.sides, command.sideId, command.stateId);
        if (!result.ok) return result.reason;
        state.scene.states = result.states;
        state.scene.sides = result.sides;
        return undefined;
      }
      case "SET_STATE_MILITARY_ACCESS": {
        if (
          !state.scene.states.some((candidate) => candidate.id === command.fromStateId) ||
          !state.scene.states.some((candidate) => candidate.id === command.toStateId)
        ) return "STATE_NOT_FOUND";
        state.scene.stateRelations = setMilitaryAccess(
          state.scene.stateRelations ?? {},
          command.fromStateId,
          command.toStateId,
          command.allowed
        );
        revalidateAllRoutes(state);
        reconcileForcedExits(state, this.cellForPosition, "PASSAGE_REVOKED");
        return undefined;
      }
      case "SET_STATE_WAR": {
        if (
          !state.scene.states.some((candidate) => candidate.id === command.leftStateId) ||
          !state.scene.states.some((candidate) => candidate.id === command.rightStateId)
        ) return "STATE_NOT_FOUND";
        state.scene.stateRelations = setPairWar(
          state.scene.stateRelations ?? {},
          command.leftStateId,
          command.rightStateId,
          command.atWar
        );
        revalidateAllRoutes(state);
        reconcileForcedExits(state, this.cellForPosition, "WAR_ENDED");
        return undefined;
      }
      case "SET_RECOGNIZED_STATE_CELLS":
        if (command.stateId !== null && !state.scene.states.some((candidate) => candidate.id === command.stateId)) return "STATE_NOT_FOUND";
        state.scene.gridMap = applyCellPatchBatch(state.scene.gridMap, command.cells.map((cell) => ({ cell, patch: { recognizedStateId: command.stateId } })));
        revalidateAllRoutes(state);
        reconcileForcedExits(state, this.cellForPosition, "BORDER_CHANGED");
        return undefined;
      case "APPLY_PEACE_TRANSFER": {
        const transferValidation = validatePeaceTransfer(state.scene, command.recipientStateId, command.cells);
        if (!transferValidation.ok) return transferValidation.reason;
        state.scene = applyPeaceTransfer(state.scene, command.recipientStateId, command.cells);
        revalidateAllRoutes(state);
        reconcileForcedExits(state, this.cellForPosition, "BORDER_CHANGED");
        return undefined;
      }
      case "START_REBELLION":
        try {
          state.scene = startRebellion(state.scene, {
            id: command.rebellionId,
            sourceStateId: command.sourceStateId,
            capitalCityId: command.capitalCityId,
            participantFactionIds: command.participantFactionIds
          });
          return undefined;
        } catch (error) {
          return error instanceof Error ? error.message : "INVALID_REBELLION";
        }
      case "CLOSE_REBELLION":
        try {
          state.scene = closeRebellion(state.scene, command.rebellionId);
          return undefined;
        } catch (error) {
          return error instanceof Error ? error.message : "INVALID_REBELLION";
        }
      case "START_CIVIL_WAR": {
        const split = startCivilWar(state.scene, {
          sourceStateId: command.sourceStateId,
          rebelFactionId: command.rebelFactionId,
          newStateId: command.newStateId,
          newStateName: command.newStateName,
          newStateColor: command.newStateColor
        });
        if (!split.ok) return split.reason;
        state.scene = split.scene;
        return undefined;
      }
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
          const belongsToLandBattle = state.scene.battleGroups.some((group) =>
            group.participantIds.includes(command.armyId)
          );
          if (belongsToLandBattle) {
            state.armies[command.armyId] = bumpArmy(army, { health: { hp: 0, maxHp } });
            return undefined;
          }
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
        const permission = canHealArmy(army);
        if (!permission.allowed) return permission.reason;
        if (!this.cellForPosition) return "ARMY_POSITION_UNAVAILABLE";
        const position = commandPosition(state, command.armyId);
        if (!position) return "ARMY_POSITION_UNAVAILABLE";
        const cell = this.cellForPosition(position);
        const city = cityForCell(state.scene, cell);
        const hasHospital = city ? hasActiveCityBuilding(state.scene, city.id, "MILITARY_HOSPITAL") : false;
        const terrainId = readCell(state.scene.gridMap, cell).terrainId ?? state.scene.terrain.defaultTerrainId;
        const location = hasHospital
          ? "HOSPITAL" as const
          : city || terrainId === "road"
            ? "CITY_OR_ROAD" as const
            : "FIELD" as const;
        const turnCap = armyRecoveryHpCap(army, location);
        const used = army.healing?.checkedOnTurn === state.scene.turn.turnNumber
          ? army.healing.hpHealedThisTurn
          : 0;
        const remainingTurnCap = Math.max(0, turnCap - used);
        const missingHp = Math.max(0, army.health.maxHp - army.health.hp);
        if (remainingTurnCap <= 0 || missingHp <= 0) return "HEALING_UNAVAILABLE";

        const configuredRate = state.scene.settings.armyHealingCostPerHp ?? 5000;
        const ratePerHp = humanResourceRateInSceneUnits(state, army.sideId, configuredRate);
        let affordableHp = Number.POSITIVE_INFINITY;
        if (state.scene.demographics !== undefined) {
          const side = state.scene.sides.find((candidate) => candidate.id === army.sideId);
          if (!side?.stateId) return "STATE_REQUIRED";
          const demography = state.scene.demographics.find((record) => record.stateId === side.stateId);
          if (!demography) return "STATE_NOT_FOUND";
          affordableHp = ratePerHp > 0 ? Math.floor(demography.humanResource / ratePerHp) : remainingTurnCap;
        }
        const hp = Math.min(remainingTurnCap, missingHp, affordableHp);
        if (!Number.isFinite(hp) ? false : hp <= 0) return "INSUFFICIENT_HUMAN_RESOURCE";
        const healedHp = Number.isFinite(hp) ? hp : Math.min(remainingTurnCap, missingHp);
        if (healedHp <= 0) return "HEALING_UNAVAILABLE";

        const healed = healArmyForTurn(
          army,
          healedHp,
          state.scene.turn.turnNumber,
          turnCap,
          hasHospital ? city?.id ?? null : null
        );
        if (!healed) return "HEALING_UNAVAILABLE";
        const amount = healedHp * ratePerHp;
        const debit = this.debitHumanResource(state, army.sideId, amount, {
          requestId: command.requestId,
          actorPlayerId: command.senderPlayerId,
          kind: "HEALING",
          armyId: command.armyId,
          armyName: state.items[command.armyId]?.name ?? command.armyId,
          cityId: city?.id ?? null,
          cityName: city?.name ?? null,
          hp: healedHp,
          ratePerHp,
          turnNumber: state.scene.turn.turnNumber,
          createdAt: this.now().toISOString()
        });
        if (debit) return debit;
        state.armies[command.armyId] = healed;
        if (state.scene.demographics === undefined) {
          state.scene.lrTransactions = appendLRTransaction(state.scene.lrTransactions ?? [], {
            id: `${command.requestId}:healing`,
            requestId: command.requestId,
            createdAt: this.now().toISOString(),
            turnNumber: state.scene.turn.turnNumber,
            actorPlayerId: command.senderPlayerId,
            sideId: army.sideId,
            sideName: state.scene.sides.find((side) => side.id === army.sideId)?.name ?? army.sideId,
            cityId: city?.id ?? null,
            cityName: city?.name ?? null,
            armyId: command.armyId,
            armyName: state.items[command.armyId]?.name ?? command.armyId,
            kind: "HEALING",
            hp: healedHp,
            ratePerHp,
            amount
          });
        }
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
      case "SET_TURN_NUMBER": {
        if (!canRenumberTurn(state.scene)) {
          return state.scene.activeNavalBattle?.status === "ACTIVE"
            ? "NAVAL_BATTLE_ACTIVE"
            : "NOT_MOVEMENT_PHASE";
        }
        const renumbered = renumberSceneTurn(state.scene, state.armies, command.turnNumber);
        state.scene = renumbered.scene;
        state.armies = renumbered.armies;
        return undefined;
      }
      case "COMPLETE_TURN_NOW": {
        const blockers = preCheckpointTurnBlockers(state.scene, state.armies);
        if (blockers.length > 0) return `TURN_BLOCKED:${blockers.join(",")}`;
        const armyCells = Object.fromEntries(Object.entries(state.armies).flatMap(([armyId]) => {
          const position = state.positions?.[armyId];
          if (!position || !this.cellForPosition) return [];
          return [[armyId, this.cellForPosition(position)]];
        }));
        const shipCells = Object.fromEntries(Object.entries(state.scene.ships ?? {}).flatMap(([shipId]) => {
          const position = state.positions?.[shipId];
          if (!position || !this.cellForPosition) return [];
          return [[shipId, this.cellForPosition(position)]];
        }));
        const hasStateBoundArmyWithoutCell = Object.entries(state.armies).some(([armyId, army]) => {
          const side = state.scene.sides.find((candidate) => candidate.id === army.sideId);
          return Boolean(side?.stateId) && !armyCells[armyId];
        });
        if (hasStateBoundArmyWithoutCell) return "TURN_POSITION_UNAVAILABLE";
        const result = completeTurn(state.scene, state.armies, {
          source: "MANUAL",
          completedAt: this.now(),
          ...(this.positionForCell ? {positionForCell: this.positionForCell} : {}),
          armyCells,
          shipCells
        });
        if (!result.changed) return "blockers" in result ? `TURN_BLOCKED:${result.blockers.join(",")}` : result.reason;
        state.scene = result.scene;
        state.armies = result.armies;
        return undefined;
      }
      default:
        return "INVALID_COMMAND";
    }
  }
}
