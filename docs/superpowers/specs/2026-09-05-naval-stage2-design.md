# Naval Stage 2 Design

## Scope

Stage 2 extends the completed Stage 1 naval runtime with three independent subsystems:

1. troop transports and landing;
2. shore bombardment;
3. hospital-ship temporary HP support.

Stage 1 combat, detection, initiative, movement and battle lifecycle rules stay unchanged unless a Stage 2 rule below explicitly interacts with them.

## Transport and landing

- Only a `TRANSPORT` ship may carry an army.
- A transport carries at most one army; an army may be embarked on at most one ship.
- Embark/disembark is available only during the global `MOVEMENT` phase, never as a naval tactical action.
- Valid embark/disembark geometry is either:
  - orthogonally adjacent ship/army cells; or
  - the same strategic cell when that cell supports both `LAND` and `SEA` (the existing data-model representation of a canal/mixed-domain cell).
- Embark/disembark consumes the transport's remaining global movement for the current turn (`globalMovementRemaining = 0`, `movementSpentThisTurn = true`).
- While embarked, reciprocal linkage is authoritative: `army.embarkedOnShipId === shipId` and `ship.embarkedArmyId === armyId`.
- The army token is hidden while embarked; the ship remains controlled by the ship owners. Army ownership does not grant control of the transport.
- Foreign-faction transport is allowed only through explicit consent of both sides. The command flow must represent this consent rather than silently transferring control.
- An embarked army cannot move independently and cannot transfer directly ship-to-ship.
- A reciprocally embarked army is excluded from normal land supply / encirclement processing; the existing Stage 1-compatible supply exemption remains authoritative.
- Destroying the transport destroys its embarked army completely, regardless of the army's remaining HP.
- Disembarking onto a cell occupied by a friendly army is forbidden.
- Disembarking onto a cell occupied by an enemy army immediately creates/joins the normal land BattleGroup through the existing land collision/battle rules.

## Shore bombardment

- Shore bombardment is available to `BATTLESHIP` and `CRUISER` only.
- Damage is direct against a land army: battleship `3d6`, cruiser `2d6`; ship armor is irrelevant to army damage.
- Target must be a visible, otherwise valid coastal army on LAND or mixed LAND+SEA terrain, within the ship's normal tactical sector/range and with naval LOS.
- A ship may perform at most one shore bombardment per global turn. The attempt is consumed even if damage resolves to zero.
- Bombardment is resolved after movement / in the approved end-of-global-turn naval action window, not as an extra automatic attack.
- If used while the ship is participating in active naval combat, the shot consumes the ship's action and completes that ship's turn.
- The firing ship is revealed to the target side through the next global turn using the existing naval reveal mechanism.
- If army HP reaches zero, the army is destroyed through the existing army lifecycle.

## Hospital ship

- `HOSPITAL` uses a logistics action in naval battle to grant `2d6` temporary HP to one other ship.
- Target must be orthogonally adjacent; self-targeting is forbidden.
- It does not heal real HP. It increases `temporaryHp` only.
- Temporary HP absorbs damage before real HP.
- `hp + temporaryHp` may never exceed the ship class maximum HP.
- Multiple hospital actions / multiple hospital ships may add temporary HP while the cap is respected.
- Temporary HP disappears when the supported ship exits the naval battle or when the battle ends; lost temporary HP never converts to real damage after battle.
- The hospital action consumes the acting hospital ship's normal naval action for the turn.
