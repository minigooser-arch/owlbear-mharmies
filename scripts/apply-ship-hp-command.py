from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"pattern not found in {path}: {old[:120]!r}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "src/shared/types.ts",
    '    | { type: "SET_SHIP_ROUTE"; shipId: string; startCell: GridCellCoord; cells: GridCellCoord[] }\n',
    '    | { type: "SET_SHIP_ROUTE"; shipId: string; startCell: GridCellCoord; cells: GridCellCoord[] }\n    | { type: "SET_SHIP_HP"; shipId: string; hp: number }\n'
)

replace_once(
    "src/commands/commandValidation.ts",
    '''  SET_SHIP_ROUTE: (value) => {
    const startCell = parseGridCell(value.startCell);
    const cells = parseOrderedCells(value.cells);
    return boundedString(value.shipId) && startCell && cells
      ? { type: "SET_SHIP_ROUTE", shipId: value.shipId, startCell, cells }
      : undefined;
  },
''',
    '''  SET_SHIP_ROUTE: (value) => {
    const startCell = parseGridCell(value.startCell);
    const cells = parseOrderedCells(value.cells);
    return boundedString(value.shipId) && startCell && cells
      ? { type: "SET_SHIP_ROUTE", shipId: value.shipId, startCell, cells }
      : undefined;
  },
  SET_SHIP_HP: (value) =>
    boundedString(value.shipId) && nonNegativeInteger(value.hp)
      ? { type: "SET_SHIP_HP", shipId: value.shipId, hp: value.hp }
      : undefined,
'''
)

replace_once(
    "src/commands/commandProcessor.ts",
    'import { createRegisteredShip, destroyShip } from "../naval/ships/shipLifecycle";\n',
    'import { createRegisteredShip, destroyShip } from "../naval/ships/shipLifecycle";\nimport { SHIP_CLASSES } from "../naval/ships/shipClasses";\n'
)

replace_once(
    "src/commands/commandProcessor.ts",
    '''      case "SET_SHIP_ROUTE":
        return applyShipStrategicRouteCommand(state, command, this.cellForPosition);
      case "CREATE_SIDE":
''',
    '''      case "SET_SHIP_ROUTE":
        return applyShipStrategicRouteCommand(state, command, this.cellForPosition);
      case "SET_SHIP_HP": {
        const ship = state.scene.ships?.[command.shipId];
        if (!ship) return "SHIP_NOT_FOUND";
        const maxHp = SHIP_CLASSES[ship.classId].maxHp;
        if (command.hp > maxHp) return "INVALID_HP";
        state.scene.ships ??= {};
        state.scene.ships[command.shipId] = {
          ...ship,
          hp: command.hp,
          revision: ship.revision + 1
        };
        return undefined;
      }
      case "CREATE_SIDE":
'''
)

replace_once(
    "src/owlbear/notifications.ts",
    '  | "INVALID_COMMAND"\n',
    '  | "INVALID_COMMAND"\n  | "INVALID_HP"\n'
)
replace_once(
    "src/owlbear/notifications.ts",
    '  INVALID_COMMAND: "Команда не распознана. Обновите расширение и повторите действие.",\n',
    '  INVALID_COMMAND: "Команда не распознана. Обновите расширение и повторите действие.",\n  INVALID_HP: "Укажите допустимое целое значение HP корабля.",\n'
)

Path("scripts/apply-ship-hp-command.py").unlink(missing_ok=True)
Path(".github/workflows/ship-hp-command.yml").unlink(missing_ok=True)
