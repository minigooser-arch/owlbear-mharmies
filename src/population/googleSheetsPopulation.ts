export interface BackendPopulationRow {
  country: string;
  population: number;
  growthRate: number;
}

export interface StateConscriptionRow {
  stateName: string;
  category: string;
  /** Current LR in thousands, as represented by the formatted state row. */
  humanResource?: number;
}

function delimiterFor(csv: string): "," | ";" {
  const header = csv.split(/\r?\n/, 1)[0] ?? "";
  return (header.match(/;/g)?.length ?? 0) > (header.match(/,/g)?.length ?? 0) ? ";" : ",";
}

function parseCsvRecords(csv: string, delimiter: "," | ";"): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"') {
      quoted = true;
    } else if (character === delimiter) {
      record.push(field);
      field = "";
    } else if (character === "\n") {
      record.push(field.replace(/\r$/, ""));
      if (record.some((value) => value.trim() !== "")) records.push(record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }

  record.push(field.replace(/\r$/, ""));
  if (record.some((value) => value.trim() !== "")) records.push(record);
  return records;
}

function parseNumber(value: string): number | undefined {
  const normalized = value
    .replace(/^\uFEFF/, "")
    .replace(/[\u00A0\s]/g, "")
    .replace(",", ".");
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isUsableCategory(value: string | undefined): value is string {
  const normalized = value?.trim();
  return Boolean(normalized && normalized !== "/" && normalized !== "-");
}

function parseHumanResource(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const normalized = value.replace(/[\u00A0\s]/g, " ").trim();
  const compact = normalized.match(/^([\d.,]+)\s*[МM]\.?(?:\s*([\d.,]+)\s*[ТT]\.?)?$/i);
  if (compact) {
    const millions = parseNumber(compact[1] ?? "");
    const thousands = compact[2] === undefined ? 0 : parseNumber(compact[2]);
    return millions === undefined || thousands === undefined ? undefined : millions * 1000 + thousands;
  }
  const thousands = normalized.match(/^([\d.,]+)\s*[ТT]\.?$/i);
  if (thousands) return parseNumber(thousands[1] ?? "");
  const plain = parseNumber(normalized);
  return plain;
}

/**
 * Reads the category from the public `ГОСУДАРСТВА [1910]` export.
 * The sheet stores a country row followed by a faction/details row; the
 * category is in AO (zero-based column 40) on that following row.
 */
export function parseConscriptionCategoryCsv(csv: string): StateConscriptionRow[] {
  if (!csv.trim()) return [];
  const records = parseCsvRecords(csv, delimiterFor(csv));
  const headers = records[0]?.map((header) => header.replace(/^\uFEFF/, "").trim().toLowerCase()) ?? [];
  const directStateIndex = headers.findIndex((header) => ["state_name", "state", "country_name"].includes(header));
  const directCategoryIndex = headers.findIndex((header) => ["category", "conscription", "conscription_category", "draft_law"].includes(header));
  const directHumanResourceIndex = headers.findIndex((header) => ["human_resource", "humanresource", "lr", "человеческий ресурс"].includes(header));
  if (directStateIndex >= 0 && directCategoryIndex >= 0) {
    return records.slice(1).flatMap((record) => {
      const stateName = record[directStateIndex]?.trim();
      const category = record[directCategoryIndex]?.trim();
      const humanResource = directHumanResourceIndex >= 0 ? parseHumanResource(record[directHumanResourceIndex]) : undefined;
      return stateName && isUsableCategory(category)
        ? [{ stateName, category, ...(humanResource !== undefined ? { humanResource } : {}) }]
        : [];
    });
  }

  const rows: StateConscriptionRow[] = [];
  let pendingStateName: string | undefined;
  let pendingHumanResource: number | undefined;
  for (const record of records) {
    const stateName = record[10]?.trim();
    // The public sheet formats population as e.g. `46М. 084Т.`, not as a
    // plain number. Use the same compact-number parser and fall back to the
    // numeric state index so a formatted/blank population cell cannot hide
    // the following faction row's conscription category.
    const isStateRow = stateName && (parseHumanResource(record[15]) !== undefined || parseNumber(record[1] ?? "") !== undefined);
    if (isStateRow) {
      pendingStateName = stateName;
      pendingHumanResource = parseHumanResource(record[40]);
    }
    const category = record[40]?.trim();
    if (pendingStateName && isUsableCategory(category) && parseNumber(category) === undefined && parseHumanResource(category) === undefined) {
      rows.push({ stateName: pendingStateName, category, ...(pendingHumanResource !== undefined ? { humanResource: pendingHumanResource } : {}) });
      pendingStateName = undefined;
      pendingHumanResource = undefined;
    }
  }
  return rows;
}

export function parseBackendPopulationCsv(csv: string): BackendPopulationRow[] {
  if (!csv.trim()) return [];
  const records = parseCsvRecords(csv, delimiterFor(csv));
  const headers = records.shift()?.map((header) => header.replace(/^\uFEFF/, "").trim().toLowerCase()) ?? [];
  const countryIndex = headers.indexOf("country");
  const populationIndex = headers.indexOf("population");
  const growthRateIndex = headers.indexOf("growth_rate");
  if (countryIndex < 0 || populationIndex < 0 || growthRateIndex < 0) return [];

  return records.flatMap((record) => {
    const country = record[countryIndex]?.trim();
    const population = parseNumber(record[populationIndex] ?? "");
    const growthRate = parseNumber(record[growthRateIndex] ?? "");
    if (!country || population === undefined || population < 0 || growthRate === undefined || growthRate <= 0) return [];
    return [{ country, population, growthRate }];
  });
}
