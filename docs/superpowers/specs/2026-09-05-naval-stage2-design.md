# Naval Stage 2 Design

## Scope

Stage 2 extends the completed Stage 1 naval runtime with four subsystems:

1. troop transports and landing;
2. shore bombardment;
3. hospital-ship temporary HP support;
4. cruiser interception.

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
- Shore bombardment is a final global action: it is allowed only in `POST_MOVEMENT` and is rejected while any naval battle is active.
- Target must be a visible, living army on `LAND` or mixed `LAND+SEA` terrain, within the ship's exact normal broadside sector/range and with naval LOS.
- Own-side and allied targets require explicit friendly-fire confirmation. Enemy and neutral targets do not.
- A ship may perform at most one shore bombardment per global turn. The attempt is consumed even if damage resolves to zero.
- The firing ship is revealed to the target side through the next global turn using the existing naval reveal mechanism.
- If army HP reaches zero, the army is destroyed through the existing army lifecycle.
- The player snapshot exposes only minimal role-safe target data (`id`, `name`, `sideId`, `sideName`) to the GM or a leader allowed to control the firing ship. Hidden enemy armies are never exposed through the target list.
- The UI deliberately does not duplicate terrain, range, sector or LOS validation. It offers only role-safe visible living targets; the authoritative `NAVAL_SHORE_BOMBARDMENT` command performs the final geometric validation.

## Hospital ship

- `HOSPITAL` uses a logistics action in naval battle to grant `2d6` temporary HP to one other ship.
- Target must be orthogonally adjacent; self-targeting is forbidden.
- It does not heal real HP. It increases `temporaryHp` only.
- Temporary HP absorbs damage before real HP.
- `hp + temporaryHp` may never exceed the ship class maximum HP.
- Multiple hospital actions / multiple hospital ships may add temporary HP while the cap is respected.
- Temporary HP disappears when the supported ship exits the naval battle or when the battle ends; lost temporary HP never converts to real damage after battle.
- The hospital action consumes the acting hospital ship's normal naval action for the turn.

## Cruiser interception

- Only a living `CRUISER` that is currently active in an active naval battle may activate interception.
- Interception consumes the cruiser's normal action, sets its remaining tactical movement to zero and immediately advances naval initiative to the next ship.
- One active interception zone is stored for the cruiser. The zone is dynamic rather than frozen at activation time: it uses the cruiser's current position, current facing, exact normal broadside mask and current naval LOS.
- The local zone overlay is private. It is visible to the GM and leaders of the cruiser's side, but not to ordinary members or opposing players.
- A ship of another side triggers interception only when it actually moves from outside the current zone into a zone cell. Same-side ships do not trigger it, and movement that starts already inside the zone does not trigger it.
- Every matching interception zone resolves simultaneously. Each cruiser makes a `2d6` attack against the entering ship and the target's armor reduces that damage normally.
- The entering ship remains in the entered cell. After interception resolves, its remaining movement becomes zero, its action is treated as used and its current activation ends even if armor reduces the interception damage to zero.
- A triggered zone is consumed. An unused zone is also removed if the cruiser suffers positive actual HP loss, when the cruiser becomes active again on its next round, or when the naval battle ends.
- Interception can be activated from the ship card or from Owlbear's persistent right-click context action `Перехват`; both paths send the same authoritative `NAVAL_ACTIVATE_INTERCEPTION` command.
