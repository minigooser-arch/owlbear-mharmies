export type NotificationCode =
  | "GM_ONLY"
  | "NOT_DIRECT_OWNER"
  | "NOT_SIDE_LEADER"
  | "PLAYER_IS_LEADER"
  | "PLAYER_NOT_CONNECTED"
  | "REVISION_CONFLICT"
  | "COMMAND_TIMEOUT"
  | "NO_COORDINATOR"
  | "BACKGROUND_NOT_READY"
  | "PROTOCOL_MISMATCH"
  | "INVALID_COMMAND"
  | "INVALID_BATTLE_NAME"
  | "BATTLE_NOT_FOUND"
  | "SELECTION_EMPTY"
  | "SELECTION_MULTIPLE"
  | "ITEM_NOT_FOUND"
  | "IMAGE_REQUIRED"
  | "ALREADY_REGISTERED"
  | "SIDE_NOT_FOUND"
  | "ARMY_NOT_READY"
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
  COMMAND_TIMEOUT: "Фоновая часть расширения не отвечает. Перезапустите расширение.",
  NO_COORDINATOR: "Координатор ещё не готов. Повторите попытку через несколько секунд.",
  BACKGROUND_NOT_READY: "Фоновая часть расширения ещё загружается. Повторите попытку.",
  PROTOCOL_MISMATCH: "Версии интерфейса и фоновой части не совпадают. Перезапустите расширение.",
  INVALID_COMMAND: "Команда не распознана. Обновите расширение и повторите действие.",
  INVALID_BATTLE_NAME: "Название боя должно содержать от 1 до 80 символов.",
  BATTLE_NOT_FOUND: "Указанный бой не найден.",
  SELECTION_EMPTY: "Выберите изображение армии на сцене.",
  SELECTION_MULTIPLE: "Выберите только одно изображение.",
  ITEM_NOT_FOUND: "Выбранный объект не найден на сцене.",
  IMAGE_REQUIRED: "Для армии необходимо выбрать изображение.",
  ALREADY_REGISTERED: "Выбранное изображение уже зарегистрировано как армия.",
  SIDE_NOT_FOUND: "Выбранная сторона не найдена.",
  ARMY_NOT_READY: "Сначала остановите армию, чтобы изменить её маршрут.",
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
