from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one anchor, found {count}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")

replace_once(
    "src/commands/commandProcessor.ts",
    '      case "START_NAVAL_BATTLE": {\n        if (!this.cellForPosition) return "SHIP_POSITION_UNAVAILABLE";',
    '      case "START_NAVAL_BATTLE": {\n        if (command.areaCells.some((cell) => !cellSupportsDomain(state.scene, cell, "SEA"))) {\n          return "INVALID_NAVAL_BATTLE_AREA";\n        }\n        if (!this.cellForPosition) return "SHIP_POSITION_UNAVAILABLE";'
)

replace_once(
    "src/owlbear/notifications.ts",
    '  | "INVALID_NAVAL_TACTICAL_ACTION";',
    '  | "INVALID_NAVAL_TACTICAL_ACTION"\n  | "INVALID_NAVAL_BATTLE_AREA";'
)
replace_once(
    "src/owlbear/notifications.ts",
    '  INVALID_NAVAL_TACTICAL_ACTION: "Этот морской манёвр сейчас недоступен."',
    '  INVALID_NAVAL_TACTICAL_ACTION: "Этот морской манёвр сейчас недоступен.",\n  INVALID_NAVAL_BATTLE_AREA: "Поле морского боя может состоять только из морских клеток."'
)

replace_once(
    "src/owlbear/notifications.test.ts",
    '    ["SHIP_DESTROYED", "Уничтоженный корабль не может выполнять это действие."]',
    '    ["SHIP_DESTROYED", "Уничтоженный корабль не может выполнять это действие."],\n    ["INVALID_NAVAL_BATTLE_AREA", "Поле морского боя может состоять только из морских клеток."]'
)
