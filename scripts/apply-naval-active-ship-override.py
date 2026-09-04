from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected anchor once, found {count}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


Path("src/naval/battle/navalTurnOverride.ts").write_text('''import type { NavalBattleState, ShipState } from "../../shared/types";\n\nexport type NavalActiveShipOverrideResult =\n  | { ok: true; battle: NavalBattleState }\n  | { ok: false; reason: string };\n\nexport function setActiveNavalShipOverride(\n  battle: NavalBattleState,\n  ships: Readonly<Record<string, ShipState>>,\n  shipId: string\n): NavalActiveShipOverrideResult {\n  if (battle.status !== "ACTIVE") return { ok: false, reason: "NO_ACTIVE_NAVAL_BATTLE" };\n  if (battle.currentShipId === shipId) return { ok: false, reason: "INVALID_NAVAL_TACTICAL_ACTION" };\n  if (!battle.participantShipIds.includes(shipId) || !battle.initiative.some((entry) => entry.shipId === shipId)) {\n    return { ok: false, reason: "SHIP_NOT_IN_NAVAL_BATTLE" };\n  }\n\n  const ship = ships[shipId];\n  if (!ship) return { ok: false, reason: "SHIP_NOT_FOUND" };\n  if (ship.status !== "IN_NAVAL_BATTLE" || ship.battleId !== battle.id) {\n    return { ok: false, reason: "SHIP_NOT_IN_NAVAL_BATTLE" };\n  }\n  if (ship.hp <= 0) return { ok: false, reason: "SHIP_DESTROYED" };\n  if (battle.exitedShipIds.includes(shipId)) return { ok: false, reason: "SHIP_ALREADY_EXITED" };\n  if (battle.completedShipIdsThisRound.includes(shipId)) {\n    return { ok: false, reason: "INVALID_NAVAL_TACTICAL_ACTION" };\n  }\n\n  const next = structuredClone(battle);\n  next.currentShipId = shipId;\n  next.revision += 1;\n  return { ok: true, battle: next };\n}\n''', encoding="utf-8")

replace_once(
    "src/shared/types.ts",
    '''    | { type: "END_NAVAL_SHIP_TURN"; shipId: string }\n    | { type: "CONFIRM_NAVAL_SHIP_EXIT"; shipId: string }\n''',
    '''    | { type: "END_NAVAL_SHIP_TURN"; shipId: string }\n    | { type: "SET_ACTIVE_NAVAL_SHIP"; shipId: string }\n    | { type: "CONFIRM_NAVAL_SHIP_EXIT"; shipId: string }\n'''
)

replace_once(
    "src/commands/commandValidation.ts",
    '''  END_NAVAL_SHIP_TURN: (value) => boundedString(value.shipId)\n    ? { type: "END_NAVAL_SHIP_TURN", shipId: value.shipId }\n    : undefined,\n  CONFIRM_NAVAL_SHIP_EXIT: (value) => boundedString(value.shipId)\n''',
    '''  END_NAVAL_SHIP_TURN: (value) => boundedString(value.shipId)\n    ? { type: "END_NAVAL_SHIP_TURN", shipId: value.shipId }\n    : undefined,\n  SET_ACTIVE_NAVAL_SHIP: (value) => boundedString(value.shipId)\n    ? { type: "SET_ACTIVE_NAVAL_SHIP", shipId: value.shipId }\n    : undefined,\n  CONFIRM_NAVAL_SHIP_EXIT: (value) => boundedString(value.shipId)\n'''
)

replace_once(
    "src/commands/commandProcessor.ts",
    '''import { endNavalShipTurn } from "../naval/battle/navalRoundFlow";\nimport { confirmNavalShipExit } from "../naval/battle/navalExit";\n''',
    '''import { endNavalShipTurn } from "../naval/battle/navalRoundFlow";\nimport { setActiveNavalShipOverride } from "../naval/battle/navalTurnOverride";\nimport { confirmNavalShipExit } from "../naval/battle/navalExit";\n'''
)

replace_once(
    "src/commands/commandProcessor.ts",
    '''      case "START_NAVAL_BATTLE": {\n''',
    '''      case "SET_ACTIVE_NAVAL_SHIP": {\n        const battle = state.scene.activeNavalBattle;\n        if (!battle || battle.status !== "ACTIVE") return "NO_ACTIVE_NAVAL_BATTLE";\n        const override = setActiveNavalShipOverride(\n          battle,\n          state.scene.ships ?? {},\n          command.shipId\n        );\n        if (!override.ok) return override.reason;\n        state.scene.activeNavalBattle = override.battle;\n        return undefined;\n      }\n      case "START_NAVAL_BATTLE": {\n'''
)
