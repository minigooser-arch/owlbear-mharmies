from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one anchor, found {count}: {old[:100]!r}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


# Protocol payloads.
replace_once(
    "src/shared/types.ts",
    '    | { type: "SET_SHIP_HP"; shipId: string; hp: number }\n',
    '    | { type: "SET_SHIP_HP"; shipId: string; hp: number }\n'
    '    | { type: "NAVAL_MOVE_FORWARD"; shipId: string }\n'
    '    | { type: "NAVAL_TURN_SHIP"; shipId: string; direction: "LEFT" | "RIGHT" }\n'
    '    | { type: "END_NAVAL_SHIP_TURN"; shipId: string }\n'
)

# Command parsing.
replace_once(
    "src/commands/commandValidation.ts",
    '  SET_SHIP_HP: (value) =>\n'
    '    boundedString(value.shipId) && nonNegativeInteger(value.hp)\n'
    '      ? { type: "SET_SHIP_HP", shipId: value.shipId, hp: value.hp }\n'
    '      : undefined,\n',
    '  SET_SHIP_HP: (value) =>\n'
    '    boundedString(value.shipId) && nonNegativeInteger(value.hp)\n'
    '      ? { type: "SET_SHIP_HP", shipId: value.shipId, hp: value.hp }\n'
    '      : undefined,\n'
    '  NAVAL_MOVE_FORWARD: (value) => boundedString(value.shipId)\n'
    '    ? { type: "NAVAL_MOVE_FORWARD", shipId: value.shipId }\n'
    '    : undefined,\n'
    '  NAVAL_TURN_SHIP: (value) => boundedString(value.shipId) && (value.direction === "LEFT" || value.direction === "RIGHT")\n'
    '    ? { type: "NAVAL_TURN_SHIP", shipId: value.shipId, direction: value.direction }\n'
    '    : undefined,\n'
    '  END_NAVAL_SHIP_TURN: (value) => boundedString(value.shipId)\n'
    '    ? { type: "END_NAVAL_SHIP_TURN", shipId: value.shipId }\n'
    '    : undefined,\n'
)

# Player authorization: same ownership rule as strategic ship routing.
replace_once(
    "src/shared/permissions.ts",
    '  if (command.type === "SET_SHIP_ROUTE") {\n'
    '    const ship = context.ships?.get(command.shipId);\n'
    '    if (!ship) return { allowed: false, reason: "SHIP_NOT_FOUND" };\n'
    '    return ledBy(context, ship.sideId);\n'
    '  }',
    '  if (\n'
    '    command.type === "SET_SHIP_ROUTE" ||\n'
    '    command.type === "NAVAL_MOVE_FORWARD" ||\n'
    '    command.type === "NAVAL_TURN_SHIP" ||\n'
    '    command.type === "END_NAVAL_SHIP_TURN"\n'
    '  ) {\n'
    '    const ship = context.ships?.get(command.shipId);\n'
    '    if (!ship) return { allowed: false, reason: "SHIP_NOT_FOUND" };\n'
    '    return ledBy(context, ship.sideId);\n'
    '  }'
)

# Processor composition.
replace_once(
    "src/commands/commandProcessor.ts",
    'import { applyShipStrategicRouteCommand } from "./shipStrategicRouteCommand";\n',
    'import { applyShipStrategicRouteCommand } from "./shipStrategicRouteCommand";\n'
    'import { applyForwardTacticalStep, applyTacticalTurn, forwardCell } from "../naval/battle/navalTacticalMovement";\n'
    'import { endNavalShipTurn } from "../naval/battle/navalRoundFlow";\n'
)
replace_once(
    "src/commands/commandProcessor.ts",
    '  constructor(\n'
    '    private readonly now: () => Date = () => new Date(),\n'
    '    private readonly cellForPosition?: (position: Vector2) => GridCellCoord\n'
    '  ) {}',
    '  constructor(\n'
    '    private readonly now: () => Date = () => new Date(),\n'
    '    private readonly cellForPosition?: (position: Vector2) => GridCellCoord,\n'
    '    private readonly positionForCell?: (cell: GridCellCoord) => Vector2\n'
    '  ) {}'
)
replace_once(
    "src/commands/commandProcessor.ts",
    '  private apply(\n',
    '  private navalTacticalFailure(error: unknown): string {\n'
    '    const message = error instanceof Error ? error.message : String(error);\n'
    '    if (message === "Ship is not active") return "SHIP_NOT_ACTIVE";\n'
    '    if (message === "Outside naval battle area") return "OUTSIDE_NAVAL_BATTLE_AREA";\n'
    '    if (message === "Insufficient naval movement") return "INSUFFICIENT_NAVAL_MOVEMENT";\n'
    '    if (message === "Naval action already used") return "NAVAL_ACTION_ALREADY_USED";\n'
    '    return "INVALID_NAVAL_TACTICAL_ACTION";\n'
    '  }\n\n'
    '  private apply(\n'
)
replace_once(
    "src/commands/commandProcessor.ts",
    '      case "SET_SHIP_HP": {\n',
    '      case "NAVAL_MOVE_FORWARD": {\n'
    '        const battle = state.scene.activeNavalBattle;\n'
    '        if (!battle || battle.status !== "ACTIVE") return "NO_ACTIVE_NAVAL_BATTLE";\n'
    '        const ship = state.scene.ships?.[command.shipId];\n'
    '        if (!ship) return "SHIP_NOT_FOUND";\n'
    '        if (ship.status !== "IN_NAVAL_BATTLE" || ship.battleId !== battle.id) return "SHIP_NOT_IN_NAVAL_BATTLE";\n'
    '        if (battle.currentShipId !== command.shipId) return "SHIP_NOT_ACTIVE";\n'
    '        const position = state.positions?.[command.shipId] ?? state.items[command.shipId]?.position;\n'
    '        if (!position || !this.cellForPosition || !this.positionForCell) return "SHIP_POSITION_UNAVAILABLE";\n'
    '        const from = this.cellForPosition(position);\n'
    '        try {\n'
    '          const result = applyForwardTacticalStep(\n'
    '            battle, command.shipId, ship, from, forwardCell(from, ship.facing)\n'
    '          );\n'
    '          state.scene.activeNavalBattle = result.battle;\n'
    '          state.positions ??= {};\n'
    '          state.positions[command.shipId] = this.positionForCell(result.destination);\n'
    '          return undefined;\n'
    '        } catch (error) {\n'
    '          return this.navalTacticalFailure(error);\n'
    '        }\n'
    '      }\n'
    '      case "NAVAL_TURN_SHIP": {\n'
    '        const battle = state.scene.activeNavalBattle;\n'
    '        if (!battle || battle.status !== "ACTIVE") return "NO_ACTIVE_NAVAL_BATTLE";\n'
    '        const ship = state.scene.ships?.[command.shipId];\n'
    '        if (!ship) return "SHIP_NOT_FOUND";\n'
    '        if (ship.status !== "IN_NAVAL_BATTLE" || ship.battleId !== battle.id) return "SHIP_NOT_IN_NAVAL_BATTLE";\n'
    '        if (battle.currentShipId !== command.shipId) return "SHIP_NOT_ACTIVE";\n'
    '        try {\n'
    '          const result = applyTacticalTurn(battle, command.shipId, ship, command.direction);\n'
    '          state.scene.activeNavalBattle = result.battle;\n'
    '          state.scene.ships ??= {};\n'
    '          state.scene.ships[command.shipId] = result.ship;\n'
    '          return undefined;\n'
    '        } catch (error) {\n'
    '          return this.navalTacticalFailure(error);\n'
    '        }\n'
    '      }\n'
    '      case "END_NAVAL_SHIP_TURN": {\n'
    '        const battle = state.scene.activeNavalBattle;\n'
    '        if (!battle || battle.status !== "ACTIVE") return "NO_ACTIVE_NAVAL_BATTLE";\n'
    '        const ship = state.scene.ships?.[command.shipId];\n'
    '        if (!ship) return "SHIP_NOT_FOUND";\n'
    '        if (ship.status !== "IN_NAVAL_BATTLE" || ship.battleId !== battle.id) return "SHIP_NOT_IN_NAVAL_BATTLE";\n'
    '        if (battle.currentShipId !== command.shipId) return "SHIP_NOT_ACTIVE";\n'
    '        try {\n'
    '          state.scene.activeNavalBattle = endNavalShipTurn(battle, state.scene.ships ?? {}, command.shipId);\n'
    '          return undefined;\n'
    '        } catch (error) {\n'
    '          return this.navalTacticalFailure(error);\n'
    '        }\n'
    '      }\n'
    '      case "SET_SHIP_HP": {\n'
)

# Runtime grid conversion for forward movement.
replace_once(
    "src/background/application.ts",
    '    let commandCellForPosition: ((position: Vector2) => import("../shared/types").GridCellCoord) | undefined;\n'
    '    if (command.type === "COMPLETE_TURN_NOW" || command.type === "REGISTER_SHIP") {\n'
    '      try {\n'
    '        const grid = new StrategicGridAdapter({ dpi: await this.grid.getDpi(), offset: { x: 0, y: 0 } });\n'
    '        commandCellForPosition = (position) => grid.sceneToCell(position);\n'
    '      } catch {\n'
    '        // CommandProcessor rejects commands that require strategic cells when positions cannot be resolved.\n'
    '      }\n'
    '    }\n'
    '    const result = new CommandProcessor(() => this.wallClock(), commandCellForPosition).execute(',
    '    let commandCellForPosition: ((position: Vector2) => import("../shared/types").GridCellCoord) | undefined;\n'
    '    let commandPositionForCell: ((cell: import("../shared/types").GridCellCoord) => Vector2) | undefined;\n'
    '    if (command.type === "COMPLETE_TURN_NOW" || command.type === "REGISTER_SHIP" || command.type === "NAVAL_MOVE_FORWARD") {\n'
    '      try {\n'
    '        const grid = new StrategicGridAdapter({ dpi: await this.grid.getDpi(), offset: { x: 0, y: 0 } });\n'
    '        commandCellForPosition = (position) => grid.sceneToCell(position);\n'
    '        commandPositionForCell = (cell) => grid.cellToSceneCenter(cell);\n'
    '      } catch {\n'
    '        // CommandProcessor rejects commands that require strategic cells when positions cannot be resolved.\n'
    '      }\n'
    '    }\n'
    '    const result = new CommandProcessor(() => this.wallClock(), commandCellForPosition, commandPositionForCell).execute('
)

# Persist tactical source-token position without touching the battle snapshot.
replace_once(
    "src/background/application.ts",
    '      for (const shipId of shipIds) {\n'
    '        const previousState = previousShips[shipId];\n'
    '        const state = nextShips[shipId];\n'
    '        if (JSON.stringify(previousState) === JSON.stringify(state)) continue;\n'
    '        const item = itemById.get(shipId);\n'
    '        if (!item) continue;\n'
    '        if (!canCommit()) throw new Error("Coordinator stopped during persistence");\n'
    '        await this.port.patchSceneItemMetadata(\n'
    '          shipId,\n'
    '          METADATA_KEYS.ship,\n'
    '          state,\n'
    '          { visible: state === undefined },\n'
    '          previousState?.revision ?? null\n'
    '        );\n'
    '        applied.push({\n'
    '          itemId: shipId,\n'
    '          key: METADATA_KEYS.ship,\n'
    '          previousValue: previousState,\n'
    '          rollbackUpdate: { visible: item.visible ?? true },\n'
    '          expectedRevision: state?.revision ?? null\n'
    '        });\n'
    '      }',
    '      for (const shipId of shipIds) {\n'
    '        const previousState = previousShips[shipId];\n'
    '        const state = nextShips[shipId];\n'
    '        const previousPosition = previous.positions?.[shipId];\n'
    '        const nextPosition = next.positions?.[shipId];\n'
    '        if (\n'
    '          JSON.stringify(previousState) === JSON.stringify(state) &&\n'
    '          JSON.stringify(previousPosition) === JSON.stringify(nextPosition)\n'
    '        ) continue;\n'
    '        const item = itemById.get(shipId);\n'
    '        if (!item) continue;\n'
    '        if (!canCommit()) throw new Error("Coordinator stopped during persistence");\n'
    '        await this.port.patchSceneItemMetadata(\n'
    '          shipId,\n'
    '          METADATA_KEYS.ship,\n'
    '          state,\n'
    '          { visible: state === undefined, ...(nextPosition ? { position: nextPosition } : {}) },\n'
    '          previousState?.revision ?? null\n'
    '        );\n'
    '        applied.push({\n'
    '          itemId: shipId,\n'
    '          key: METADATA_KEYS.ship,\n'
    '          previousValue: previousState,\n'
    '          rollbackUpdate: { visible: item.visible ?? true, ...(previousPosition ? { position: previousPosition } : {}) },\n'
    '          expectedRevision: state?.revision ?? null\n'
    '        });\n'
    '      }'
)

# User-facing rejection messages.
replace_once(
    "src/owlbear/notifications.ts",
    '  | "INVALID_METADATA";\n',
    '  | "INVALID_METADATA"\n'
    '  | "NO_ACTIVE_NAVAL_BATTLE"\n'
    '  | "SHIP_NOT_IN_NAVAL_BATTLE"\n'
    '  | "SHIP_NOT_ACTIVE"\n'
    '  | "SHIP_POSITION_UNAVAILABLE"\n'
    '  | "OUTSIDE_NAVAL_BATTLE_AREA"\n'
    '  | "INSUFFICIENT_NAVAL_MOVEMENT"\n'
    '  | "NAVAL_ACTION_ALREADY_USED"\n'
    '  | "INVALID_NAVAL_TACTICAL_ACTION";\n'
)
replace_once(
    "src/owlbear/notifications.ts",
    '  INVALID_METADATA: "Данные расширения повреждены или имеют неизвестную версию."\n};',
    '  INVALID_METADATA: "Данные расширения повреждены или имеют неизвестную версию.",\n'
    '  NO_ACTIVE_NAVAL_BATTLE: "Сейчас нет активного морского боя.",\n'
    '  SHIP_NOT_IN_NAVAL_BATTLE: "Этот корабль не участвует в текущем морском бою.",\n'
    '  SHIP_NOT_ACTIVE: "Сейчас ход другого корабля.",\n'
    '  SHIP_POSITION_UNAVAILABLE: "Не удалось определить клетку корабля на поле боя.",\n'
    '  OUTSIDE_NAVAL_BATTLE_AREA: "Корабль не может выйти за границы поля морского боя.",\n'
    '  INSUFFICIENT_NAVAL_MOVEMENT: "У корабля не хватает очков перемещения для этого манёвра.",\n'
    '  NAVAL_ACTION_ALREADY_USED: "После активного действия корабль больше не может двигаться в этот ход.",\n'
    '  INVALID_NAVAL_TACTICAL_ACTION: "Этот морской манёвр сейчас недоступен."\n'
    '};'
)
