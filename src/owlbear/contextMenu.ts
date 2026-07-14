import type { ArmyCommand } from "../shared/types";

export type ArmyContextActionType =
  | "START_ARMY"
  | "PAUSE_ARMY"
  | "RESUME_ARMY"
  | "STOP_ARMY"
  | "CLEAR_ROUTE"
  | "UNREGISTER_ARMY";

export interface CommandEnvelopeData {
  requestId: string;
  senderPlayerId: string;
  senderConnectionId: string;
  expectedRevision: number;
}

export interface ContextMenuAction {
  id: string;
  title: string;
  type: ArmyContextActionType;
}

export interface ContextMenuPort {
  register(
    actions: readonly ContextMenuAction[],
    callback: (itemId: string) => Promise<void>
  ): () => void;
  resolveSourceItemId(itemId: string): Promise<string | undefined>;
  commandEnvelope(): CommandEnvelopeData;
  send(command: ArmyCommand): Promise<unknown>;
}

const TITLES: Record<ArmyContextActionType, string> = {
  START_ARMY: "Начать движение",
  PAUSE_ARMY: "Приостановить",
  RESUME_ARMY: "Продолжить",
  STOP_ARMY: "Остановить",
  CLEAR_ROUTE: "Очистить маршрут",
  UNREGISTER_ARMY: "Снять регистрацию армии"
};

export function setupContextMenu(
  port: ContextMenuPort,
  actionType?: ArmyContextActionType
): () => void {
  const actionTypes = actionType ? [actionType] : (Object.keys(TITLES) as ArmyContextActionType[]);
  const actions = actionTypes.map((type) => ({
    id: `com.letopis.army-control/${type.toLowerCase()}`,
    title: TITLES[type],
    type
  }));
  return port.register(actions, async (itemId) => {
    const sourceItemId = await port.resolveSourceItemId(itemId);
    if (!sourceItemId) return;
    const type = actionType ?? "PAUSE_ARMY";
    const command = {
      ...port.commandEnvelope(),
      type,
      armyId: sourceItemId
    } as ArmyCommand;
    await port.send(command);
  });
}
