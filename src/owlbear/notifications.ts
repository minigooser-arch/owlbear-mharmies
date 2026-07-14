export type NotificationCode =
  | "GM_ONLY"
  | "NOT_DIRECT_OWNER"
  | "NOT_SIDE_LEADER"
  | "PLAYER_IS_LEADER"
  | "PLAYER_NOT_CONNECTED"
  | "REVISION_CONFLICT"
  | "COMMAND_TIMEOUT"
  | "INVALID_COMMAND"
  | "SELECTION_EMPTY"
  | "SELECTION_MULTIPLE"
  | "ITEM_NOT_FOUND"
  | "IMAGE_REQUIRED"
  | "ALREADY_REGISTERED"
  | "SIDE_NOT_FOUND"
  | "ROUTE_LIMIT"
  | "BARRIER"
  | "COORDINATOR_GAP"
  | "INVALID_METADATA";

const RUSSIAN_MESSAGES: Readonly<Record<NotificationCode, string>> = {
  GM_ONLY: "Это действие доступно только ведущему.",
  NOT_DIRECT_OWNER: "Эта армия принадлежит другому игроку.",
  NOT_SIDE_LEADER: "Это действие доступно только лидеру стороны.",
  PLAYER_IS_LEADER: "Сначала снимите игрока с роли лидера стороны.",
  PLAYER_NOT_CONNECTED: "Игрок не подключён к сцене.",
  REVISION_CONFLICT: "Состояние изменилось. Повторите действие.",
  COMMAND_TIMEOUT: "Время ожидания ответа истекло. Повторите действие.",
  INVALID_COMMAND: "Команда не распознана. Обновите расширение и повторите действие.",
  SELECTION_EMPTY: "Выберите изображение армии на сцене.",
  SELECTION_MULTIPLE: "Выберите только одно изображение.",
  ITEM_NOT_FOUND: "Выбранный объект не найден на сцене.",
  IMAGE_REQUIRED: "Для армии необходимо выбрать изображение.",
  ALREADY_REGISTERED: "Выбранное изображение уже зарегистрировано как армия.",
  SIDE_NOT_FOUND: "Выбранная сторона не найдена.",
  ROUTE_LIMIT: "Маршрут превышает допустимую длину.",
  BARRIER: "Движение остановлено барьером.",
  COORDINATOR_GAP: "Движение приостановлено после потери координатора.",
  INVALID_METADATA: "Данные расширения повреждены или имеют неизвестную версию."
};

const UNKNOWN_FAILURE_MESSAGE = "Не удалось выполнить действие.";

export interface NotificationPort {
  show(message: string, variant: "INFO" | "WARNING" | "ERROR"): Promise<void>;
}

export function notificationMessage(code: string): string {
  return RUSSIAN_MESSAGES[code as NotificationCode] ?? UNKNOWN_FAILURE_MESSAGE;
}

export async function notifyRussian(
  port: NotificationPort,
  code: string,
  variant: "INFO" | "WARNING" | "ERROR" = "WARNING"
): Promise<void> {
  await port.show(notificationMessage(code), variant);
}
