export interface ArmyTokenPickerOptions {
  multiple: false;
  defaultSearch: undefined;
  typeHint: undefined;
}

/**
 * Army tokens are regular image assets. Do not pre-filter the picker by the
 * faction name or by an Assets Manager category: existing tokens may have
 * been uploaded under any image type.
 */
export function armyTokenPickerOptions(): ArmyTokenPickerOptions {
  return {
    multiple: false,
    defaultSearch: undefined,
    typeHint: undefined
  };
}
