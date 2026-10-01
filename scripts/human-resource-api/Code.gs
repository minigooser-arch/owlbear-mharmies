/**
 * Letopis authoritative human-resource API.
 *
 * Web app:
 *   POST { token, action: "snapshot" }
 *   POST { token, action: "spendLRBatch", requestId, operations: [...] }
 *   POST { token, action: "refundLRBatch", requestId, originalRequestId }
 *
 * Amounts are stored in thousands of people. Example: 5 = 5,000 people.
 *
 * Required Script Properties:
 *   LETOPIS_SHEET_ID
 *   LETOPIS_API_TOKEN
 */

const CONFIG = Object.freeze({
  STATE_SHEET: "ГОСУДАРСТВА [1910]",
  BACKEND_SHEET: "backend",
  LOG_SHEET: "ЛР_ОПЕРАЦИИ",
  STATE_ROW_NAME_COL: 11, // K
  STATE_ROW_POPULATION_COL: 16, // P
  STATE_ROW_LR_COL: 41, // AO
  STATE_ROW_LAW_COL: 41, // AO on the following details row
  BACKEND_COUNTRY_COL: 1, // A
  BACKEND_POPULATION_COL: 3, // C
  BACKEND_COEF_FORMULA_COL: 6, // F
  FIRST_DATA_ROW: 2,
  LOG_HEADERS: [
    "requestId", "createdAt", "country", "stateId", "stateName", "kind",
    "hp", "ratePerHp", "amount", "amountPeople", "populationBefore",
    "populationAfter", "humanResourceBefore", "humanResourceAfter",
    "armyId", "armyName", "cityId", "cityName", "actorPlayerId",
    "turnNumber", "batchRequestId", "status"
  ]
});

function doGet() {
  return json_({ ok: true, service: "letopis-human-resource", version: 1 });
}

function doPost(e) {
  try {
    const body = parseBody_(e);
    if (!constantTimeEqual_(String(body.token || ""), getToken_())) {
      return json_({ ok: false, code: "UNAUTHORIZED" });
    }

    switch (String(body.action || "")) {
      case "snapshot":
        return json_(withLock_(function() {
          return { ok: true, states: snapshot_(), appliedAt: new Date().toISOString() };
        }));
      case "spendLRBatch":
        return json_(withLock_(function() {
          return spendBatch_(body);
        }));
      case "refundLRBatch":
        return json_(withLock_(function() {
          return refundBatch_(body);
        }));
      default:
        return json_({ ok: false, code: "UNKNOWN_ACTION" });
    }
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return json_({
      ok: false,
      code: error && error.code ? String(error.code) : "INTERNAL_ERROR",
      message: error && error.message ? String(error.message) : String(error)
    });
  }
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw apiError_("INVALID_REQUEST", "POST JSON body is required.");
  }
  try {
    const body = JSON.parse(e.postData.contents);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("body");
    }
    return body;
  } catch (_) {
    throw apiError_("INVALID_JSON", "Request body is not valid JSON.");
  }
}

function getToken_() {
  const token = PropertiesService.getScriptProperties().getProperty("LETOPIS_API_TOKEN");
  if (!token) throw apiError_("API_TOKEN_NOT_CONFIGURED");
  return token;
}

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty("LETOPIS_SHEET_ID");
  if (!id) throw apiError_("SHEET_ID_NOT_CONFIGURED");
  return SpreadsheetApp.openById(id);
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    throw apiError_("BUSY", "Another LR transaction is being processed.");
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function stateIndex_() {
  const ss = getSpreadsheet_();
  const stateSheet = ss.getSheetByName(CONFIG.STATE_SHEET);
  const backend = ss.getSheetByName(CONFIG.BACKEND_SHEET);
  if (!stateSheet || !backend) throw apiError_("SHEET_LAYOUT_ERROR");

  const backendLastRow = backend.getLastRow();
  if (backendLastRow < CONFIG.FIRST_DATA_ROW) return new Map();

  const count = backendLastRow - CONFIG.FIRST_DATA_ROW + 1;
  const backendValues = backend.getRange(CONFIG.FIRST_DATA_ROW, 1, count, 9).getValues();
  const backendFormulas = backend.getRange(CONFIG.FIRST_DATA_ROW, CONFIG.BACKEND_COEF_FORMULA_COL, count, 1).getFormulas();
  const index = new Map();

  for (let i = 0; i < count; i += 1) {
    const country = String(backendValues[i][CONFIG.BACKEND_COUNTRY_COL - 1] || "").trim();
    if (!country) continue;

    const population = numberOrUndefined_(backendValues[i][CONFIG.BACKEND_POPULATION_COL - 1]);
    const formula = String(backendFormulas[i][0] || "");
    const rowMatch = formula.match(/!V(\d+)$/i);
    const stateRow = rowMatch ? Number(rowMatch[1]) : findStateRowByPopulation_(stateSheet, population);
    if (!stateRow || stateRow < 1) continue;

    const stateName = String(stateSheet.getRange(stateRow, CONFIG.STATE_ROW_NAME_COL).getDisplayValue() || "").trim();
    index.set(normalizeKey_(country), {
      country,
      stateRow,
      stateName,
      population
    });
  }
  return index;
}

function findStateRowByPopulation_(sheet, population) {
  if (!numberOrUndefined_(population)) return undefined;
  const lastRow = sheet.getLastRow();
  if (lastRow < 1) return undefined;
  const values = sheet.getRange(1, CONFIG.STATE_ROW_POPULATION_COL, lastRow, 1).getValues();
  for (let i = 0; i < values.length; i += 1) {
    const value = numberOrUndefined_(values[i][0]);
    if (value !== undefined && Math.abs(value - population) < 0.000001) return i + 1;
  }
  return undefined;
}

function snapshot_() {
  const ss = getSpreadsheet_();
  const stateSheet = ss.getSheetByName(CONFIG.STATE_SHEET);
  const index = stateIndex_();
  const result = [];

  index.forEach(function(meta) {
    const population = numberOrUndefined_(stateSheet.getRange(meta.stateRow, CONFIG.STATE_ROW_POPULATION_COL).getValue());
    const humanResource = readHumanResource_(stateSheet, meta.stateRow);
    const conscriptionRate = readConscriptionRate_(stateSheet, meta.stateRow);
    const capacity = calculateHumanResourceCapacity_(population, conscriptionRate);
    if (population === undefined || humanResource === undefined) return;
    result.push({
      country: meta.country,
      population,
      humanResource,
      humanResourceCapacity: capacity,
      conscriptionRate
    });
  });

  result.sort(function(a, b) { return a.country.localeCompare(b.country); });
  return result;
}

function spendBatch_(body) {
  const requestId = requireString_(body.requestId, "REQUEST_ID_REQUIRED");
  const operations = Array.isArray(body.operations) ? body.operations : [];
  if (operations.length === 0) throw apiError_("OPERATIONS_REQUIRED");
  if (operations.length > 256) throw apiError_("TOO_MANY_OPERATIONS");

  const previous = findLogRowsByBatch_(requestId);
  if (previous.length > 0) {
    return {
      ok: true,
      requestId,
      states: snapshot_(),
      operations: previous.map(logRowToOperation_),
      appliedAt: previous[0].createdAt || new Date().toISOString()
    };
  }

  const index = stateIndex_();
  const ss = getSpreadsheet_();
  const stateSheet = ss.getSheetByName(CONFIG.STATE_SHEET);
  const prepared = [];
  const deltaByCountry = new Map();

  operations.forEach(function(raw) {
    const operation = normalizeOperation_(raw);
    const key = normalizeKey_(operation.country);
    const meta = index.get(key);
    if (!meta) throw apiError_("STATE_NOT_FOUND", operation.country);

    const current = readHumanResource_(stateSheet, meta.stateRow);
    const requestedDelta = (deltaByCountry.get(key) || 0) + operation.amount;
    if (current === undefined) throw apiError_("INVALID_HUMAN_RESOURCE", operation.country);
    if (current + 1e-9 < requestedDelta) {
      const error = apiError_("INSUFFICIENT_HUMAN_RESOURCE", operation.country);
      error.states = snapshot_();
      throw error;
    }

    prepared.push({
      operation,
      meta,
      populationBefore: numberOrUndefined_(stateSheet.getRange(meta.stateRow, CONFIG.STATE_ROW_POPULATION_COL).getValue()) || 0,
      humanResourceBefore: current,
      humanResourceAfter: current - requestedDelta,
      key
    });
    deltaByCountry.set(key, requestedDelta);
  });

  const createdAt = new Date().toISOString();
  const rows = [];
  const latestByCountry = new Map();

  prepared.forEach(function(entry) {
    const after = entry.humanResourceBefore - (deltaByCountry.get(entry.key) || 0);
    latestByCountry.set(entry.key, after);
  });

  prepared.forEach(function(entry) {
    const operation = entry.operation;
    const after = latestByCountry.get(entry.key);
    const stateSheetRow = entry.meta.stateRow;
    const population = entry.populationBefore;
    stateSheet.getRange(stateSheetRow, CONFIG.STATE_ROW_LR_COL).setValue(after);
    rows.push(operationLogRow_(
      requestId,
      createdAt,
      entry.meta,
      operation,
      population,
      after + operation.amount,
      after,
      "SPENT"
    ));
  });

  appendLogRows_(rows);
  SpreadsheetApp.flush();

  return {
    ok: true,
    requestId,
    states: snapshot_(),
    operations: rows.map(logRowToOperation_),
    appliedAt: createdAt
  };
}

function refundBatch_(body) {
  const requestId = requireString_(body.requestId, "REQUEST_ID_REQUIRED");
  const originalRequestId = requireString_(body.originalRequestId, "ORIGINAL_REQUEST_ID_REQUIRED");

  const existingRefund = findLogRowsByBatch_(requestId);
  if (existingRefund.length > 0) {
    return {
      ok: true,
      requestId,
      states: snapshot_(),
      operations: existingRefund.map(logRowToOperation_),
      appliedAt: existingRefund[0].createdAt || new Date().toISOString()
    };
  }

  const spent = findLogRowsByBatch_(originalRequestId).filter(function(row) {
    return row.status === "SPENT";
  });
  if (spent.length === 0) {
    throw apiError_("ORIGINAL_TRANSACTION_NOT_FOUND", originalRequestId);
  }
  const alreadyRefunded = findLogRowsByBatch_(originalRequestId).some(function(row) {
    return row.status === "REFUNDED";
  });
  if (alreadyRefunded) {
    return {
      ok: true,
      requestId,
      states: snapshot_(),
      operations: [],
      appliedAt: new Date().toISOString()
    };
  }

  const ss = getSpreadsheet_();
  const stateSheet = ss.getSheetByName(CONFIG.STATE_SHEET);
  const index = stateIndex_();
  const totals = new Map();

  spent.forEach(function(row) {
    const key = normalizeKey_(row.country);
    totals.set(key, (totals.get(key) || 0) + Number(row.amount || 0));
  });

  totals.forEach(function(amount, key) {
    const meta = index.get(key);
    if (!meta) throw apiError_("STATE_NOT_FOUND", key);
    const current = readHumanResource_(stateSheet, meta.stateRow);
    if (current === undefined) throw apiError_("INVALID_HUMAN_RESOURCE", key);
    stateSheet.getRange(meta.stateRow, CONFIG.STATE_ROW_LR_COL).setValue(current + amount);
  });

  const createdAt = new Date().toISOString();
  const rows = spent.map(function(row) {
    return row.slice().map(function(value, index) {
      if (index === 0) return requestId;
      if (index === 1) return createdAt;
      if (index === 8) return Number(value || 0);
      if (index === 9) return Number(value || 0) * 1000;
      if (index === 20) return requestId;
      if (index === 21) return "REFUNDED";
      return value;
    });
  });

  appendLogRows_(rows);
  SpreadsheetApp.flush();

  return {
    ok: true,
    requestId,
    states: snapshot_(),
    operations: rows.map(logRowToOperation_),
    appliedAt: createdAt
  };
}

function normalizeOperation_(raw) {
  if (!raw || typeof raw !== "object") throw apiError_("INVALID_OPERATION");
  const country = requireString_(raw.country, "COUNTRY_REQUIRED");
  const amount = Number(raw.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw apiError_("INVALID_AMOUNT", country);

  return {
    country,
    amount,
    kind: optionalString_(raw.kind),
    hp: finiteOrUndefined_(raw.hp),
    ratePerHp: finiteOrUndefined_(raw.ratePerHp),
    stateId: optionalString_(raw.stateId),
    stateName: optionalString_(raw.stateName),
    armyId: optionalString_(raw.armyId),
    armyName: optionalString_(raw.armyName),
    cityId: raw.cityId === null ? null : optionalString_(raw.cityId),
    cityName: raw.cityName === null ? null : optionalString_(raw.cityName),
    actorPlayerId: optionalString_(raw.actorPlayerId),
    turnNumber: Number.isInteger(raw.turnNumber) ? raw.turnNumber : undefined
  };
}

function readHumanResource_(sheet, stateRow) {
  const raw = sheet.getRange(stateRow, CONFIG.STATE_ROW_LR_COL).getValue();
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;

  const display = sheet.getRange(stateRow, CONFIG.STATE_ROW_LR_COL).getDisplayValue();
  return parseCompactHumanResource_(display);
}

function parseCompactHumanResource_(value) {
  const text = String(value || "").replace(/[\u00A0\s]/g, " ").trim();
  if (!text) return undefined;
  const compact = text.match(/([\d.,]+)\s*[МM]\.?(?:\s*([\d.,]+)\s*[ТT]\.?)?/i);
  if (compact) {
    const millions = Number(String(compact[1]).replace(",", "."));
    const thousands = compact[2] === undefined ? 0 : Number(String(compact[2]).replace(",", "."));
    if (Number.isFinite(millions) && Number.isFinite(thousands)) return millions * 1000 + thousands;
  }
  const thousands = text.match(/([\d.,]+)\s*[ТT]\.?/i);
  if (thousands) {
    const value = Number(String(thousands[1]).replace(",", "."));
    if (Number.isFinite(value)) return value;
  }
  const plain = Number(text.replace(/[\s\u00A0]/g, "").replace(",", "."));
  return Number.isFinite(plain) ? plain : undefined;
}

function readConscriptionRate_(sheet, stateRow) {
  const value = String(sheet.getRange(stateRow + 1, CONFIG.STATE_ROW_LAW_COL).getDisplayValue() || "").toUpperCase();
  if (value.indexOf("ВСЕХ ПОД РУЖЬЁ") >= 0) return 0.24;
  if (value.indexOf("МАССОВАЯ МОБИЛИЗАЦИЯ") >= 0) return 0.18;
  if (value.indexOf("ЧАСТИЧНАЯ МОБИЛИЗАЦИЯ") >= 0) return 0.08;
  if (value.indexOf("СРОЧНЫЙ ПРИЗЫВ") >= 0) return 0.04;
  if (value.indexOf("КОНТРАКТНАЯ СЛУЖБА") >= 0) return 0.02;
  return 0;
}

function calculateHumanResourceCapacity_(population, rate) {
  if (!Number.isFinite(population) || population <= 0 || !Number.isFinite(rate) || rate <= 0) return 0;
  return rate * population * Math.pow(4200 / population, 0.48);
}

function ensureLogSheet_() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(CONFIG.LOG_SHEET);
  if (!sheet) sheet = ss.insertSheet(CONFIG.LOG_SHEET);
  const headers = CONFIG.LOG_HEADERS;
  const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  let different = false;
  for (let i = 0; i < headers.length; i += 1) {
    if (current[i] !== headers[i]) { different = true; break; }
  }
  if (different) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  return sheet;
}

function appendLogRows_(rows) {
  if (rows.length === 0) return;
  const sheet = ensureLogSheet_();
  const start = sheet.getLastRow() + 1;
  sheet.getRange(start, 1, rows.length, CONFIG.LOG_HEADERS.length).setValues(rows);
}

function findLogRowsByBatch_(batchRequestId) {
  const sheet = ensureLogSheet_();
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const values = sheet.getRange(2, 1, last - 1, CONFIG.LOG_HEADERS.length).getValues();
  return values.filter(function(row) {
    return String(row[20] || "") === String(batchRequestId);
  });
}

function operationLogRow_(requestId, createdAt, meta, operation, population, before, after, status) {
  return [
    requestId,
    createdAt,
    meta.country,
    operation.stateId || "",
    operation.stateName || meta.stateName || "",
    operation.kind || "",
    operation.hp === undefined ? "" : operation.hp,
    operation.ratePerHp === undefined ? "" : operation.ratePerHp,
    operation.amount,
    operation.amount * 1000,
    population,
    population,
    before,
    after,
    operation.armyId || "",
    operation.armyName || "",
    operation.cityId === null || operation.cityId === undefined ? "" : operation.cityId,
    operation.cityName === null || operation.cityName === undefined ? "" : operation.cityName,
    operation.actorPlayerId || "",
    operation.turnNumber === undefined ? "" : operation.turnNumber,
    requestId,
    status
  ];
}

function logRowToOperation_(row) {
  return {
    country: String(row[2] || ""),
    amount: Number(row[8] || 0),
    kind: row[5] ? String(row[5]) : undefined,
    hp: row[6] === "" ? undefined : Number(row[6]),
    stateId: row[3] ? String(row[3]) : undefined,
    stateName: row[4] ? String(row[4]) : undefined,
    armyId: row[14] ? String(row[14]) : undefined,
    armyName: row[15] ? String(row[15]) : undefined,
    cityId: row[16] ? String(row[16]) : null,
    cityName: row[17] ? String(row[17]) : null,
    actorPlayerId: row[18] ? String(row[18]) : undefined,
    turnNumber: row[19] === "" ? undefined : Number(row[19]),
    populationBefore: Number(row[10] || 0),
    populationAfter: Number(row[11] || 0),
    humanResourceBefore: Number(row[12] || 0),
    humanResourceAfter: Number(row[13] || 0),
    status: String(row[21] || "")
  };
}

function normalizeKey_(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

function requireString_(value, code) {
  const text = String(value || "").trim();
  if (!text) throw apiError_(code);
  return text;
}

function optionalString_(value) {
  if (value === null || value === undefined || value === "") return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function finiteOrUndefined_(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function numberOrUndefined_(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function apiError_(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function constantTimeEqual_(left, right) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let i = 0; i < left.length; i += 1) {
    result |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return result === 0;
}
