import fs from "node:fs";

const path = "src/commands/commandProcessor.ts";
let source = fs.readFileSync(path, "utf8");

function replaceOnce(before, after) {
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Patch anchor not found:\n${before}`);
  if (source.indexOf(before, index + before.length) >= 0) {
    throw new Error(`Patch anchor is not unique:\n${before}`);
  }
  source = source.slice(0, index) + after + source.slice(index + before.length);
}

replaceOnce(
  'import { activateCruiserInterception } from "../naval/interception/cruiserInterception";',
  'import {\n  activateCruiserInterception,\n  resolveCruiserInterceptionsForStep\n} from "../naval/interception/cruiserInterception";'
);

replaceOnce(
`          const result = applyForwardTacticalStep(
            battle, command.shipId, ship, from, forwardCell(from, ship.facing)
          );
          state.scene.activeNavalBattle = result.battle;
          state.positions ??= {};
          state.positions[command.shipId] = this.positionForCell(result.destination);
          return undefined;`,
`          const result = applyForwardTacticalStep(
            battle, command.shipId, ship, from, forwardCell(from, ship.facing)
          );
          state.positions ??= {};
          state.positions[command.shipId] = this.positionForCell(result.destination);

          const shipCells = Object.fromEntries(
            Object.keys(state.scene.ships ?? {}).flatMap((shipId) => {
              const position = commandPosition(state, shipId);
              if (!position) return [];
              return [[shipId, this.cellForPosition?.(position)]].filter(
                (entry): entry is [string, GridCellCoord] => entry[1] !== undefined
              );
            })
          );
          const occupiedShipCells = Object.entries(state.scene.ships ?? {})
            .filter(([shipId, candidate]) => shipId !== command.shipId && candidate.hp > 0)
            .flatMap(([shipId]) => {
              const position = commandPosition(state, shipId);
              return position
                ? [this.cellForPosition?.(position)].filter(
                    (cell): cell is GridCellCoord => cell !== undefined
                  )
                : [];
            });
          const interception = resolveCruiserInterceptionsForStep({
            battle: result.battle,
            ships: state.scene.ships ?? {},
            movingShipId: command.shipId,
            sourceCell: from,
            destinationCell: result.destination,
            shipCells,
            hasLineOfSight: (losFrom, losTo) => hasNavalBattleLineOfSight({
              scene: state.scene,
              from: losFrom,
              to: losTo,
              occupiedShipCells
            }),
            rollD6: this.rollD6
          });
          state.scene.ships = interception.ships;
          if (interception.triggered.length > 0) {
            const sequenceStart = interception.battle.events.length;
            interception.battle.events = [
              ...interception.battle.events,
              ...interception.triggered.map((trigger, index) => ({
                type: "INTERCEPTION_TRIGGERED",
                sequence: sequenceStart + index + 1,
                roundNumber: battle.roundNumber,
                cruiserShipId: trigger.cruiserShipId,
                targetShipId: command.shipId,
                rolledDamage: trigger.rolledDamage,
                armor: trigger.armor,
                damage: trigger.damage
              }))
            ];
          }
          state.scene.activeNavalBattle = interception.battle;

          const movedShip = state.scene.ships?.[command.shipId];
          if (movedShip && movedShip.hp <= 0 && interception.triggered.length > 0) {
            destroyReciprocalTransportCargo(state, command.shipId, movedShip);
            const sceneRevision = state.scene.revision;
            const destroyed = destroyShip(state.scene as NavalSceneState, command.shipId);
            state.scene = destroyed.scene;
            state.scene.revision = sceneRevision;
          }
          return undefined;`
);

fs.writeFileSync(path, source);
