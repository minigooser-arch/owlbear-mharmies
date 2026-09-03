from pathlib import Path

path = Path("src/commands/commandProcessor.ts")
text = path.read_text(encoding="utf-8")
old = '''      case "SET_SHIP_HP": {
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
'''
new = '''      case "SET_SHIP_HP": {
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
'''
if text.count(old) != 1:
    raise SystemExit(f"expected one SET_SHIP_HP block, found {text.count(old)}")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
