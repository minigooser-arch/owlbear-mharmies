from pathlib import Path


def replace_once(path_str: str, old: str, new: str, label: str) -> None:
    path = Path(path_str)
    text = path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")

replace_once(
    "src/shared/types.ts",
    '    | { type: "SET_SHIP_HP"; shipId: string; hp: number }\n',
    '    | { type: "SET_SHIP_HP"; shipId: string; hp: number }\n'
    '    | { type: "SET_SHIP_DETECTION_OVERRIDE"; shipId: string; detectionOverride: number | null }\n',
    "command payload"
)

replace_once(
    "src/commands/commandValidation.ts",
    '''  SET_SHIP_HP: (value) =>\n    boundedString(value.shipId) && nonNegativeInteger(value.hp)\n      ? { type: "SET_SHIP_HP", shipId: value.shipId, hp: value.hp }\n      : undefined,\n''',
    '''  SET_SHIP_HP: (value) =>\n    boundedString(value.shipId) && nonNegativeInteger(value.hp)\n      ? { type: "SET_SHIP_HP", shipId: value.shipId, hp: value.hp }\n      : undefined,\n  SET_SHIP_DETECTION_OVERRIDE: (value) =>\n    boundedString(value.shipId) &&\n    (value.detectionOverride === null || finiteAtLeast(value.detectionOverride, 0))\n      ? { type: "SET_SHIP_DETECTION_OVERRIDE", shipId: value.shipId, detectionOverride: value.detectionOverride as number | null }\n      : undefined,\n''',
    "command parser"
)

replace_once(
    "src/commands/commandProcessor.ts",
    '''      case "SET_SHIP_HP": {\n        const ship = state.scene.ships?.[command.shipId];\n        if (!ship) return "SHIP_NOT_FOUND";\n''',
    '''      case "SET_SHIP_DETECTION_OVERRIDE": {\n        const ship = state.scene.ships?.[command.shipId];\n        if (!ship) return "SHIP_NOT_FOUND";\n        state.scene.ships ??= {};\n        state.scene.ships[command.shipId] = {\n          ...ship,\n          detectionOverride: command.detectionOverride,\n          revision: ship.revision + 1\n        };\n        return undefined;\n      }\n      case "SET_SHIP_HP": {\n        const ship = state.scene.ships?.[command.shipId];\n        if (!ship) return "SHIP_NOT_FOUND";\n''',
    "command processor"
)
