import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE, METADATA_KEYS } from "../shared/constants";
import type { StrategicCityCommand } from "../cities/strategicCityCommands";
import { COMMAND_PROTOCOL_VERSION } from "../shared/types";
import type { ArmyCommand, ArmyState, SceneItemRecord, SceneState } from "../shared/types";
import { CommandProcessor, type CommandContext, type CommandState } from "./commandProcessor";

function army(sideId: string, directOwnerPlayerId?: string): ArmyState {
  return {
    version: 3,
    registered: true,
    sideId,
    status: "READY",
    overrides: {},
    route: [],
    plannedRoute: { startCell: { x: 0, y: 0 }, executeOnTurn: 0, cells: [], totalCostUnits: 0, validatedRevision: 2, requiresReplan: false },
    movement: { maxUnits: 10, remainingUnits: 10, enteredRouteCellCount: 0 },
    health: { hp: 50, maxHp: 50 }, supply: { supplied: true, checkedOnTurn: 1 },
    disband: { pending: false, requestedOnTurn: null, requestedByPlayerId: null },
    currentWaypointIndex: 0,
    segmentProgressCells: 0,
    ignoresMovementBarriers: false,
    ignoresVisionBarriers: false,
    revision: 1,
    ...(directOwnerPlayerId ? { directOwnerPlayerId } : {})
  };
}

function image(id: string, registered = false): SceneItemRecord {
  return {
    id,
    type: "IMAGE",
    name: id,
    position: { x: 0, y: 0 },
    metadata: registered ? { [METADATA_KEYS.army]: army("red") } : {}
  };
}

function state(): CommandState {
  const scene: SceneState = {
    version: 5,
    revision: 2,
    settings: { ...DEFAULT_SETTINGS },
    sides: [
      {
        id: "red",
        name: "Красные",
        color: "#f00",
        playerIds: ["leader", "member", "legacy-owner"],
        leaderPlayerIds: ["leader"],
        stateId: null
      },
      {
        id: "blue",
        name: "Синие",
        color: "#00f",
        playerIds: ["blue-leader"],
        leaderPlayerIds: ["blue-leader"],
        stateId: null
      }
    ],
    states: [],
    relations: {},
    battleGroups: [],
    terrain: structuredClone(DEFAULT_TERRAIN),
    gridMap: { version: 1, revision: 0, cells: {} },
    wars: [],
    turn: structuredClone(DEFAULT_TURN_STATE)
  };
  return {
    scene,
    armies: {
      "army-red": army("red", "legacy-owner"),
      "registered-image": army("red")
    },
    barriers: {},
    items: {
      "army-red": image("army-red", true),
      "candidate-image": image("candidate-image"),
      "registered-image": image("registered-image", true),
      shape: { id: "shape", type: "SHAPE", position: { x: 0, y: 0 }, metadata: {} }
    }
  } as CommandState;
}

function command(
  overrides: Partial<ArmyCommand> & Pick<ArmyCommand, "type">,
  senderPlayerId = "gm"
): ArmyCommand {
  return {
    requestId: "request",
    senderPlayerId,
    senderConnectionId: `${senderPlayerId}-connection`,
    expectedRevision: 2,
    ...overrides
  } as ArmyCommand;
}

function context(
  role: "GM" | "PLAYER",
  playerId: string,
  commandState = state(),
  connectedPlayerIds = new Set(["gm", "leader", "member", "legacy-owner", "blue-leader", "leader-2"])
): CommandContext {
  return {
    role,
    playerId,
    connectionId: `${playerId}-connection`,
    connectedPlayerIds,
    state: commandState
  };
}

describe("CommandProcessor", () => {
  const processor = new CommandProcessor();
  it("lets only the GM reject a pending naval battle request", () => {
    const current = state();
    current.scene.navalBattleRequests = [{ id: "pending", initiatingShipId: "a", targetShipId: "b" }];
    const cancel = command({ type: "REJECT_NAVAL_BATTLE_REQUEST", navalRequestId: "pending" });
    expect(processor.execute(context("PLAYER", "leader", current),
      command({ type: "REJECT_NAVAL_BATTLE_REQUEST", navalRequestId: "pending" }, "leader")))
      .toEqual({ status: "REJECTED", reason: "GM_ONLY" });
    const result = processor.execute(context("GM", "gm", current), cancel);
    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;
    expect(result.state.scene.navalBattleRequests).toEqual([]);
    const missing = processor.execute(context("GM", "gm", current),
      command({ type: "REJECT_NAVAL_BATTLE_REQUEST", navalRequestId: "missing" }));
    expect(missing).toEqual({ status: "REJECTED", reason: "NAVAL_BATTLE_REQUEST_NOT_FOUND" });
  });

  it("accepts naval actions only during the normal global movement turn", () => {
    const current = state();
    for (const type of ["REQUEST_NAVAL_BATTLE", "NAVAL_SHORE_BOMBARDMENT"] as const) {
      const payload = type === "REQUEST_NAVAL_BATTLE"
        ? command({ type, initiatingShipId: "missing", targetShipId: "target" })
        : command({ type, shipId: "missing", armyId: "army-red", friendlyFireConfirmed: false });
      const inTurn = processor.execute(context("GM", "gm", current), payload);
      expect(inTurn).toEqual({ status: "REJECTED", reason: "SHIP_NOT_FOUND" });
      const afterTurn = structuredClone(current);
      afterTurn.scene.turn.phase = "POST_MOVEMENT";
      expect(processor.execute(context("GM", "gm", afterTurn), payload))
        .toEqual({ status: "REJECTED", reason: "NOT_MOVEMENT_PHASE" });
    }
  });

  it("rejects turn completion while a naval request is unresolved", () => {
    const current = state();
    current.scene.navalBattleRequests = [{
      id: "naval-request", initiatingShipId: "ship-1", targetShipId: "ship-2",
      createdOnTurn: current.scene.turn.turnNumber
    }];
    const result = processor.execute(context("GM", "gm", current), command({ type: "COMPLETE_TURN_NOW" }));
    expect(result).toEqual({ status: "REJECTED", reason: "NAVAL_REQUESTS_PENDING" });
    expect(current.scene.turn.phase).toBe("MOVEMENT");
    expect(current.scene.navalBattleRequests).toHaveLength(1);
  });



  it("applies and audits a military influence operation for a faction", () => {
    const current = state();
    current.scene.sides = current.scene.sides.map((side) =>
      side.id === "red" ? { ...side, stateId: "france", militaryInfluence: 8 } : side
    );
    current.scene.states = [{
      id: "france",
      name: "Франция",
      backendCountry: "france",
      rulingFactionId: "red",
      active: true
    }];

    const result = processor.execute(
      context("GM", "gm", current),
      command({
        type: "ADJUST_MILITARY_INFLUENCE",
        factionId: "red",
        reasonCode: "LAND_BATTLE_VICTORY",
        reason: "Победа в сухопутном бою"
      })
    );

    expect(result.status).toBe("ACCEPTED");
    if (result.status === "ACCEPTED") {
      expect(result.state.scene.sides.find((side) => side.id === "red")?.militaryInfluence).toBe(12);
      expect(result.state.scene.militaryInfluenceAudit?.[0]).toMatchObject({
        factionId: "red",
        country: "france",
        delta: 4,
        balanceBefore: 8,
        balanceAfter: 12,
        reasonCode: "LAND_BATTLE_VICTORY",
        reason: "Победа в сухопутном бою"
      });
    }
  });

  it("stores the configured army token asset on a faction", () => {
    const current = state();
    const asset = {
      name: "Красный жетон",
      image: { width: 64, height: 64, mime: "image/png", url: "https://example.test/red.png" },
      grid: { dpi: 100, offset: { x: 0, y: 0 } }
    };
    const result = processor.execute(
      context("GM", "gm", current),
      command({ type: "SET_SIDE_ARMY_TOKEN", sideId: "red", asset })
    );

    expect(result.status).toBe("ACCEPTED");
    if (result.status === "ACCEPTED") {
      expect(result.state.scene.sides.find((side) => side.id === "red")?.armyTokenAsset).toEqual(asset);
    }
  });

  it("rejects a crafted route into closed foreign land for a non-ruling faction", () => {
    const current = state();
    current.scene.version = 7;
    current.scene.sides = current.scene.sides.map((side) => ({ ...side, stateId: side.id === "red" ? "home" : "host" }));
    current.scene.sides.push({ id: "ruler", name: "Правительство", color: "#fff", playerIds: [], leaderPlayerIds: [], stateId: "home" });
    current.scene.states = [
      { id: "home", name: "Дом", color: "#fff", rulingFactionId: "ruler", active: true },
      { id: "host", name: "Чужая страна", color: "#000", rulingFactionId: "blue", active: true }
    ];
    current.scene.stateRelations = {};
    current.scene.gridMap.cells["1,0"] = {
      terrainId: null, impassable: false, factionTerritoryIds: [], recognizedStateId: "host", deFactoStateId: "host"
    };
    expect(processor.execute(context("PLAYER", "leader", current), command({
      type: "SET_ROUTE", armyId: "army-red", startCell: { x: 0, y: 0 },
      cells: [{ x: 1, y: 0 }], route: [{ x: 150, y: 50 }]
    }, "leader"))).toEqual({ status: "REJECTED", reason: "FOREIGN_STATE_CLOSED" });
  });

  it("declares war immediately when the ruling army is moved into closed foreign land", () => {
    const current = state();
    current.scene.version = 7;
    current.scene.sides = current.scene.sides.map((side) => ({ ...side, stateId: side.id === "red" ? "home" : "host" }));
    current.scene.states = [
      { id: "home", name: "Дом", color: "#fff", rulingFactionId: "red", active: true },
      { id: "host", name: "Чужая страна", color: "#000", rulingFactionId: "blue", active: true }
    ];
    current.scene.stateRelations = {};
    current.scene.gridMap.cells["1,0"] = {
      terrainId: null, impassable: false, factionTerritoryIds: [], recognizedStateId: "host", deFactoStateId: "host"
    };
    const positioned = new CommandProcessor(() => new Date(), ({ x, y }) => ({ x: Math.floor(x / 100), y: Math.floor(y / 100) }));
    const result = positioned.execute(context("GM", "gm", current), command({
      type: "MOVE_ARMY", armyId: "army-red", position: { x: 150, y: 50 }
    }));
    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;
    expect(result.state.scene.stateRelations).toMatchObject({
      home: { host: { atWar: true } }, host: { home: { atWar: true } }
    });
  });

  it("invalidates existing routes when recognized borders change", () => {
    const current = state();
    current.scene.version = 7;
    current.scene.sides = current.scene.sides.map((side) => ({ ...side, stateId: side.id === "red" ? "home" : "host" }));
    current.scene.sides.push({ id: "ruler", name: "Правительство", color: "#fff", playerIds: [], leaderPlayerIds: [], stateId: "home" });
    current.scene.states = [
      { id: "home", name: "Дом", color: "#fff", rulingFactionId: "ruler", active: true },
      { id: "host", name: "Чужая страна", color: "#000", rulingFactionId: "blue", active: true }
    ];
    current.armies["army-red"] = { ...current.armies["army-red"], plannedRoute: {
      startCell: { x: 0, y: 0 }, executeOnTurn: 0, cells: [{ x: 1, y: 0 }],
      totalCostUnits: 1, validatedRevision: 2, requiresReplan: false
    }} as ArmyState;
    const result = processor.execute(context("GM", "gm", current), command({
      type: "SET_RECOGNIZED_STATE_CELLS", stateId: "host", cells: [{ x: 1, y: 0 }]
    }));
    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;
    expect(result.state.armies["army-red"]?.plannedRoute.invalidReason).toBe("FOREIGN_STATE_CLOSED");
  });

  it("rejects a forged sender connection before changing state", () => {
    const result = processor.execute(
      { ...context("GM", "gm"), connectionId: "real-connection" },
      command({
        type: "CREATE_SIDE",
        side: {
          id: "green",
          name: "Зелёные",
          color: "#0f0",
          playerIds: [],
          leaderPlayerIds: [],
          stateId: null
        }
      })
    );
    expect(result).toEqual({ status: "REJECTED", reason: "FORGED_CONNECTION" });
  });

  it("reports a stale revision as a conflict", () => {
    expect(
      processor.execute(context("GM", "gm"), command({ type: "START_ALL", expectedRevision: 1 }))
    ).toEqual({ status: "CONFLICT", actualRevision: 2 });
  });

  it("assigns multiple leaders by id and automatically makes them members", () => {
    const first = processor.execute(
      context("GM", "gm"),
      command({ type: "ADD_SIDE_LEADER", sideId: "red", playerId: "leader-2" })
    );
    expect(first.status).toBe("ACCEPTED");
    if (first.status !== "ACCEPTED") return;

    const second = processor.execute(
      context("GM", "gm", first.state),
      command({
        type: "ADD_SIDE_LEADER",
        sideId: "red",
        playerId: "leader-2",
        expectedRevision: 3
      })
    );
    expect(second.status).toBe("ACCEPTED");
    if (second.status === "ACCEPTED") {
      expect(second.state.scene.sides.find((side) => side.id === "red")).toMatchObject({
        playerIds: ["leader", "member", "legacy-owner", "leader-2"],
        leaderPlayerIds: ["leader", "leader-2"]
      });
    }
  });

  it("removes leadership without removing ordinary membership", () => {
    const commandState = state();
    commandState.scene.sides[0]?.leaderPlayerIds.push("leader-2");
    commandState.scene.sides[0]?.playerIds.push("leader-2");

    const result = processor.execute(
      context("GM", "gm", commandState),
      command({ type: "REMOVE_SIDE_LEADER", sideId: "red", playerId: "leader-2" })
    );
    expect(result.status).toBe("ACCEPTED");
    if (result.status === "ACCEPTED") {
      expect(result.state.scene.sides.find((side) => side.id === "red")).toMatchObject({
        playerIds: expect.arrayContaining(["leader-2"]),
        leaderPlayerIds: ["leader"]
      });
    }
  });

  it("lets a leader add an ordinary connected player to a led side", () => {
    const result = processor.execute(
      context("PLAYER", "leader"),
      command({ type: "ADD_SIDE_PLAYER", sideId: "red", playerId: "leader-2" }, "leader")
    );
    expect(result.status).toBe("ACCEPTED");
    if (result.status === "ACCEPTED") {
      expect(result.state.scene.sides.find((side) => side.id === "red")?.playerIds).toContain(
        "leader-2"
      );
    }
  });

  it("keeps a player in every side they join", () => {
    const result = processor.execute(
      context("GM", "gm"),
      command({ type: "ADD_SIDE_PLAYER", sideId: "blue", playerId: "member" })
    );
    expect(result.status).toBe("ACCEPTED");
    if (result.status === "ACCEPTED") {
      expect(result.state.scene.sides
        .filter((side) => side.playerIds.includes("member"))
        .map((side) => side.id)
        .sort()).toEqual(["blue", "red"]);
    }
  });

  it("rejects leader membership changes for another side", () => {
    expect(
      processor.execute(
        context("PLAYER", "leader"),
        command({ type: "ADD_SIDE_PLAYER", sideId: "blue", playerId: "member" }, "leader")
      )
    ).toEqual({ status: "REJECTED", reason: "NOT_SIDE_LEADER" });
  });

  it("does not remove a member while that player remains a leader", () => {
    expect(
      processor.execute(
        context("GM", "gm"),
        command({ type: "REMOVE_SIDE_PLAYER", sideId: "red", playerId: "leader" })
      )
    ).toEqual({ status: "REJECTED", reason: "PLAYER_IS_LEADER" });
  });

  it("rejects adding an arbitrary disconnected player id", () => {
    expect(
      processor.execute(
        context("PLAYER", "leader"),
        command({ type: "ADD_SIDE_PLAYER", sideId: "red", playerId: "invented-id" }, "leader")
      )
    ).toEqual({ status: "REJECTED", reason: "PLAYER_NOT_CONNECTED" });
  });

  it.each([
    ["missing", "ITEM_NOT_FOUND"],
    ["shape", "IMAGE_REQUIRED"],
    ["registered-image", "ALREADY_REGISTERED"]
  ])("authoritatively rejects registration for %s", (itemId, reason) => {
    expect(
      processor.execute(
        context("GM", "gm"),
        command({ type: "REGISTER_ARMY", itemId, sideId: "red" })
      )
    ).toEqual({ status: "REJECTED", reason });
  });

  it("registers an Image for a side without a direct owner", () => {
    const result = processor.execute(
      context("GM", "gm"),
      command({ type: "REGISTER_ARMY", itemId: "candidate-image", sideId: "red" })
    );
    expect(result.status).toBe("ACCEPTED");
    if (result.status === "ACCEPTED") {
      expect(result.state.armies["candidate-image"]).toMatchObject({ sideId: "red", status: "READY" });
      expect(result.state.items["candidate-image"]).toMatchObject({ visible: false });
      expect(result.state.armies["candidate-image"]).not.toHaveProperty("directOwnerPlayerId");
    }
  });

  it("creates a formation army from a selected token in an active influenced city", () => {
    const current = state();
    current.scene.sides = current.scene.sides.map((side) => side.id === "red" ? { ...side, stateId: "red-state" } : side);
    current.scene.states = [{ id: "red-state", name: "Красное государство", rulingFactionId: "red", active: true }];
    current.scene.demographics = [{
      stateId: "red-state", population: 1000, populationGrowthFactor: 1.003, humanResource: 100_000,
      conscriptionLawId: "GENERAL_MOBILIZATION", conscriptionRate: 0.24, humanResourceCapacity: 240,
      lastPopulationCalculationDate: "2026-09-28"
    }];
    current.scene.gridMap.cells["0,0"] = {
      terrainId: "plain", impassable: false, factionTerritoryIds: ["red"], recognizedStateId: "red-state", deFactoStateId: "red-state"
    };
    current.scene.sides = current.scene.sides.map((side) => side.id === "red" ? { ...side, stateId: "red-state" } : side);
    current.scene.states = [{ id: "red-state", name: "Красное государство", rulingFactionId: "red", active: true }];
    current.scene.strategicCities = [{
      id: "city-red", name: "Красный город", cells: [{ x: 0, y: 0 }], recognizedStateId: "red-state", deFactoStateId: "red-state",
      factionInfluenceId: "red", mayorId: null, isCapital: false, historicalBuildTypeCount: 0,
      buildings: [{ id: "military-department", type: "MILITARY_DEPARTMENT", cell: { x: 0, y: 0 } }]
    }];
    const candidate = current.items["candidate-image"];
    if (!candidate) throw new Error("candidate image missing");
    current.items["candidate-image"] = { ...candidate, position: { x: 10, y: 10 } };
    const result = new CommandProcessor(() => new Date(), (position) => ({ x: Math.floor(position.x / 100), y: Math.floor(position.y / 100) }))
      .execute(context("PLAYER", "leader", current), command({ type: "CREATE_CITY_ARMY", itemId: "candidate-image", cityId: "city-red", sideId: "red" }, "leader"));
    expect(result.status).toBe("ACCEPTED");
    if (result.status === "ACCEPTED") {
      expect(result.state.armies["candidate-image"]).toMatchObject({ sideId: "red", health: { hp: 5, maxHp: 40 }, formation: { active: true, cityId: "city-red", hpAddedThisTurn: 0 } });
      const demographics = result.state.scene.demographics;
      if (!demographics) throw new Error("demography missing");
      expect(demographics[0]?.humanResource).toBe(100_000);
      expect(result.state.scene.lrTransactions ?? []).toEqual([]);
    }
  });

  it("does not spend sheet LR until formation HP is actually added", () => {
    const current = state();
    current.scene.sides = current.scene.sides.map((side) => side.id === "red" ? { ...side, stateId: "red-state" } : side);
    current.scene.states = [{ id: "red-state", name: "Красное государство", rulingFactionId: "red", active: true }];
    current.scene.demographics = [{
      stateId: "red-state", population: 46_084, populationGrowthFactor: 1.003, humanResource: 584,
      conscriptionLawId: "URGENT_CONSCRIPTION", conscriptionRate: 0.04, humanResourceCapacity: 1_843.36,
      lastPopulationCalculationDate: "2026-09-29"
    }];
    current.scene.gridMap.cells["0,0"] = {
      terrainId: "plain", impassable: false, factionTerritoryIds: ["red"], recognizedStateId: "red-state", deFactoStateId: "red-state"
    };
    current.scene.sides = current.scene.sides.map((side) => side.id === "red" ? { ...side, stateId: "red-state" } : side);
    current.scene.strategicCities = [{
      id: "city-red", name: "Красный город", cells: [{ x: 0, y: 0 }], recognizedStateId: "red-state", deFactoStateId: "red-state",
      factionInfluenceId: "red", mayorId: null, isCapital: false, historicalBuildTypeCount: 0,
      buildings: [{ id: "military-department", type: "MILITARY_DEPARTMENT", cell: { x: 0, y: 0 } }]
    }];
    const candidate = current.items["candidate-image"];
    if (!candidate) throw new Error("candidate image missing");
    current.items["candidate-image"] = { ...candidate, position: { x: 10, y: 10 } };

    const result = new CommandProcessor(() => new Date(), (position) => ({ x: Math.floor(position.x / 100), y: Math.floor(position.y / 100) }))
      .execute(context("PLAYER", "leader", current), command({ type: "CREATE_CITY_ARMY", itemId: "candidate-image", cityId: "city-red", sideId: "red" }, "leader"));

    expect(result.status).toBe("ACCEPTED");
    if (result.status === "ACCEPTED") {
      expect(result.state.scene.demographics?.[0]?.humanResource).toBe(584);
      expect(result.state.scene.lrTransactions ?? []).toEqual([]);
    }
  });

  it("rejects manual army formation because formation is automatic", () => {
    const current = state();
    const result = processor.execute(
      context("PLAYER", "leader", current),
      command({ type: "FORM_ARMY", armyId: "army-red", hp: 5 }, "leader")
    );
    expect(result).toEqual({ status: "REJECTED", reason: "FORMATION_AUTOMATIC_ONLY" });
  });

  it("lets the GM correct a state demographic record with an audit reason", () => {
    const current = state();
    current.scene.states = [{ id: "red-state", name: "Красное государство", rulingFactionId: "red", active: true }];
    current.scene.demographics = [{
      stateId: "red-state", population: 1000, populationGrowthFactor: 1.003, humanResource: 100,
      conscriptionLawId: "GENERAL_MOBILIZATION", conscriptionRate: 0.24, humanResourceCapacity: 240,
      lastPopulationCalculationDate: "2026-09-28"
    }];

    const result = processor.execute(context("GM", "gm", current), command({
      type: "UPDATE_STATE_DEMOGRAPHY",
      stateId: "red-state",
      patch: { humanResource: 150 },
      reason: "Импорт из таблицы"
    }, "gm"));

    expect(result.status).toBe("ACCEPTED");
    if (result.status === "ACCEPTED") {
      expect(result.state.scene.demographics?.[0]?.humanResource).toBe(150);
      expect(result.state.scene.demographyAudit?.[0]).toMatchObject({ stateId: "red-state", reason: "Импорт из таблицы" });
    }
  });

  it("applies a demographic sync package atomically", () => {
    const current = state();
    current.scene.states = [
      { id: "red-state", name: "Красное государство", rulingFactionId: "red", active: true },
      { id: "blue-state", name: "Синее государство", rulingFactionId: "blue", active: true }
    ];
    current.scene.demographics = [
      { stateId: "red-state", population: 100, populationGrowthFactor: 1, humanResource: 20, conscriptionLawId: "GENERAL_MOBILIZATION", conscriptionRate: 0.24, humanResourceCapacity: 24, lastPopulationCalculationDate: null },
      { stateId: "blue-state", population: 200, populationGrowthFactor: 1, humanResource: 30, conscriptionLawId: "GENERAL_MOBILIZATION", conscriptionRate: 0.24, humanResourceCapacity: 48, lastPopulationCalculationDate: null }
    ];
    const result = processor.execute(context("GM", "gm", current), command({
      type: "UPDATE_STATES_DEMOGRAPHY",
      updates: [
        { stateId: "red-state", patch: { population: 110, humanResource: 22 } },
        { stateId: "blue-state", patch: { population: 210, humanResource: 31 } }
      ],
      reason: "Импорт из Google Sheets"
    }));

    expect(result.status).toBe("ACCEPTED");
    if (result.status === "ACCEPTED") {
      expect(result.state.scene.demographics?.map((entry) => entry.population)).toEqual([110, 210]);
      expect(result.state.scene.demographyAudit).toHaveLength(2);
    }
  });

  it("recalculates the LR limit when a conscription law changes", () => {
    const current = state();
    current.scene.states = [{ id: "red-state", name: "Красное государство", rulingFactionId: "red", active: true }];
    current.scene.conscriptionLaws = [{ id: "URGENT_CONSCRIPTION", name: "Срочный призыв", rate: 0.04, active: true }];
    current.scene.demographics = [{
      stateId: "red-state", population: 1_000, populationGrowthFactor: 1.003, humanResource: 100,
      conscriptionLawId: "URGENT_CONSCRIPTION", conscriptionRate: 0.04, humanResourceCapacity: 200,
      lastPopulationCalculationDate: "2026-09-28"
    }];

    const result = processor.execute(context("GM", "gm", current), command({
      type: "UPSERT_CONSCRIPTION_LAW",
      law: { id: "URGENT_CONSCRIPTION", name: "Срочный призыв", rate: 0.08, active: true },
      reason: "Изменение закона"
    }, "gm"));

    expect(result.status).toBe("ACCEPTED");
    if (result.status === "ACCEPTED") {
      expect(result.state.scene.demographics?.[0]).toMatchObject({
        conscriptionRate: 0.08,
        humanResourceCapacity: 80,
        humanResource: 80
      });
      expect(result.state.scene.demographyAudit?.at(-1)?.changes).toMatchObject({
        conscriptionRate: { before: 0.04, after: 0.08 },
        humanResourceCapacity: { before: 200, after: 80 },
        humanResource: { before: 100, after: 80 }
      });
    }
  });

  it("creates a missing demographic record on the first GM correction", () => {
    const current = state();
    current.scene.states = [{ id: "red-state", name: "Красное государство", rulingFactionId: "red", active: true }];

    const result = processor.execute(context("GM", "gm", current), command({
      type: "UPDATE_STATE_DEMOGRAPHY",
      stateId: "red-state",
      patch: { population: 1_000_000, populationGrowthFactor: 1.003, humanResource: 100_000 },
      reason: "Создание записи"
    }, "gm"));

    expect(result.status).toBe("ACCEPTED");
    if (result.status === "ACCEPTED") expect(result.state.scene.demographics?.[0]).toMatchObject({ stateId: "red-state", population: 1_000_000, humanResource: 100_000 });
  });

  it("spawns the configured faction token in the city when no token is selected", () => {
    const current = state();
    const asset = {
      name: "Красный жетон",
      image: { width: 64, height: 64, mime: "image/png", url: "https://example.test/red.png" },
      grid: { dpi: 100, offset: { x: 0, y: 0 } }
    };
    current.scene.sides = current.scene.sides.map((side) => side.id === "red" ? { ...side, armyTokenAsset: asset } : side);
    current.scene.sides = current.scene.sides.map((side) => side.id === "red" ? { ...side, stateId: "red-state" } : side);
    current.scene.states = [{ id: "red-state", name: "Красное государство", rulingFactionId: "red", active: true }];
    current.scene.gridMap.cells["0,0"] = {
      terrainId: "plain", impassable: false, factionTerritoryIds: ["red"], recognizedStateId: "red-state", deFactoStateId: "red-state"
    };
    current.scene.strategicCities = [{
      id: "city-red", name: "Красный город", cells: [{ x: 0, y: 0 }], recognizedStateId: "red-state", deFactoStateId: "red-state",
      factionInfluenceId: "red", mayorId: null, isCapital: false, historicalBuildTypeCount: 0,
      buildings: [{ id: "military-department", type: "MILITARY_DEPARTMENT", cell: { x: 0, y: 0 } }]
    }];
    const result = new CommandProcessor(
      () => new Date(),
      (position) => ({ x: Math.floor(position.x / 100), y: Math.floor(position.y / 100) }),
      (cell) => ({ x: cell.x * 100 + 50, y: cell.y * 100 + 50 })
    ).execute(context("PLAYER", "leader", current), command({ type: "CREATE_CITY_ARMY", cityId: "city-red", sideId: "red" }, "leader"));
    expect(result.status).toBe("ACCEPTED");
    if (result.status === "ACCEPTED") {
      expect(result.state.armies["army-request"]).toMatchObject({ sideId: "red", health: { hp: 5, maxHp: 40 } });
      expect(result.state.items["army-request"]).toMatchObject({ type: "IMAGE", position: { x: 50, y: 50 }, visible: false, image: asset.image, grid: asset.grid });
    }
  });

  it("schedules treatment up to the amount affordable from human resources", () => {
    const current = state();
    current.scene.sides = current.scene.sides.map((side) =>
      side.id === "red" ? { ...side, stateId: "red-state" } : side
    );
    current.scene.states = [{
      id: "red-state",
      name: "Красное государство",
      rulingFactionId: "red",
      active: true
    }];
    current.scene.demographics = [{
      stateId: "red-state",
      population: 1_000,
      populationGrowthFactor: 1.003,
      humanResource: 12,
      conscriptionLawId: "GENERAL_MOBILIZATION",
      conscriptionRate: 0.24,
      humanResourceCapacity: 240,
      lastPopulationCalculationDate: "2026-09-28"
    }];
    current.scene.gridMap.cells["0,0"] = {
      terrainId: "plain",
      impassable: false,
      factionTerritoryIds: ["red"],
      recognizedStateId: "red-state",
      deFactoStateId: "red-state"
    };
    const redArmy = current.armies["army-red"];
    if (!redArmy) throw new Error("red army missing");
    current.armies["army-red"] = { ...redArmy, health: { hp: 30, maxHp: 50 } };

    const positioned = new CommandProcessor(
      () => new Date("2026-09-30T08:00:00.000Z"),
      (position) => ({ x: Math.floor(position.x / 100), y: Math.floor(position.y / 100) })
    );
    const result = positioned.execute(
      context("PLAYER", "leader", current),
      command({ type: "HEAL_ARMY", armyId: "army-red", amount: 10 }, "leader")
    );

    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;
    expect(result.state.armies["army-red"]?.health.hp).toBe(30);
    expect(result.state.armies["army-red"]?.healing).toMatchObject({ pending: true, pendingHp: 2 });
    expect(result.state.scene.demographics?.[0]?.humanResource).toBe(2);
    expect(result.state.scene.lrTransactions?.at(-1)).toMatchObject({
      kind: "HEALING",
      hp: 2,
      ratePerHp: 5,
      amount: 10
    });
  });

  it("does not apply HEAL_ARMY twice for the same requestId", () => {
    const current = state();
    current.scene.sides = current.scene.sides.map((side) =>
      side.id === "red" ? { ...side, stateId: "red-state" } : side
    );
    current.scene.states = [{
      id: "red-state",
      name: "Красное государство",
      rulingFactionId: "red",
      active: true
    }];
    current.scene.demographics = [{
      stateId: "red-state",
      population: 1_000,
      populationGrowthFactor: 1.003,
      humanResource: 20,
      conscriptionLawId: "GENERAL_MOBILIZATION",
      conscriptionRate: 0.24,
      humanResourceCapacity: 240,
      lastPopulationCalculationDate: "2026-09-28"
    }];
    current.scene.gridMap.cells["0,0"] = {
      terrainId: "plain",
      impassable: false,
      factionTerritoryIds: ["red"],
      recognizedStateId: "red-state",
      deFactoStateId: "red-state"
    };
    const redArmy = current.armies["army-red"];
    if (!redArmy) throw new Error("test fixture missing army-red");
    current.armies["army-red"] = { ...redArmy, health: { hp: 30, maxHp: 50 } };

    const positioned = new CommandProcessor(
      () => new Date("2026-09-30T08:00:00.000Z"),
      (position) => ({ x: Math.floor(position.x / 100), y: Math.floor(position.y / 100) })
    );
    const request = command({ type: "HEAL_ARMY", armyId: "army-red", amount: 10 }, "leader");
    const first = positioned.execute(context("PLAYER", "leader", current), request);
    expect(first.status).toBe("ACCEPTED");
    if (first.status !== "ACCEPTED") return;

    const second = positioned.execute(context("PLAYER", "leader", first.state), request);
    expect(second.status).toBe("ACCEPTED");
    if (second.status !== "ACCEPTED") return;
    expect(second.state.armies["army-red"]?.health.hp).toBe(30);
    expect(second.state.scene.lrTransactions?.filter((transaction) => transaction.requestId === request.requestId)).toHaveLength(1);
  });

  it("uses the hospital healing rate when an active military hospital is present", () => {
    const current = state();
    current.scene.sides = current.scene.sides.map((side) =>
      side.id === "red" ? { ...side, stateId: "red-state" } : side
    );
    current.scene.states = [{
      id: "red-state",
      name: "Красное государство",
      rulingFactionId: "red",
      active: true
    }];
    current.scene.demographics = [{
      stateId: "red-state",
      population: 1_000,
      populationGrowthFactor: 1.003,
      humanResource: 15,
      conscriptionLawId: "GENERAL_MOBILIZATION",
      conscriptionRate: 0.24,
      humanResourceCapacity: 240,
      lastPopulationCalculationDate: "2026-09-28"
    }];
    current.scene.gridMap.cells["0,0"] = {
      terrainId: "plain",
      impassable: false,
      factionTerritoryIds: ["red"],
      recognizedStateId: "red-state",
      deFactoStateId: "red-state"
    };
    current.scene.strategicCities = [{
      id: "city-red",
      name: "Красный город",
      cells: [{ x: 0, y: 0 }],
      recognizedStateId: "red-state",
      deFactoStateId: "red-state",
      factionInfluenceId: "red",
      mayorId: null,
      isCapital: false,
      historicalBuildTypeCount: 0,
      buildings: [{ id: "hospital", type: "MILITARY_HOSPITAL", cell: { x: 0, y: 0 } }]
    }];
    const redArmy = current.armies["army-red"];
    if (!redArmy) throw new Error("red army missing");
    current.armies["army-red"] = { ...redArmy, health: { hp: 30, maxHp: 50 } };

    const positioned = new CommandProcessor(
      () => new Date("2026-09-30T08:00:00.000Z"),
      (position) => ({ x: Math.floor(position.x / 100), y: Math.floor(position.y / 100) })
    );
    const result = positioned.execute(
      context("PLAYER", "leader", current),
      command({ type: "HEAL_ARMY", armyId: "army-red", amount: 10 }, "leader")
    );

    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;
    expect(result.state.armies["army-red"]?.health.hp).toBe(30);
    expect(result.state.armies["army-red"]?.healing).toMatchObject({ pending: true, pendingHp: 6, hospitalCityId: "city-red" });
    expect(result.state.scene.demographics?.[0]?.humanResource).toBe(0);
    expect(result.state.scene.lrTransactions?.at(-1)).toMatchObject({
      kind: "HEALING",
      hp: 6,
      ratePerHp: 2.5,
      amount: 15
    });
  });

  it("rejects a crafted player registration without mutating state", () => {
    const playerContext = context("PLAYER", "member");
    const before = structuredClone(playerContext.state);

    expect(processor.execute(
      playerContext,
      command({ type: "REGISTER_ARMY", itemId: "candidate-image", sideId: "red" }, "member")
    )).toEqual({ status: "REJECTED", reason: "GM_ONLY" });
    expect(playerContext.state).toEqual(before);
  });

  it("rejects a crafted player unregister without mutating state", () => {
    const playerContext = context("PLAYER", "member");
    const before = structuredClone(playerContext.state);

    expect(processor.execute(
      playerContext,
      command({ type: "UNREGISTER_ARMY", armyId: "army-red" }, "member")
    )).toEqual({ status: "REJECTED", reason: "GM_ONLY" });
    expect(playerContext.state).toEqual(before);
  });

  it("keeps movement GM-only even for a legacy direct owner", () => {
    expect(
      processor.execute(
        context("PLAYER", "legacy-owner"),
        command({ type: "START_ARMY", armyId: "army-red" }, "legacy-owner")
      )
    ).toEqual({ status: "REJECTED", reason: "GM_ONLY" });
  });

  it.each([
    ["SET_ROUTE", "PLAYER", "leader", "MOVING"],
    ["CLEAR_ROUTE", "PLAYER", "leader", "MOVING"],
    ["SET_ROUTE", "GM", "gm", "MOVING"],
    ["CLEAR_ROUTE", "GM", "gm", "MOVING"],
    ["SET_ROUTE", "PLAYER", "leader", "PAUSED"],
    ["CLEAR_ROUTE", "PLAYER", "leader", "PAUSED"],
    ["SET_ROUTE", "GM", "gm", "PAUSED"],
    ["CLEAR_ROUTE", "GM", "gm", "PAUSED"],
    ["SET_ROUTE", "PLAYER", "leader", "IN_BATTLE"],
    ["CLEAR_ROUTE", "PLAYER", "leader", "IN_BATTLE"],
    ["SET_ROUTE", "GM", "gm", "IN_BATTLE"],
    ["CLEAR_ROUTE", "GM", "gm", "IN_BATTLE"]
  ] as const)(
    "rejects %s by %s %s for an army in %s until the GM stops it",
    (type, role, playerId, status) => {
      const commandState = state();
      const activeArmy = commandState.armies["army-red"];
      if (!activeArmy) throw new Error("Missing test army");
      activeArmy.status = status;
      activeArmy.route = [{ x: 1, y: 0 }];

      const routeCommand = type === "SET_ROUTE"
        ? command({ type, armyId: "army-red", route: [{ x: 2, y: 0 }], startCell: { x: 0, y: 0 }, cells: [{ x: 1, y: 0 }] }, playerId)
        : command({ type, armyId: "army-red" }, playerId);

      expect(processor.execute(context(role, playerId, commandState), routeCommand)).toEqual({
        status: "REJECTED",
        reason: "ARMY_NOT_READY"
      });
      expect(commandState.armies["army-red"]).toMatchObject({
        status,
        route: [{ x: 1, y: 0 }]
      });
    }
  );

  it("forbids transferring armies to another faction when deleting a side", () => {
    expect(processor.execute(
      context("GM", "gm"),
      command({
        type: "DELETE_SIDE",
        sideId: "red",
        strategy: "REASSIGN_ARMIES",
        targetSideId: "blue"
      })
    )).toEqual({ status: "REJECTED", reason: "ARMY_TRANSFER_FORBIDDEN" });
  });

  it("removes unregistered side armies from battle groups", () => {
    const commandState = state();
    commandState.armies["army-blue"] = army("blue");
    commandState.scene.battleGroups = [{
      battleId: "battle",
      name: "Бой 1",
      participantIds: ["army-red", "army-blue"],
      revision: 1
    }];

    const result = processor.execute(
      context("GM", "gm", commandState),
      command({
        type: "DELETE_SIDE",
        sideId: "red",
        strategy: "UNREGISTER_ARMIES"
      })
    );
    expect(result.status).toBe("ACCEPTED");
    if (result.status === "ACCEPTED") {
      expect(result.state.scene.battleGroups).toEqual([]);
      expect(result.state.armies["army-red"]).toBeUndefined();
      expect(result.state.armies["army-blue"]).toBeDefined();
    }
  });

  it("renames a battle for a GM and trims the stored name", () => {
    const commandState = state();
    commandState.scene.battleGroups = [{
      battleId: "battle",
      name: "Бой 1",
      participantIds: ["army-red", "registered-image"],
      revision: 1
    }];

    const result = processor.execute(
      context("GM", "gm", commandState),
      command({ type: "RENAME_BATTLE_GROUP", battleId: "battle", name: "  Переправа  " })
    );

    expect(result).toMatchObject({
      status: "ACCEPTED",
      state: {
        scene: {
          revision: 3,
          battleGroups: [{ name: "Переправа", revision: 2 }]
        }
      }
    });
  });

  it("rejects a player battle rename without mutating state", () => {
    const playerContext = context("PLAYER", "member");
    playerContext.state.scene.battleGroups = [{
      battleId: "battle",
      name: "Бой 1",
      participantIds: ["army-red", "registered-image"],
      revision: 1
    }];
    const before = structuredClone(playerContext.state);

    expect(processor.execute(
      playerContext,
      command({ type: "RENAME_BATTLE_GROUP", battleId: "battle", name: "Чужое имя" }, "member")
    )).toEqual({ status: "REJECTED", reason: "GM_ONLY" });
    expect(playerContext.state).toEqual(before);
  });

  it("resolves a land battle per army, awards XP, and removes zero-HP participants afterwards", () => {
    const commandState = state();
    const red = commandState.armies["army-red"];
    const defeated = commandState.armies["registered-image"];
    if (!red || !defeated) throw new Error("Missing army fixtures");
    commandState.armies["army-red"] = {
      ...red,
      status: "IN_BATTLE",
      battleGroupId: "battle",
      experience: 0,
      health: { hp: 20, maxHp: 40 }
    };
    commandState.armies["registered-image"] = {
      ...defeated,
      status: "IN_BATTLE",
      battleGroupId: "battle",
      experience: 0.5,
      health: { hp: 0, maxHp: 40 }
    };
    commandState.scene.battleGroups = [{
      battleId: "battle",
      name: "Бой 1",
      participantIds: ["army-red", "registered-image"],
      revision: 1
    }];

    const result = processor.execute(
      context("GM", "gm", commandState),
      command({
        type: "RESOLVE_LAND_BATTLE",
        battleId: "battle",
        results: [
          { armyId: "army-red", outcome: "FULL_VICTORY" },
          { armyId: "registered-image", outcome: "DEFEAT" }
        ]
      })
    );

    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;
    expect(result.state.armies["army-red"]?.experience).toBe(1.5);
    expect(result.state.armies["army-red"]?.status).toBe("PAUSED");
    expect(result.state.armies["registered-image"]).toBeUndefined();
    expect(result.state.scene.battleGroups).toEqual([]);
  });

  it("rejects renaming a missing battle", () => {
    expect(processor.execute(
      context("GM", "gm"),
      command({ type: "RENAME_BATTLE_GROUP", battleId: "missing", name: "Переправа" })
    )).toEqual({ status: "REJECTED", reason: "BATTLE_NOT_FOUND" });
  });
  it("lets only the GM edit strategic cells and revalidates saved routes", () => {
    const commandState = state();
    commandState.scene.gridMap.cells["1,0"] = {
      terrainId: "road",
      impassable: false,
      factionTerritoryIds: ["red"],
      recognizedStateId: null,
      deFactoStateId: null
    };
    const existing = commandState.armies["army-red"];
    if (!existing) throw new Error("Missing test army");
    existing.route = [{ x: 150, y: 50 }];
    existing.plannedRoute = {
      startCell: { x: 0, y: 0 },
      executeOnTurn: 2,
      cells: [{ x: 1, y: 0 }],
      totalCostUnits: 1,
      validatedRevision: 2,
      requiresReplan: false
    };

    expect(processor.execute(
      context("PLAYER", "leader", commandState),
      command({ type: "SET_IMPASSABLE_CELLS", cells: [{ x: 1, y: 0 }], impassable: true }, "leader")
    )).toEqual({ status: "REJECTED", reason: "GM_ONLY" });

    const result = processor.execute(
      context("GM", "gm", commandState),
      command({ type: "SET_IMPASSABLE_CELLS", cells: [{ x: 1, y: 0 }], impassable: true })
    );
    expect(result.status).toBe("ACCEPTED");
    if (result.status !== "ACCEPTED") return;
    expect(result.state.armies["army-red"]?.plannedRoute.invalidReason).toBe("IMPASSABLE");
  });

  it("administers turn pause, deferral, resume, and manual completion", () => {
    const now = new Date("2026-09-02T12:30:00.000Z");
    const processor = new CommandProcessor(() => now);
    const commandState = state();
    const redArmy = commandState.armies["army-red"];
    if (!redArmy) throw new Error("Expected army-red fixture");
    commandState.armies["army-red"] = {
      ...redArmy,
      movement: { maxUnits: 10, remainingUnits: 3, enteredRouteCellCount: 0 }
    };

    const deferred = processor.execute(
      context("GM", "gm", commandState),
      command({ type: "DEFER_TURN", until: "2026-09-03T15:00:00.000Z" })
    );
    expect(deferred.status).toBe("ACCEPTED");
    if (deferred.status !== "ACCEPTED") return;
    expect(deferred.state.scene.turn.deferredUntil).toBe("2026-09-03T15:00:00.000Z");

    const paused = processor.execute(
      context("GM", "gm", { ...deferred.state, scene: { ...deferred.state.scene, revision: 2 } }),
      command({ type: "PAUSE_AUTO_TURNS" })
    );
    expect(paused.status).toBe("ACCEPTED");
    if (paused.status !== "ACCEPTED") return;
    expect(paused.state.scene.turn.autoTurnsPaused).toBe(true);
    expect(paused.state.scene.turn.deferredUntil).toBeNull();

    commandState.scene.turn.phase = "POST_MOVEMENT";
    const completed = processor.execute(
      context("GM", "gm", commandState),
      command({ type: "COMPLETE_TURN_NOW" })
    );
    expect(completed.status).toBe("ACCEPTED");
    if (completed.status !== "ACCEPTED") return;
    expect(completed.state.scene.turn.turnNumber).toBe(2);
    expect(completed.state.scene.turn.lastCompletedBy).toBe("MANUAL");
    expect(completed.state.armies["army-red"]?.movement.remainingUnits).toBe(10);
  });

  it("rejects a turn deferral that is not in the future", () => {
    const processor = new CommandProcessor(() => new Date("2026-09-02T12:30:00.000Z"));
    expect(processor.execute(
      context("GM", "gm"),
      command({ type: "DEFER_TURN", until: "2026-09-02T12:00:00.000Z" })
    )).toEqual({ status: "REJECTED", reason: "INVALID_TURN_TIME" });
  });

});

it("revalidates only the unentered route cells when resuming an army", () => {
  const commandState = state();
  commandState.scene.gridMap.cells["1,0"] = {
    terrainId: "road", impassable: false, factionTerritoryIds: ["red"], recognizedStateId: null, deFactoStateId: null
  };
  commandState.scene.gridMap.cells["2,0"] = {
    terrainId: "forest", impassable: false, factionTerritoryIds: ["red"], recognizedStateId: null, deFactoStateId: null
  };
  commandState.armies["army-red"] = {
    ...army("red"),
    status: "PAUSED",
    route: [{ x: 150, y: 50 }, { x: 250, y: 50 }],
    plannedRoute: {
      startCell: { x: 0, y: 0 },
      executeOnTurn: 1,
      cells: [{ x: 1, y: 0 }, { x: 2, y: 0 }],
      totalCostUnits: 5,
      validatedRevision: 2,
      requiresReplan: false
    },
    movement: { maxUnits: 5, remainingUnits: 4, enteredRouteCellCount: 1 },
    currentWaypointIndex: 1
  };

  const result = new CommandProcessor().execute(
    context("GM", "gm", commandState),
    command({ type: "RESUME_ARMY", armyId: "army-red" })
  );

  expect(result.status).toBe("ACCEPTED");
  if (result.status !== "ACCEPTED") return;
  expect(result.state.armies["army-red"]?.status).toBe("MOVING");
});

it("cleans battle and state references while preserving legacy war history when a faction is deleted", () => {
  const commandState = state();
  commandState.armies["army-blue"] = army("blue");
  commandState.armies["army-blue-2"] = army("blue");
  commandState.scene.states = [
    { id: "russia", name: "Россия", rulingFactionId: "red", active: true },
    { id: "germany", name: "Германия", rulingFactionId: "blue", active: true }
  ];
  const redSide = commandState.scene.sides[0];
  const blueSide = commandState.scene.sides[1];
  if (!redSide || !blueSide) throw new Error("Expected red and blue side fixtures");
  redSide.stateId = "russia";
  blueSide.stateId = "germany";
  commandState.scene.battleGroups = [{
    battleId: "battle",
    name: "Бой",
    participantIds: ["army-red", "army-blue", "army-blue-2"],
    revision: 1
  }];
  commandState.scene.wars = [{
    id: "war",
    name: "Война",
    participantFactionIds: ["red", "blue"],
    participantStateIds: ["russia", "germany"],
    active: true
  }];

  const result = new CommandProcessor().execute(
    context("GM", "gm", commandState),
    command({ type: "DELETE_SIDE", sideId: "red", strategy: "UNREGISTER_ARMIES" })
  );
  expect(result.status).toBe("ACCEPTED");
  if (result.status !== "ACCEPTED") return;
  expect(result.state.scene.wars).toHaveLength(1);
  expect(result.state.scene.wars[0]?.participantFactionIds).toEqual(["red", "blue"]);
  expect(result.state.scene.states.find((item) => item.id === "russia")?.rulingFactionId).toBeNull();
});

it("keeps the fixed five-OP budget when a legacy route-distance override is edited", () => {
  const commandState = state();
  const redArmy = commandState.armies["army-red"];
  if (!redArmy) throw new Error("Expected army-red fixture");
  commandState.armies["army-red"] = {
    ...redArmy,
    movement: { maxUnits: 10, remainingUnits: 7, enteredRouteCellCount: 0 }
  };
  const result = new CommandProcessor().execute(
    context("GM", "gm", commandState),
    command({ type: "UPDATE_ARMY_OVERRIDES", armyId: "army-red", overrides: { maxRouteDistanceCells: 99 } })
  );
  expect(result.status).toBe("ACCEPTED");
  if (result.status !== "ACCEPTED") return;
  expect(result.state.armies["army-red"]?.movement).toEqual({
    maxUnits: 10,
    remainingUnits: 7,
    enteredRouteCellCount: 0
  });

});

  it("recalculates an army's supply immediately when a port is added", () => {
    const current = state();
    current.scene.version = 7;
    current.scene.sides = current.scene.sides.map((side) => side.id === "red"
      ? { ...side, stateId: "red-state" }
      : side);
    current.scene.states = [{ id: "red-state", name: "Красное государство", rulingFactionId: "red", active: true }];
    current.scene.gridMap.cells["1,0"] = {
      terrainId: null, impassable: false, factionTerritoryIds: [],
      recognizedStateId: "red-state", deFactoStateId: "red-state"
    };
    current.scene.strategicCities = [{
      id: "city-red",
      name: "Красный город",
      cells: [{ x: 1, y: 0 }],
      recognizedStateId: "red-state",
      deFactoStateId: "red-state",
      factionInfluenceId: "red",
      mayorId: null,
      isCapital: false,
      historicalBuildTypeCount: 0,
      buildings: []
    }];
    const armyRed = current.armies["army-red"];
    if (!armyRed) throw new Error("army missing");
    current.armies["army-red"] = {
      ...armyRed,
      supply: { supplied: false, checkedOnTurn: current.scene.turn.turnNumber, unsuppliedSinceTurn: current.scene.turn.turnNumber }
    };
    const armyItem = current.items["army-red"];
    if (!armyItem) throw new Error("army item missing");
    current.items["army-red"] = { ...armyItem, position: { x: 150, y: 50 } };
    const positioned = new CommandProcessor(
      () => new Date(),
      ({ x, y }) => ({ x: Math.floor(x / 100), y: Math.floor(y / 100) })
    );
    const addStation: StrategicCityCommand = {
      protocolVersion: COMMAND_PROTOCOL_VERSION,
      requestId: "request",
      senderPlayerId: "gm",
      senderConnectionId: "gm-connection",
      expectedRevision: 2,
      type: "ADD_CITY_BUILDING",
      cityId: "city-red",
      building: { id: "port-red", type: "PORT", cell: { x: 1, y: 0 } }
    };
    const result = positioned.execute(context("GM", "gm", current), addStation);

    expect(result.status).toBe("ACCEPTED");
    if (result.status === "ACCEPTED") {
      expect(result.state.armies["army-red"]?.supply).toEqual({
        supplied: true,
        checkedOnTurn: current.scene.turn.turnNumber
      });
    }
  });
