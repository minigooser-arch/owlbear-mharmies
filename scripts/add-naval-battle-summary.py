from pathlib import Path

path = Path('src/owlbear/extensionServices.ts')
text = path.read_text(encoding='utf-8')
old = '''      effectiveDetectionRange: state.detectionOverride ?? input.scene.settings.defaultDetectionRangeCells,
      ...tactical
    };
  });
  return {
    ready: true,
'''
new = '''      effectiveDetectionRange: state.detectionOverride ?? input.scene.settings.defaultDetectionRangeCells,
      ...tactical
    };
  });
  const activeNavalBattle = input.role === "GM" && input.scene.activeNavalBattle?.status === "ACTIVE"
    ? {
        id: input.scene.activeNavalBattle.id,
        roundNumber: input.scene.activeNavalBattle.roundNumber,
        participantCount: input.scene.activeNavalBattle.participantShipIds.length,
        currentShipId: input.scene.activeNavalBattle.currentShipId
      }
    : undefined;
  return {
    ready: true,
'''
if text.count(old) != 1:
    raise SystemExit(f'expected one ship snapshot anchor, found {text.count(old)}')
text = text.replace(old, new)
old = '''    armies,
    ships,
    sides: input.scene.sides,
'''
new = '''    armies,
    ships,
    ...(activeNavalBattle ? { activeNavalBattle } : {}),
    sides: input.scene.sides,
'''
if text.count(old) != 1:
    raise SystemExit(f'expected one snapshot return anchor, found {text.count(old)}')
path.write_text(text.replace(old, new), encoding='utf-8')
