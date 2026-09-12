// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    expect(screen.getByText("Москва")).toBeTruthy();
    expect(screen.getByText(/Исторических типов построек: 4/)).toBeTruthy();
    expect(screen.getByText(/Столица/)).toBeTruthy();
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
