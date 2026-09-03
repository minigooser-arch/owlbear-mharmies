from pathlib import Path

path = Path("src/owlbear/extensionServices.ts")
text = path.read_text(encoding="utf-8")
old = '''  const ships: ShipView[] = authorizedShipRecords.map(({ item, state }) => {
    const definition = SHIP_CLASSES[state.classId];
    return {
'''
new = '''  const ships: ShipView[] = authorizedShipRecords.map(({ item, state }) => {
    const definition = SHIP_CLASSES[state.classId];
    const battle = input.scene.activeNavalBattle;
    const tactical = battle?.status === "ACTIVE" &&
      state.status === "IN_NAVAL_BATTLE" &&
      state.battleId === battle.id &&
      battle.participantShipIds.includes(item.id)
      ? {
          navalRoundNumber: battle.roundNumber,
          isCurrentNavalTurn: battle.currentShipId === item.id,
          navalMovementRemaining: battle.movementRemainingByShip[item.id] ?? 0,
          navalActionUsed: battle.actionUsedByShip[item.id] ?? false
        }
      : {};
    return {
'''
if text.count(old) != 1:
    raise SystemExit(f"expected one ship snapshot mapping anchor, found {text.count(old)}")
text = text.replace(old, new, 1)
old_tail = '''      normalRangeMax: definition.normalRangeMax,
      embarkedArmyId: state.embarkedArmyId
    };
'''
new_tail = '''      normalRangeMax: definition.normalRangeMax,
      embarkedArmyId: state.embarkedArmyId,
      ...tactical
    };
'''
if text.count(old_tail) != 1:
    raise SystemExit(f"expected one ship snapshot tail anchor, found {text.count(old_tail)}")
path.write_text(text.replace(old_tail, new_tail, 1), encoding="utf-8")
