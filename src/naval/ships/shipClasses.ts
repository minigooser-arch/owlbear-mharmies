import type { ShipClassId } from "../../shared/types";

export interface ShipClassDefinition {
  id: ShipClassId;
  name: string;
  maxHp: number;
  armor: number;
  movement: number;
  normalDice: number;
  normalRangeMin: number;
  normalRangeMax: number;
  minLengthChunks: number;
  minWidthChunks: number;
  constructionRequirements: readonly string[];
}

export const SHIP_CLASSES: Readonly<Record<ShipClassId, ShipClassDefinition>> = Object.freeze({
  BATTLESHIP: Object.freeze({
    id: "BATTLESHIP",
    name: "Линкор",
    maxHp: 30,
    armor: 3,
    movement: 2,
    normalDice: 3,
    normalRangeMin: 2,
    normalRangeMax: 3,
    minLengthChunks: 7,
    minWidthChunks: 2,
    constructionRequirements: Object.freeze([
      "Корпус из материалов, подходящих для Movecraft: киль, днище, борта, шпангоуты, форштевень и корма",
      "Палубы и карапасная палуба",
      "Артиллерийские орудия: главный, вспомогательный и зенитный калибры",
      "Мачты, командная рубка, совмещённая с рулевой, и палубные надстройки",
      "Каюты, машинное отделение и якорное устройство"
    ])
  }),
  CRUISER: Object.freeze({
    id: "CRUISER",
    name: "Крейсер",
    maxHp: 25,
    armor: 1,
    movement: 3,
    normalDice: 2,
    normalRangeMin: 1,
    normalRangeMax: 2,
    minLengthChunks: 5,
    minWidthChunks: 2,
    constructionRequirements: Object.freeze([
      "Корпус, разделённый на 3 отсека: форштевень, корма, днище, борта, шпангоуты и киль",
      "Палубы и карапасная палуба",
      "Артиллерийские установки главного и среднего калибра и торпедные аппараты",
      "Палубные надстройки и командная рубка, совмещённая с рулевой",
      "Каюты, машинное отделение и якорное устройство"
    ])
  }),
  IRONCLAD: Object.freeze({
    id: "IRONCLAD",
    name: "Броненосец",
    maxHp: 25,
    armor: 2,
    movement: 4,
    normalDice: 2,
    normalRangeMin: 1,
    normalRangeMax: 1,
    minLengthChunks: 6,
    minWidthChunks: 2,
    constructionRequirements: Object.freeze([
      "Корпус из материалов Movecraft, разделённый на 2 части, с двойным дном и водонепроницаемыми переборками",
      "Киль, шпангоуты, днище, борта, форштевень с тараном, корма и защищённая цитадель",
      "Карапасная палуба, броневой пояс и броневые траверсы",
      "Торпедные аппараты и артиллерия главного и вспомогательного калибров",
      "Каюты, машинное отделение, боевые мачты, командная рубка и якорное устройство"
    ])
  }),
  HOSPITAL: Object.freeze({
    id: "HOSPITAL",
    name: "Госпитальное судно",
    maxHp: 20,
    armor: 0,
    movement: 4,
    normalDice: 0,
    normalRangeMin: 0,
    normalRangeMax: 0,
    minLengthChunks: 5,
    minWidthChunks: 2,
    constructionRequirements: Object.freeze([
      "Корпус с двойным дном и двойными бортами: киль, корма, днище, шпангоуты и форштевень",
      "Больничные палаты и хирургическое отделение",
      "Устройства пожаротушения и ремонтное отделение",
      "Палубы, каюты и ходовой мостик",
      "Машинное отделение и якорное устройство"
    ])
  }),
  TRANSPORT: Object.freeze({
    id: "TRANSPORT",
    name: "Грузовой корабль",
    maxHp: 20,
    armor: 0,
    movement: 4,
    normalDice: 0,
    normalRangeMin: 0,
    normalRangeMax: 0,
    minLengthChunks: 5,
    minWidthChunks: 2,
    constructionRequirements: Object.freeze([
      "Корпус с двойным дном и двойными бортами: киль, корма, днище, шпангоуты и форштевень",
      "Коффердамы",
      "Загрузочные отсеки и люки",
      "Палубы, каюты и ходовой мостик",
      "Машинное отделение и якорное устройство"
    ])
  })
});
