export type NotificationCode =
  | "GM_ONLY"
  | "NOT_DIRECT_OWNER"
  | "REVISION_CONFLICT"
  | "ROUTE_LIMIT"
  | "BARRIER"
  | "COORDINATOR_GAP"
  | "INVALID_METADATA";

const RUSSIAN_MESSAGES: Record<NotificationCode, string> = {
  GM_ONLY: "Это действие доступно только ведущему.",
  NOT_DIRECT_OWNER: "Эта армия принадлежит другому игроку.",
  REVISION_CONFLICT: "Состояние изменилось. Повторите действие.",
  ROUTE_LIMIT: "Маршрут превышает допустимую длину.",
  BARRIER: "Движение остановлено барьером.",
  COORDINATOR_GAP: "Движение приостановлено после потери координатора.",
  INVALID_METADATA: "Данные расширения повреждены или имеют неизвестную версию."
};

export interface NotificationPort {
  show(message: string, variant: "INFO" | "WARNING" | "ERROR"): Promise<void>;
}

export function notificationMessage(code: NotificationCode): string {
  return RUSSIAN_MESSAGES[code];
}

export async function notifyRussian(
  port: NotificationPort,
  code: NotificationCode,
  variant: "INFO" | "WARNING" | "ERROR" = "WARNING"
): Promise<void> {
  await port.show(notificationMessage(code), variant);
}
