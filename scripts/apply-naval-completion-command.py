from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one anchor, found {count}")
    p.write_text(text.replace(old, new), encoding="utf-8")

replace_once(
    "src/shared/types.ts",
    '    | { type: "END_NAVAL_SHIP_TURN"; shipId: string }\n    | { type: "CREATE_SIDE"; side: Side }',
    '    | { type: "END_NAVAL_SHIP_TURN"; shipId: string }\n    | { type: "COMPLETE_NAVAL_BATTLE" }\n    | { type: "CREATE_SIDE"; side: Side }'
)

replace_once(
    "src/commands/commandValidation.ts",
    '  END_NAVAL_SHIP_TURN: (value) => boundedString(value.shipId)\n    ? { type: "END_NAVAL_SHIP_TURN", shipId: value.shipId }\n    : undefined,\n  CREATE_SIDE: (value) => {',
    '  END_NAVAL_SHIP_TURN: (value) => boundedString(value.shipId)\n    ? { type: "END_NAVAL_SHIP_TURN", shipId: value.shipId }\n    : undefined,\n  COMPLETE_NAVAL_BATTLE: () => ({ type: "COMPLETE_NAVAL_BATTLE" }),\n  CREATE_SIDE: (value) => {'
)

replace_once(
    "src/commands/commandProcessor.ts",
    'import { endNavalShipTurn } from "../naval/battle/navalRoundFlow";\n',
    'import { endNavalShipTurn } from "../naval/battle/navalRoundFlow";\nimport { completeNavalBattle } from "../naval/battle/navalBattleLifecycle";\n'
)

replace_once(
    "src/commands/commandProcessor.ts",
    '''      case "END_NAVAL_SHIP_TURN": {
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
      case "SET_SHIP_DETECTION_OVERRIDE": {''',
    '''      case "END_NAVAL_SHIP_TURN": {
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
      case "COMPLETE_NAVAL_BATTLE": {
        const battle = state.scene.activeNavalBattle;
        if (!battle || battle.status !== "ACTIVE") return "NO_ACTIVE_NAVAL_BATTLE";
        const sceneRevision = state.scene.revision;
        const completed = completeNavalBattle(state.scene as NavalSceneState);
        completed.revision = sceneRevision;
        state.scene = completed;
        state.positions ??= {};
        for (const [shipId, snapshot] of Object.entries(battle.snapshots)) {
          const ship = state.scene.ships?.[shipId];
          if (!ship) continue;
          state.scene.ships[shipId] = {
            ...ship,
            facing: snapshot.strategicFacing
          };
          state.positions[shipId] = { ...snapshot.strategicPosition };
        }
        return undefined;
      }
      case "SET_SHIP_DETECTION_OVERRIDE": {'''
)
