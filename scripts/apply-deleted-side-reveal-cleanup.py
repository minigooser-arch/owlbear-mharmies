from pathlib import Path

path = Path("src/commands/commandProcessor.ts")
text = path.read_text(encoding="utf-8")
old = '        state.scene.sides = state.scene.sides.filter((side) => side.id !== command.sideId);\n'
new = old + '        if (state.scene.navalRevealUntilTurn) {\n          delete state.scene.navalRevealUntilTurn[command.sideId];\n        }\n'
count = text.count(old)
if count != 1:
    raise SystemExit(f"Expected exactly one DELETE_SIDE side-removal anchor, found {count}")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
