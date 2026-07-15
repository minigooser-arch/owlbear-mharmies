import { describe, expect, it } from "vitest";
import { notificationMessage } from "./notifications";

describe("notificationMessage", () => {
  it.each([
    ["GM_ONLY", "Это действие доступно только ведущему."],
    ["NOT_SIDE_LEADER", "Это действие доступно только лидеру стороны."],
    ["PLAYER_IS_LEADER", "Сначала снимите игрока с роли лидера стороны."],
    ["PLAYER_NOT_CONNECTED", "Игрок не подключён к сцене."],
    ["REVISION_CONFLICT", "Состояние изменилось. Повторите действие."],
    ["COMMAND_TIMEOUT", "Время ожидания ответа истекло. Повторите действие."],
    ["INVALID_COMMAND", "Команда не распознана. Обновите расширение и повторите действие."],
    ["SELECTION_EMPTY", "Выберите изображение армии на сцене."],
    ["SELECTION_MULTIPLE", "Выберите только одно изображение."],
    ["ITEM_NOT_FOUND", "Выбранный объект не найден на сцене."],
    ["IMAGE_REQUIRED", "Для армии необходимо выбрать изображение."],
    ["ALREADY_REGISTERED", "Выбранное изображение уже зарегистрировано как армия."],
    ["SIDE_NOT_FOUND", "Выбранная сторона не найдена."],
    ["ARMY_NOT_READY", "Сначала остановите армию, чтобы изменить её маршрут."]
  ])("translates %s into Russian", (code, message) => {
    expect(notificationMessage(code)).toBe(message);
  });

  it("uses a Russian fallback for an unknown rejection reason", () => {
    expect(notificationMessage("UNEXPECTED_REASON")).toBe("Не удалось выполнить действие.");
  });
});
