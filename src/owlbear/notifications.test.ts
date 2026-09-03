import { describe, expect, it } from "vitest";
import { notificationMessage } from "./notifications";

describe("notificationMessage", () => {
  it.each([
    ["GM_ONLY", "Это действие доступно только ведущему."],
    ["NOT_SIDE_LEADER", "Это действие доступно только лидеру стороны."],
    ["PLAYER_IS_LEADER", "Сначала снимите игрока с роли лидера стороны."],
    ["PLAYER_NOT_CONNECTED", "Игрок не подключён к сцене."],
    ["REVISION_CONFLICT", "Состояние изменилось. Повторите действие."],
    ["COMMAND_TIMEOUT", "Фоновая часть расширения не отвечает. Перезапустите расширение."],
    ["NO_COORDINATOR", "Координатор ещё не готов. Повторите попытку через несколько секунд."],
    ["BACKGROUND_NOT_READY", "Фоновая часть расширения ещё загружается. Повторите попытку."],
    ["PROTOCOL_MISMATCH", "Версии интерфейса и фоновой части не совпадают. Перезапустите расширение."],
    ["INVALID_COMMAND", "Команда не распознана. Обновите расширение и повторите действие."],
    ["SELECTION_EMPTY", "Выберите изображение армии на сцене."],
    ["SELECTION_MULTIPLE", "Выберите только одно изображение."],
    ["ITEM_NOT_FOUND", "Выбранный объект не найден на сцене."],
    ["IMAGE_REQUIRED", "Для армии необходимо выбрать изображение."],
    ["ALREADY_REGISTERED", "Выбранное изображение уже зарегистрировано как армия."],
    ["SIDE_NOT_FOUND", "Выбранная сторона не найдена."],
    ["ARMY_NOT_READY", "Сначала остановите армию, чтобы изменить её маршрут."],
    ["NOT_FACTION_MEMBER", "Эта армия принадлежит другой фракции."],
    ["ARMY_TRANSFER_FORBIDDEN", "Сухопутную армию нельзя передать другой фракции."],
    ["ARMY_ENCIRCLED", "Окружённую армию нельзя лечить."],
    ["DISBAND_ALREADY_REQUESTED", "Роспуск этой армии уже объявлен и не может быть отменён."],
    ["MOVEMENT_CONSUMED_FOR_TURN", "После начала боя армия потеряла всё движение этого хода."],
    ["ROUTE_NOT_ACTIVE_TURN", "Этот маршрут назначен на другой глобальный ход."],
    ["ROUTE_REQUIRES_REPLAN", "Старый маршрут нужно спланировать заново."],
    ["TURN_POSITION_UNAVAILABLE", "Не удалось определить стратегическую клетку армии для смены хода."],
    ["SHIP_DESTROYED", "Уничтоженный корабль не может выполнять это действие."]
  ])("translates %s into Russian", (code, message) => {
    expect(notificationMessage(code)).toBe(message);
  });

  it("uses a Russian fallback for an unknown rejection reason", () => {
    expect(notificationMessage("UNEXPECTED_REASON")).toBe("Не удалось выполнить действие.");
  });
});
