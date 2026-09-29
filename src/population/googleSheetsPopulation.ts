export interface BackendPopulationRow {
  country: string;
  population: number;
  growthRate: number;
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
