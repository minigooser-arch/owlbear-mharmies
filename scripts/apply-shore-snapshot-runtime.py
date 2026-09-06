from pathlib import Path

path = Path("src/owlbear/extensionServices.ts")
text = path.read_text(encoding="utf-8")

needle = '''    const hospitalSupportTargets =
      battle?.status === "ACTIVE" &&
      state.classId === "HOSPITAL" &&
      state.hp > 0 &&
      state.status === "IN_NAVAL_BATTLE" &&
      state.battleId === battle.id &&
      battle.currentShipId === item.id &&
      !battle.actionUsedByShip[item.id] &&
      (input.role === "GM" || leaderSideIds.has(state.sideId))
        ? shipRecords
            .filter(({ item: targetItem, state: targetState }) =>
              targetItem.id !== item.id &&
              battle.participantShipIds.includes(targetItem.id) &&
              targetState.status === "IN_NAVAL_BATTLE" &&
              targetState.battleId === battle.id &&
              targetState.hp > 0 &&
              !battle.exitedShipIds.includes(targetItem.id) &&
              (input.role === "GM" || memberSideIds.has(targetState.sideId) || mapVisibleSourceIds.has(targetItem.id))
            )
            .map(({ item: targetItem, state: targetState }) => ({
              id: targetItem.id,
              name: targetItem.name ?? "Безымянный корабль",
              sideId: targetState.sideId,
              sideName: sideNames.get(targetState.sideId) ?? "Неизвестная сторона"
            }))
        : [];
'''
replacement = needle + '''    const shoreBombardmentTargets =
      input.scene.turn.phase === "POST_MOVEMENT" &&
      input.scene.activeNavalBattle?.status !== "ACTIVE" &&
      (state.classId === "BATTLESHIP" || state.classId === "CRUISER") &&
      state.hp > 0 &&
      state.shoreBombardmentUsedOnTurn !== input.scene.turn.turnNumber &&
      (input.role === "GM" || leaderSideIds.has(state.sideId))
        ? input.armies
            .filter(({ item: targetItem, state: targetState }) =>
              targetState.health.hp > 0 &&
              targetState.embarkedOnShipId == null &&
              mapVisibleSourceIds.has(targetItem.id)
            )
            .map(({ item: targetItem, state: targetState }) => ({
              id: targetItem.id,
              name: targetItem.name ?? "Безымянная армия",
              sideId: targetState.sideId,
              sideName: sideNames.get(targetState.sideId) ?? "Неизвестная сторона"
            }))
        : [];
'''
if needle not in text:
    raise SystemExit("hospital support anchor not found")
text = text.replace(needle, replacement, 1)

needle2 = '''      effectiveDetectionRange: state.detectionOverride ?? input.scene.settings.defaultDetectionRangeCells,
      hospitalSupportTargets,
      ...tactical
'''
replacement2 = '''      effectiveDetectionRange: state.detectionOverride ?? input.scene.settings.defaultDetectionRangeCells,
      hospitalSupportTargets,
      shoreBombardmentTargets,
      ...tactical
'''
if needle2 not in text:
    raise SystemExit("ship view anchor not found")
text = text.replace(needle2, replacement2, 1)

path.write_text(text, encoding="utf-8")
