// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StateEntity, StrategicCity } from "../../shared/types";
import { StrategicCityEditor } from "./StrategicCityEditor";

afterEach(cleanup);

const states: StateEntity[] = [
  { id: "russia", name: "Россия", color: "#b71c1c", rulingFactionId: "red", active: true },
  { id: "germany", name: "Германия", color: "#263238", rulingFactionId: "black", active: true },
  { id: "france", name: "Франция", color: "#3344aa", rulingFactionId: "green", active: true }
];

const city: StrategicCity = {
  id: "moscow",
  name: "Москва",
  cells: [{ x: 1, y: 2 }],
  recognizedStateId: "russia",
  deFactoStateId: "russia",
  factionInfluenceId: null,
  mayorId: null,
  isCapital: true,
  historicalBuildTypeCount: 4
};

describe("StrategicCityEditor", () => {
  it("shows concise city summaries and expandable city details", () => {
    render(<StrategicCityEditor role="GM" states={states} cities={[city]} onCreate={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    const cityCard = screen.getByText("Показать детали города Москва").closest("details");
    if (!cityCard) throw new Error("Moscow city card was not rendered");
    expect(within(cityCard).getByText("Клеток: 1")).toBeTruthy();
    fireEvent.click(screen.getByText("Показать детали города Москва"));
    expect(within(cityCard).getByRole("heading", { name: "Москва" })).toBeTruthy();
    expect(screen.getByText(/Исторических типов построек: 4/)).toBeTruthy();
    expect(within(cityCard).getByText("Столица")).toBeTruthy();
  });

  it("generates a transliterated unique ID when a GM creates a city", () => {
    const onCreate = vi.fn();
    render(<StrategicCityEditor role="GM" states={states} cities={[]} onCreate={onCreate} onUpdate={vi.fn()} onDelete={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Название города"), { target: { value: "Москва" } });
    fireEvent.click(screen.getByText("Дополнительные настройки"));
    fireEvent.change(screen.getByLabelText("Клетки города"), { target: { value: "1,2; 2,2" } });
    fireEvent.change(screen.getByLabelText("Исторические типы построек"), { target: { value: "5" } });
    fireEvent.click(screen.getByLabelText("Столица"));
    fireEvent.click(screen.getByRole("button", { name: "Создать город" }));

    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      id: "moskva",
      name: "Москва",
      cells: [{ x: 1, y: 2 }, { x: 2, y: 2 }],
      recognizedStateId: "russia",
      deFactoStateId: "russia",
      isCapital: true,
      historicalBuildTypeCount: 5
    }));
  });

  it("adds a numeric suffix when generated city IDs collide", () => {
    const onCreate = vi.fn();
    render(<StrategicCityEditor role="GM" states={states} cities={[{ ...city, id: "moskva" }]} onCreate={onCreate} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Название города"), { target: { value: "Москва" } });
    fireEvent.click(screen.getByText("Дополнительные настройки"));
    fireEvent.change(screen.getByLabelText("Клетки города"), { target: { value: "3,4" } });
    fireEvent.click(screen.getByRole("button", { name: "Создать город" }));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ id: "moskva-2" }));
  });

  it("allows a manual city ID override in advanced settings", () => {
    const onCreate = vi.fn();
    render(<StrategicCityEditor role="GM" states={states} cities={[]} onCreate={onCreate} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Название города"), { target: { value: "Москва" } });
    fireEvent.click(screen.getByText("Дополнительные настройки"));
    fireEvent.change(screen.getByLabelText("ID города"), { target: { value: "moscow-custom" } });
    fireEvent.change(screen.getByLabelText("Клетки города"), { target: { value: "1,2" } });
    fireEvent.click(screen.getByRole("button", { name: "Создать город" }));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ id: "moscow-custom" }));
  });

  it("filters visible city cards by name and recognized state", () => {
    const berlin: StrategicCity = { ...city, id: "berlin", name: "Берлин", recognizedStateId: "germany", deFactoStateId: "germany", isCapital: false };
    render(<StrategicCityEditor role="GM" states={states} cities={[city, berlin]} onCreate={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Поиск городов" }), { target: { value: "моск" } });
    expect(screen.getByText("Показать детали города Москва")).toBeInTheDocument();
    expect(screen.queryByText("Показать детали города Берлин")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Поиск городов" }), { target: { value: "" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Фильтр городов по государству" }), { target: { value: "germany" } });
    expect(screen.getByText("Показать детали города Берлин")).toBeInTheDocument();
    expect(screen.queryByText("Показать детали города Москва")).not.toBeInTheDocument();
  });

  it("deduplicates picked cells, allows removing a chip, and merges the selection on finish", () => {
    const onOpenCellPicker = vi.fn();
    const onCloseCellPicker = vi.fn();
    render(<StrategicCityEditor
      role="GM" states={states} cities={[]} onCreate={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()}
      onOpenCellPicker={onOpenCellPicker} onCloseCellPicker={onCloseCellPicker}
      pickerSessionId="session-1" canPickCells
      pickedCells={[{ x: 2, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }]}
    />);
    fireEvent.change(screen.getByLabelText("Название города"), { target: { value: "Москва" } });
    fireEvent.click(screen.getByText("Дополнительные настройки"));
    fireEvent.change(screen.getByLabelText("Клетки города"), { target: { value: "9,9" } });

    expect(screen.getByRole("button", { name: "Удалить клетку 2,2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Удалить клетку 3,2" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Удалить клетку 2,2" }));
    fireEvent.click(screen.getByRole("button", { name: "Завершить выбор" }));

    expect(screen.getByLabelText("Клетки города")).toHaveValue("9,9; 3,2");
    expect(onCloseCellPicker).toHaveBeenCalledOnce();
  });

  it("finishes map selection when the manual coordinate draft is empty", () => {
    const onCloseCellPicker = vi.fn();
    render(<StrategicCityEditor
      role="GM" states={states} cities={[]} onCreate={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()}
      onCloseCellPicker={onCloseCellPicker}
      pickerSessionId="session-empty" canPickCells
      pickedCells={[{ x: 4, y: 5 }]}
    />);
    fireEvent.click(screen.getByText("Дополнительные настройки"));

    expect(screen.getByLabelText("Клетки города")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Завершить выбор" }));

    expect(screen.getByLabelText("Клетки города")).toHaveValue("4,5");
    expect(onCloseCellPicker).toHaveBeenCalledOnce();
  });

  it("keeps the original coordinate draft when map selection is cancelled", () => {
    const onOpenCellPicker = vi.fn();
    const onCloseCellPicker = vi.fn();
    const props = {
      role: "GM" as const, states, cities: [], onCreate: vi.fn(), onUpdate: vi.fn(), onDelete: vi.fn(),
      onOpenCellPicker, onCloseCellPicker, canPickCells: true,
      pickedCells: [{ x: 5, y: 6 }]
    };
    const view = render(<StrategicCityEditor {...props} />);
    fireEvent.click(screen.getByText("Дополнительные настройки"));
    fireEvent.change(screen.getByLabelText("Клетки города"), { target: { value: "9,9" } });
    fireEvent.click(screen.getByRole("button", { name: "Выбрать клетки на карте" }));
    view.rerender(<StrategicCityEditor {...props} pickerSessionId="session-2" />);
    fireEvent.change(screen.getByLabelText("Клетки города"), { target: { value: "11,12" } });
    fireEvent.click(screen.getByRole("button", { name: "Отменить" }));
    expect(screen.getByLabelText("Клетки города")).toHaveValue("9,9");
    expect(onOpenCellPicker).toHaveBeenCalledOnce();
    expect(onCloseCellPicker).toHaveBeenCalledOnce();
  });

  it("starts a map picker only when the parent says the scene is ready", () => {
    const onOpenCellPicker = vi.fn();
    const props = { role: "GM" as const, states, cities: [], onCreate: vi.fn(), onUpdate: vi.fn(), onDelete: vi.fn(), onOpenCellPicker };
    const view = render(<StrategicCityEditor {...props} canPickCells={false} />);
    expect(screen.getByRole("button", { name: "Выбрать клетки на карте" })).toBeDisabled();
    view.rerender(<StrategicCityEditor {...props} canPickCells />);
    fireEvent.click(screen.getByRole("button", { name: "Выбрать клетки на карте" }));
    expect(onOpenCellPicker).toHaveBeenCalledOnce();
  });

  it("lets a GM edit all strategic city fields used by the current system", () => {
    const onUpdate = vi.fn();
    render(<StrategicCityEditor role="GM" states={states} cities={[city]} onCreate={vi.fn()} onUpdate={onUpdate} onDelete={vi.fn()} />);

    fireEvent.click(screen.getByText("Показать детали города Москва"));
    fireEvent.click(screen.getByRole("button", { name: "Редактировать Москва" }));
    fireEvent.change(screen.getByLabelText("Редактировать название Москва"), { target: { value: "Новая Москва" } });
    fireEvent.change(screen.getByLabelText("Редактировать клетки Москва"), { target: { value: "3,4; 4,4" } });
    fireEvent.change(screen.getByLabelText("Редактировать государство Москва"), { target: { value: "germany" } });
    fireEvent.change(screen.getByLabelText("Редактировать исторические типы построек Москва"), { target: { value: "6" } });
    fireEvent.click(screen.getByLabelText("Редактировать столицу Москва"));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить Москва" }));

    expect(onUpdate).toHaveBeenCalledWith("moscow", expect.objectContaining({
      name: "Новая Москва",
      cells: [{ x: 3, y: 4 }, { x: 4, y: 4 }],
      recognizedStateId: "germany",
      isCapital: false,
      historicalBuildTypeCount: 6
    }));
    expect(onUpdate.mock.calls[0]?.[1]).not.toHaveProperty("deFactoStateId");
  });

  it("does not expose mutation controls to a non-GM", () => {
    render(<StrategicCityEditor role="PLAYER" states={states} cities={[city]} onCreate={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Создать город" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Редактировать Москва" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Удалить Москва" })).toBeNull();
  });
});


it("picks the first state when states arrive after the city editor mounts", () => {
  const onCreate = vi.fn();
  const view = render(
    <StrategicCityEditor role="GM" states={[]} cities={[]} onCreate={onCreate} onUpdate={vi.fn()} onDelete={vi.fn()} />
  );

  expect(screen.getByLabelText("Государство")).toHaveValue("");
  expect(screen.getByRole("button", { name: "Создать город" })).toBeDisabled();

  view.rerender(
    <StrategicCityEditor role="GM" states={states} cities={[]} onCreate={onCreate} onUpdate={vi.fn()} onDelete={vi.fn()} />
  );

  expect(screen.getByLabelText("Государство")).toHaveValue("russia");
  expect(screen.getByRole("button", { name: "Создать город" })).toBeEnabled();

    fireEvent.change(screen.getByLabelText("Название города"), { target: { value: "Тула" } });
    fireEvent.click(screen.getByText("Дополнительные настройки"));
    fireEvent.change(screen.getByLabelText("Клетки города"), { target: { value: "4,4" } });
  fireEvent.click(screen.getByRole("button", { name: "Создать город" }));

  expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
    id: "tula",
    recognizedStateId: "russia",
    deFactoStateId: "russia"
  }));
});

it("refreshes an edit form from the latest city data when editing is reopened", () => {
  const onUpdate = vi.fn();
  const view = render(
    <StrategicCityEditor role="GM" states={states} cities={[city]} onCreate={vi.fn()} onUpdate={onUpdate} onDelete={vi.fn()} />
  );

  fireEvent.click(screen.getByText("Показать детали города Москва"));
  fireEvent.click(screen.getByRole("button", { name: "Редактировать Москва" }));
  fireEvent.change(screen.getByLabelText("Редактировать название Москва"), { target: { value: "Черновик" } });
  fireEvent.click(screen.getByRole("button", { name: "Редактировать Москва" }));

  const updatedCity: StrategicCity = {
    ...city,
    name: "Москва обновлённая",
    historicalBuildTypeCount: 9
  };
  view.rerender(
    <StrategicCityEditor role="GM" states={states} cities={[updatedCity]} onCreate={vi.fn()} onUpdate={onUpdate} onDelete={vi.fn()} />
  );

  fireEvent.click(screen.getByRole("button", { name: "Редактировать Москва обновлённая" }));
  expect(screen.getByLabelText("Редактировать название Москва обновлённая")).toHaveValue("Москва обновлённая");
  expect(screen.getByLabelText("Редактировать исторические типы построек Москва обновлённая")).toHaveValue(9);
});
