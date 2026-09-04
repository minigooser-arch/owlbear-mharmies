from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one anchor, found {count}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")

replace_once(
    "src/shared/types.ts",
    '    | { type: "END_NAVAL_SHIP_TURN"; shipId: string }\n    | {\n        type: "START_NAVAL_BATTLE";',
    '    | { type: "END_NAVAL_SHIP_TURN"; shipId: string }\n    | { type: "CONFIRM_NAVAL_SHIP_EXIT"; shipId: string }\n    | {\n        type: "START_NAVAL_BATTLE";'
)

replace_once(
    "src/commands/commandValidation.ts",
    '  END_NAVAL_SHIP_TURN: (value) => boundedString(value.shipId)\n    ? { type: "END_NAVAL_SHIP_TURN", shipId: value.shipId }\n    : undefined,\n  START_NAVAL_BATTLE:',
    '  END_NAVAL_SHIP_TURN: (value) => boundedString(value.shipId)\n    ? { type: "END_NAVAL_SHIP_TURN", shipId: value.shipId }\n    : undefined,\n  CONFIRM_NAVAL_SHIP_EXIT: (value) => boundedString(value.shipId)\n    ? { type: "CONFIRM_NAVAL_SHIP_EXIT", shipId: value.shipId }\n    : undefined,\n  START_NAVAL_BATTLE:'
)

replace_once(
    "src/commands/commandProcessor.ts",
    'import { endNavalShipTurn } from "../naval/battle/navalRoundFlow";',
    'import { endNavalShipTurn } from "../naval/battle/navalRoundFlow";\nimport { confirmNavalShipExit } from "../naval/battle/navalExit";'
)
replace_once(
    "src/commands/commandProcessor.ts",
    '    if (message === "Ship is not active") return "SHIP_NOT_ACTIVE";\n    if (message === "Outside naval battle area")',
    '    if (message === "Ship is not active") return "SHIP_NOT_ACTIVE";\n    if (message === "Ship already exited naval battle") return "SHIP_ALREADY_EXITED";\n    if (message === "Outside naval battle area")'
)
replace_once(
    "src/commands/commandProcessor.ts",
    '      case "END_NAVAL_SHIP_TURN": {\n        const battle = state.scene.activeNavalBattle;',
    '      case "CONFIRM_NAVAL_SHIP_EXIT": {\n        const battle = state.scene.activeNavalBattle;\n        if (!battle || battle.status !== "ACTIVE") return "NO_ACTIVE_NAVAL_BATTLE";\n        const ship = state.scene.ships?.[command.shipId];\n        if (!ship) return "SHIP_NOT_FOUND";\n        if (ship.status !== "IN_NAVAL_BATTLE" || ship.battleId !== battle.id) return "SHIP_NOT_IN_NAVAL_BATTLE";\n        if (ship.hp <= 0) return "SHIP_DESTROYED";\n        try {\n          state.scene.activeNavalBattle = confirmNavalShipExit(\n            battle,\n            state.scene.ships ?? {},\n            command.shipId\n          );\n          return undefined;\n        } catch (error) {\n          return this.navalTacticalFailure(error);\n        }\n      }\n      case "END_NAVAL_SHIP_TURN": {\n        const battle = state.scene.activeNavalBattle;'
)

replace_once(
    "src/owlbear/notifications.ts",
    '  | "INVALID_NAVAL_BATTLE_AREA";',
    '  | "INVALID_NAVAL_BATTLE_AREA"\n  | "SHIP_ALREADY_EXITED";'
)
replace_once(
    "src/owlbear/notifications.ts",
    '  INVALID_NAVAL_BATTLE_AREA: "Поле морского боя может состоять только из морских клеток."',
    '  INVALID_NAVAL_BATTLE_AREA: "Поле морского боя может состоять только из морских клеток.",\n  SHIP_ALREADY_EXITED: "Этот корабль уже вышел из морского боя."'
)
replace_once(
    "src/owlbear/notifications.test.ts",
    '    ["INVALID_NAVAL_BATTLE_AREA", "Поле морского боя может состоять только из морских клеток."]',
    '    ["INVALID_NAVAL_BATTLE_AREA", "Поле морского боя может состоять только из морских клеток."],\n    ["SHIP_ALREADY_EXITED", "Этот корабль уже вышел из морского боя."]'
)
