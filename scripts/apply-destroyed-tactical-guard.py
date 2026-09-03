from pathlib import Path

path = Path("src/commands/commandProcessor.ts")
text = path.read_text(encoding="utf-8")
old = '''        if (ship.status !== "IN_NAVAL_BATTLE" || ship.battleId !== battle.id) return "SHIP_NOT_IN_NAVAL_BATTLE";
        if (battle.currentShipId !== command.shipId) return "SHIP_NOT_ACTIVE";'''
new = '''        if (ship.status !== "IN_NAVAL_BATTLE" || ship.battleId !== battle.id) return "SHIP_NOT_IN_NAVAL_BATTLE";
        if (ship.hp <= 0) return "SHIP_DESTROYED";
        if (battle.currentShipId !== command.shipId) return "SHIP_NOT_ACTIVE";'''
count = text.count(old)
if count != 3:
    raise SystemExit(f"expected 3 tactical guard sites, found {count}")
path.write_text(text.replace(old, new), encoding="utf-8")
