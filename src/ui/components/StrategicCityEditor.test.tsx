// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StateEntity, StrategicCity } from "../../shared/types";
import { StrategicCityEditor } from "./StrategicCityEditor";

afterEach(cleanup);

const states: StateEntity[] = [
  { id: "russia", name: "Россия", color: "#b71c1c", rulingFactionId: "red", active: true },
  { id: "germany", name: "Германия", color: "#263238", rulingFactionId: "black", active: true }
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
  it("shows existing cities and manual historical build count", () => {
    render(<StrategicCityEditor role="GM" states={states} cities={[city]} onCreate={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    const cityCard = screen.getByRole("heading", { name: "Москва" }).closest("article");
    if (!cityCard) throw new Error("Moscow city card was not rendered");
    expect(screen.getByText(/Исторических типов построек: 4/)).toBeTruthy();
    expect(within(cityCard).getByText("Столица")).toBeTruthy();
  });

  it("lets a GM create a city from manually entered cells and build count", () => {
    const onCreate = vi.fn();
    render(<StrategicCityEditor role="GM" states={states} cities={[]} onCreate={onCreate} onUpdate={vi.fn()} onDelete={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("ID города"), { target: { value: "moscow" } });
    fireEvent.change(screen.getByLabelText("Название города"), { target: { value: "Москва" } });
    fireEvent.change(screen.getByLabelText("Клетки города"), { target: { value: "1,2; 2,2" } });
    fireEvent.change(screen.getByLabelText("Исторические типы построек"), { target: { value: "5" } });
    fireEvent.click(screen.getByLabelText("Столица"));
    fireEvent.click(screen.getByRole("button", { name: "Создать город" }));

    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      id: "moscow",
      name: "Москва",
      cells: [{ x: 1, y: 2 }, { x: 2, y: 2 }],
      recognizedStateId: "russia",
      deFactoStateId: "russia",
      isCapital: true,
      historicalBuildTypeCount: 5
    }));
  });

  it("lets a GM edit all strategic city fields used by the current system", () => {
    const onUpdate = vi.fn();
    render(<StrategicCityEditor role="GM" states={states} cities={[city]} onCreate={vi.fn()} onUpdate={onUpdate} onDelete={vi.fn()} />);

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
      deFactoStateId: "germany",
      isCapital: false,
      historicalBuildTypeCount: 6
    }));
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

  fireEvent.change(screen.getByLabelText("ID города"), { target: { value: "tula" } });
  fireEvent.change(screen.getByLabelText("Название города"), { target: { value: "Тула" } });
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
