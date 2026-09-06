import { METADATA_KEYS } from "../shared/constants";
import type { SceneItemRecord, ShipClassId, ShipFacing } from "../shared/types";

export type RegistrationSelectionErrorCode =
  | "SELECTION_EMPTY"
  | "SELECTION_MULTIPLE"
  | "ITEM_NOT_FOUND"
  | "IMAGE_REQUIRED"
  | "ALREADY_REGISTERED";

export class RegistrationError extends Error {
  constructor(readonly code: RegistrationSelectionErrorCode) {
    super(code);
    this.name = "RegistrationError";
  }
}

export interface RegistrationSelectionInput {
  selection: readonly string[];
  items: readonly SceneItemRecord[];
}

export function resolveRegistrationSelection(
  input: RegistrationSelectionInput
): SceneItemRecord {
  if (input.selection.length === 0) throw new RegistrationError("SELECTION_EMPTY");
  if (input.selection.length !== 1) throw new RegistrationError("SELECTION_MULTIPLE");
  const item = input.items.find((candidate) => candidate.id === input.selection[0]);
  if (!item) throw new RegistrationError("ITEM_NOT_FOUND");
  if (item.type !== "IMAGE") throw new RegistrationError("IMAGE_REQUIRED");
  if (
    item.metadata[METADATA_KEYS.army] !== undefined ||
    item.metadata[METADATA_KEYS.ship] !== undefined
  ) {
    throw new RegistrationError("ALREADY_REGISTERED");
  }
  return item;
}

export interface SelectedShipRegistrationInput extends RegistrationSelectionInput {
  sideId: string;
  classId: ShipClassId;
  facing: ShipFacing;
}

export function buildSelectedShipRegistrationPayload(input: SelectedShipRegistrationInput) {
  const item = resolveRegistrationSelection(input);
  return {
    type: "REGISTER_SHIP" as const,
    itemId: item.id,
    sideId: input.sideId,
    classId: input.classId,
    facing: input.facing
  };
}
