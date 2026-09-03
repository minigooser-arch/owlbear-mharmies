from pathlib import Path

path = Path("src/commands/commandProcessor.ts")
text = path.read_text(encoding="utf-8")
old = '''        if (state.scene.navalRevealUntilTurn) {
          delete state.scene.navalRevealUntilTurn[command.sideId];
        }
'''
new = '''        if (state.scene.navalRevealUntilTurn) {
          state.scene.navalRevealUntilTurn = Object.fromEntries(
            Object.entries(state.scene.navalRevealUntilTurn)
              .filter(([sideId]) => sideId !== command.sideId)
          );
        }
'''
count = text.count(old)
if count != 1:
    raise SystemExit(f"Expected exactly one dynamic-delete reveal cleanup block, found {count}")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
