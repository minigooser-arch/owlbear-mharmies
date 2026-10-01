export type MapEntityFocus =
  | { type: "ARMY"; id: string }
  | { type: "SHIP"; id: string }
  | { type: "CITY"; id: string };

export function parseMapEntityFocus(value: unknown): MapEntityFocus | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  const type = candidate.type;
  const id = candidate.id;
  if ((type !== "ARMY" && type !== "SHIP" && type !== "CITY") || typeof id !== "string" || id.length === 0) {
    return undefined;
  }
  return { type, id } as MapEntityFocus;
}
