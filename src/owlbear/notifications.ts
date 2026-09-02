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
  | "NOT_ORTHOGONAL"
  | "OUTSIDE_MAP"
  | "IMPASSABLE"
  | "OUTSIDE_FACTION_TERRITORY"
  | "INVALID_TERRAIN"
  | "INSUFFICIENT_MOVEMENT_POINTS"
  | "ARMY_STATE_BLOCKS_MOVEMENT"
  | "BARRIER"
  | "COORDINATOR_GAP"
  | "AUTO_TURNS_PAUSED"
  | "INVALID_TURN_TIME"
  | "NOT_FACTION_MEMBER"
  | "ARMY_TRANSFER_FORBIDDEN"
  | "ARMY_ENCIRCLED"
  | "DISBAND_ALREADY_REQUESTED"
  | "MOVEMENT_CONSUMED_FOR_TURN"
  | "ROUTE_NOT_ACTIVE_TURN"
  | "ROUTE_REQUIRES_REPLAN"
  | "TURN_POSITION_UNAVAILABLE"
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
  NOT_ORTHOGONAL: "Можно двигаться только по горизонтали или вертикали.",
  OUTSIDE_MAP: "Эта клетка находится за пределами игровой карты.",
  IMPASSABLE: "Эта клетка непроходима.",
  OUTSIDE_FACTION_TERRITORY: "В мирное время армия не может покидать территорию своей фракции.",
  INVALID_TERRAIN: "Для этой клетки задан недоступный тип местности.",
  INSUFFICIENT_MOVEMENT_POINTS: "Для этого маршрута не хватает очков перемещения.",
  ARMY_STATE_BLOCKS_MOVEMENT: "Текущее состояние армии не позволяет продолжить движение.",
  BARRIER: "Движение остановлено барьером.",
  COORDINATOR_GAP: "Движение приостановлено после потери координатора.",
  AUTO_TURNS_PAUSED: "Сначала возобновите автоматические ходы.",
  INVALID_TURN_TIME: "Выберите будущие дату и время для переноса хода.",
  NOT_FACTION_MEMBER: "Эта армия принадлежит другой фракции.",
  ARMY_TRANSFER_FORBIDDEN: "Сухопутную армию нельзя передать другой фракции.",
  ARMY_ENCIRCLED: "Окружённую армию нельзя лечить.",
  DISBAND_ALREADY_REQUESTED: "Роспуск этой армии уже объявлен и не может быть отменён.",
  MOVEMENT_CONSUMED_FOR_TURN: "После начала боя армия потеряла всё движение этого хода.",
  ROUTE_NOT_ACTIVE_TURN: "Этот маршрут назначен на другой глобальный ход.",
  ROUTE_REQUIRES_REPLAN: "Старый маршрут нужно спланировать заново.",
  TURN_POSITION_UNAVAILABLE: "Не удалось определить стратегическую клетку армии для смены хода.",
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
