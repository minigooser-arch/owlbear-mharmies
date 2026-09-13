import type { MovementDenialReason } from "../../shared/types";

export function formatMovementUnits(units: number): string {
  const op = units / 2;
  return Number.isInteger(op) ? String(op) : op.toFixed(1).replace(".", ",");
}

export function movementDenialMessage(reason: MovementDenialReason | undefined): string | undefined {
  switch (reason) {
    case "NOT_SHORTEST_EXIT": return "Выберите кратчайший путь выхода на разрешённую территорию.";
    case "NO_EXIT_ROUTE": return "Доступного пути выхода нет.";
    case "FOREIGN_STATE_CLOSED": return "Граница государства закрыта для этой фракции.";
    case "STATELESS_FACTION": return "Фракция без государства не может входить на эту территорию.";
    case "INVALID_POLITICAL_CONFIG": return "Проверьте государство и его правящую фракцию.";
    case "NOT_ORTHOGONAL": return "Можно двигаться только по горизонтали или вертикали.";
    case "OUTSIDE_MAP": return "Клетка находится за пределами игровой карты.";
    case "IMPASSABLE": return "Маршрут упирается в непроходимую клетку.";
    case "OUTSIDE_FACTION_TERRITORY": return "В мирное время армия не может покидать территорию своей фракции.";
    case "INVALID_TERRAIN": return "В маршруте есть клетка с недоступным типом местности.";
    case "INSUFFICIENT_MOVEMENT_POINTS": return "Для продолжения маршрута не хватает ОП.";
    case "ARMY_STATE_BLOCKS_MOVEMENT": return "Текущее состояние армии не позволяет продолжить движение.";
    case "BARRIER": return "Маршрут перекрыт барьером.";
    default: return undefined;
  }
}
