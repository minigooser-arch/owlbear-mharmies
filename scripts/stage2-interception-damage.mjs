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
`import {
  activateCruiserInterception,
  resolveCruiserInterceptionsForStep
} from "../naval/interception/cruiserInterception";`,
`import {
  activateCruiserInterception,
  removeCruiserInterceptionAfterDamage,
  resolveCruiserInterceptionsForStep
} from "../naval/interception/cruiserInterception";`
);

replaceOnce(
`        if (!result.ok) return result.reason;
        state.scene.ships ??= {};
        state.scene.ships[command.targetShipId] = result.target;
        result.battle.events = [
          ...result.battle.events,
          {
            type: "BROADSIDE_ATTACK",
            sequence: result.battle.events.length + 1,
            roundNumber: battle.roundNumber,
            attackerShipId: command.shipId,
            targetShipId: command.targetShipId,
            rolledDamage: result.rolledDamage,
            armor: result.armor,
            damage: result.damage,
            special: result.special
          }
        ];
        state.scene.activeNavalBattle = result.battle;`,
`        if (!result.ok) return result.reason;
        state.scene.ships ??= {};
        state.scene.ships[command.targetShipId] = result.target;

        const actualHpLoss = Math.max(
          0,
          target.hp + target.temporaryHp - result.target.hp - result.target.temporaryHp
        );
        const hadActiveInterception = battle.interceptions?.[command.targetShipId] !== undefined;
        const battleAfterDamage = hadActiveInterception && actualHpLoss > 0
          ? removeCruiserInterceptionAfterDamage(result.battle, command.targetShipId, actualHpLoss)
          : result.battle;
        const broadsideEvent = {
          type: "BROADSIDE_ATTACK",
          sequence: battleAfterDamage.events.length + 1,
          roundNumber: battle.roundNumber,
          attackerShipId: command.shipId,
          targetShipId: command.targetShipId,
          rolledDamage: result.rolledDamage,
          armor: result.armor,
          damage: result.damage,
          special: result.special
        };
        const interceptionRemovalEvent = hadActiveInterception && actualHpLoss > 0
          ? {
              type: "INTERCEPTION_REMOVED_BY_DAMAGE",
              sequence: broadsideEvent.sequence + 1,
              roundNumber: battle.roundNumber,
              cruiserShipId: command.targetShipId,
              actualHpLoss
            }
          : null;
        battleAfterDamage.events = [
          ...battleAfterDamage.events,
          broadsideEvent,
          ...(interceptionRemovalEvent ? [interceptionRemovalEvent] : [])
        ];
        state.scene.activeNavalBattle = battleAfterDamage;`
);

fs.writeFileSync(path, source);
