/**
 * Летопись — Owlbear → Google Sheets writeback.
 *
 * IMPORTANT:
 * 1) Put this file into the same Apps Script project that owns the 00:06 population-growth job.
 * 2) Both jobs use the same ScriptLock, so growth and LR spending cannot mutate backend!C concurrently.
 * 3) Set Script Property API_TOKEN to a long random secret. The Owlbear GM stores that secret
 *    only in browser localStorage; it is never written into SceneSettings.
 * 4) Deploy as Web App, Execute as the spreadsheet owner, access according to your project policy.
 */

const WRITEBACK_CONFIG = Object.freeze({
  SPREADSHEET_ID: "1wlTrvSxeoQDPKO0s9C0ooKF3xMqmTfcCDB70y-1X2QA",
  BACKEND_SHEET: "backend",
  STATE_SHEET: "ГОСУДАРСТВА [1910]",
  LR_LOG_SHEET: "ЛР_ОПЕРАЦИИ",
  ARMIES_SHEET: "АРМИИ",
  TOKEN_PROPERTY: "API_TOKEN"
});

const LR_LOG_HEADERS = [
  "requestId", "batchRequestId", "kind", "country", "stateName",
  "armyId", "armyName", "cityId", "cityName", "hp", "ratePerHp",
  "amount", "amountPeople", "populationBefore", "populationAfter",
  "humanResourceBefore", "humanResourceAfter", "actorPlayerId",
  "turnNumber", "createdAt", "status"
];

const ARMY_HEADERS = ["armyId", "stateId", "country", "hp", "maxHp"];

function doGet() {
  return json_({ ok: true, result: { service: "letopis-sheet-writeback", version: 1 } });
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    assertToken_(body.token);
    switch (body.action) {
      case "GET_STATES":
        return json_({ ok: true, result: withScriptLock_(function() {
          return { states: getStateSnapshots_(body.countries) };
        }) });
      case "SPEND_LR_BATCH":
        return json_({ ok: true, result: withScriptLock_(function() {
          return spendLRBatch_(body.operations, body.batchRequestId);
        }) });
      case "SYNC_STATE":
        return json_({ ok: true, result: withScriptLock_(function() {
          syncState_(body.event);
          return null;
        }) });
      default:
        throw new Error("UNKNOWN_ACTION");
    }
  } catch (error) {
    return json_({ ok: false, error: errorCode_(error) });
  }
}

function initializeWritebackToken() {
  const props = PropertiesService.getScriptProperties();
  let token = props.getProperty(WRITEBACK_CONFIG.TOKEN_PROPERTY);
  if (!token) {
    token = Utilities.getUuid() + "-" + Utilities.getUuid();
    props.setProperty(WRITEBACK_CONFIG.TOKEN_PROPERTY, token);
  }
  Logger.log("API_TOKEN=" + token);
  return token;
}

function assertToken_(token) {
  const expected = PropertiesService.getScriptProperties().getProperty(WRITEBACK_CONFIG.TOKEN_PROPERTY);
  if (!expected || typeof token !== "string" || token !== expected) throw new Error("UNAUTHORIZED");
}

function withScriptLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function openSpreadsheet_() {
  return SpreadsheetApp.openById(WRITEBACK_CONFIG.SPREADSHEET_ID);
}

function backendSheet_() {
  return openSpreadsheet_().getSheetByName(WRITEBACK_CONFIG.BACKEND_SHEET);
}

function stateSheet_() {
  return openSpreadsheet_().getSheetByName(WRITEBACK_CONFIG.STATE_SHEET);
}

function lrLogSheet_() {
  const sheet = openSpreadsheet_().getSheetByName(WRITEBACK_CONFIG.LR_LOG_SHEET);
  if (!sheet) throw new Error("LR_LOG_SHEET_MISSING");
  return sheet;
}

function armiesSheet_() {
  const spreadsheet = openSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(WRITEBACK_CONFIG.ARMIES_SHEET);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(WRITEBACK_CONFIG.ARMIES_SHEET);
    sheet.getRange(1, 1, 1, ARMY_HEADERS.length).setValues([ARMY_HEADERS]);
  } else {
    const header = sheet.getRange(1, 1, 1, ARMY_HEADERS.length).getValues()[0];
    if (header.join("\u001f") !== ARMY_HEADERS.join("\u001f")) {
      throw new Error("ARMIES_SHEET_HEADER_INVALID");
    }
  }
  return sheet;
}

function backendIndex_() {
  const sheet = backendSheet_();
  if (!sheet) throw new Error("BACKEND_SHEET_MISSING");
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return new Map();
  const values = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
  const formulas = sheet.getRange(2, 6, lastRow - 1, 1).getFormulas();
  const result = new Map();

  for (let i = 0; i < values.length; i++) {
    const country = String(values[i][0] == null ? "" : values[i][0]).trim();
    if (!country) continue;
    const formula = String(formulas[i][0] || "");
    const match = formula.match(/!\$?V\$?(\d+)/i);
    if (!match) throw new Error("BACKEND_COEF_FORMULA_INVALID:" + country);
    result.set(country, {
      row: i + 2,
      stateRow: Number(match[1]),
      population: Number(values[i][2]) || 0
    });
  }
  return result;
}

function stateContext_(country, backendRow) {
  const sheet = stateSheet_();
  if (!sheet) throw new Error("STATE_SHEET_MISSING");
  const stateRow = backendRow.stateRow;
  const stateName = String(sheet.getRange(stateRow, 10).getDisplayValue() || country).trim();
  const humanResource = Number(sheet.getRange(stateRow, 44).getValue());
  if (!Number.isFinite(humanResource)) throw new Error("STATE_LR_INVALID:" + country);
  const category = String(sheet.getRange(stateRow + 1, 41).getDisplayValue() || "").trim();
  return {
    country,
    stateName,
    stateRow,
    humanResource,
    category,
    conscriptionRate: conscriptionRate_(category)
  };
}

function conscriptionRate_(category) {
  const normalized = category
    .toUpperCase()
    .replace(/\s*\([^)]*\)\s*/g, "")
    .trim();
  const rates = {
    "ДЕМИЛИТАРИЗАЦИЯ": 0,
    "КОНТРАКТНАЯ СЛУЖБА": 0.02,
    "СРОЧНЫЙ ПРИЗЫВ": 0.04,
    "ЧАСТИЧНАЯ МОБИЛИЗАЦИЯ": 0.08,
    "МАССОВАЯ МОБИЛИЗАЦИЯ": 0.18,
    "ВСЕОБЩАЯ МОБИЛИЗАЦИЯ": 0.24
  };
  return Object.prototype.hasOwnProperty.call(rates, normalized) ? rates[normalized] : undefined;
}

function snapshotForCountry_(country, index) {
  const backendRow = index.get(country);
  if (!backendRow) throw new Error("COUNTRY_NOT_FOUND:" + country);
  const context = stateContext_(country, backendRow);
  return {
    country,
    population: Number(backendSheet_().getRange(backendRow.row, 3).getValue()),
    humanResource: context.humanResource,
    ...(context.conscriptionRate === undefined ? {} : { conscriptionRate: context.conscriptionRate })
  };
}

function getStateSnapshots_(countries) {
  if (!Array.isArray(countries)) throw new Error("INVALID_COUNTRIES");
  const index = backendIndex_();
  const unique = [...new Set(countries.map(function(country) {
    return String(country || "").trim();
  }).filter(Boolean))];
  return unique.map(function(country) {
    return snapshotForCountry_(country, index);
  });
}

function existingLRRequests_(sheet) {
  const result = new Map();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return result;
  const values = sheet.getRange(2, 1, lastRow - 1, LR_LOG_HEADERS.length).getValues();
  for (let i = 0; i < values.length; i++) {
    const requestId = String(values[i][0] || "").trim();
    if (!requestId) continue;
    result.set(requestId, {
      requestId,
      batchRequestId: String(values[i][1] || ""),
      kind: String(values[i][2] || ""),
      country: String(values[i][3] || ""),
      stateName: String(values[i][4] || ""),
      armyId: String(values[i][5] || ""),
      hp: Number(values[i][9]),
      ratePerHp: Number(values[i][10]),
      populationBefore: Number(values[i][13]),
      populationAfter: Number(values[i][14]),
      humanResourceBefore: Number(values[i][15]),
      humanResourceAfter: Number(values[i][16])
    });
  }
  return result;
}

function validateSpendOperation_(operation, backendIndex) {
  if (!operation || typeof operation !== "object") throw new Error("INVALID_SPEND_OPERATION");
  const requestId = String(operation.requestId || "").trim();
  const country = String(operation.country || "").trim();
  const hp = Number(operation.hp);
  const ratePerHp = Number(operation.ratePerHp);
  const amount = Number(operation.amount);
  if (!requestId || !country || !String(operation.armyId || "").trim()) throw new Error("INVALID_SPEND_OPERATION");
  if (!backendIndex.has(country)) throw new Error("COUNTRY_NOT_FOUND:" + country);
  if (!Number.isInteger(hp) || hp <= 0) throw new Error("INVALID_SPEND_HP:" + requestId);
  if (!Number.isFinite(ratePerHp) || ratePerHp <= 0) throw new Error("INVALID_SPEND_RATE:" + requestId);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("INVALID_SPEND_AMOUNT:" + requestId);
  if (Math.abs(amount - hp * ratePerHp) > 1e-9) throw new Error("SPEND_AMOUNT_MISMATCH:" + requestId);
  if (["FORMATION", "COMPLETION", "HEALING"].indexOf(String(operation.kind)) < 0) {
    throw new Error("INVALID_SPEND_KIND:" + requestId);
  }
  if (!Number.isInteger(Number(operation.turnNumber)) || Number(operation.turnNumber) < 0) {
    throw new Error("INVALID_SPEND_TURN:" + requestId);
  }
  return {
    requestId,
    country,
    hp,
    ratePerHp,
    amount,
    kind: String(operation.kind),
    armyId: String(operation.armyId || ""),
    armyName: String(operation.armyName || ""),
    cityId: operation.cityId == null ? "" : String(operation.cityId),
    cityName: operation.cityName == null ? "" : String(operation.cityName),
    actorPlayerId: String(operation.actorPlayerId || ""),
    turnNumber: Number(operation.turnNumber)
  };
}

function sameDuplicateRequest_(existing, operation) {
  return existing.country === operation.country &&
    existing.kind === operation.kind &&
    existing.armyId === operation.armyId &&
    existing.hp === operation.hp &&
    Math.abs(existing.ratePerHp - operation.ratePerHp) <= 1e-9 &&
    Math.abs(existing.amount - operation.amount) <= 1e-9;
}

function halfUp_(value) {
  return Math.floor(value + 0.5);
}

function spendLRBatch_(operations, batchRequestId) {
  if (!Array.isArray(operations) || operations.length === 0 || operations.length > 64) {
    throw new Error("INVALID_SPEND_BATCH");
  }

  const backend = backendSheet_();
  const log = lrLogSheet_();
  const index = backendIndex_();
  const existing = existingLRRequests_(log);
  const normalized = [];
  const seen = new Set();

  for (let i = 0; i < operations.length; i++) {
    const op = validateSpendOperation_(operations[i], index);
    if (seen.has(op.requestId)) throw new Error("DUPLICATE_BATCH_REQUEST_ID:" + op.requestId);
    seen.add(op.requestId);
    const old = existing.get(op.requestId);
    if (old) {
      if (!sameDuplicateRequest_(old, op)) throw new Error("REQUEST_ID_CONFLICT:" + op.requestId);
      normalized.push({ op, duplicate: old });
    } else {
      normalized.push({ op, duplicate: null });
    }
  }

  const newOperations = normalized.filter(function(entry) { return entry.duplicate === null; });
  const touched = new Map();
  const results = normalized.filter(function(entry) { return entry.duplicate !== null; }).map(function(entry) {
    return entry.duplicate;
  });
  const logRows = [];

  try {
    for (let i = 0; i < newOperations.length; i++) {
      const op = newOperations[i].op;
      const rowInfo = index.get(op.country);
      if (!touched.has(rowInfo.row)) {
        touched.set(rowInfo.row, Number(backend.getRange(rowInfo.row, 3).getValue()));
      }

      const populationBefore = Number(backend.getRange(rowInfo.row, 3).getValue());
      const contextBefore = stateContext_(op.country, rowInfo);
      if (!Number.isFinite(populationBefore) || populationBefore < 0) {
        throw new Error("POPULATION_INVALID:" + op.country);
      }
      if (contextBefore.humanResource + 1e-9 < op.amount) {
        throw new Error("INSUFFICIENT_LR:" + op.requestId);
      }
      if (populationBefore + 1e-9 < op.amount) {
        throw new Error("INSUFFICIENT_POPULATION:" + op.requestId);
      }

      const populationAfter = halfUp_(populationBefore - op.amount);
      if (populationAfter < 0) throw new Error("POPULATION_NEGATIVE:" + op.requestId);
      backend.getRange(rowInfo.row, 3).setValue(populationAfter);
      SpreadsheetApp.flush();

      const contextAfter = stateContext_(op.country, rowInfo);
      const result = {
        requestId: op.requestId,
        populationBefore,
        populationAfter,
        humanResourceBefore: contextBefore.humanResource,
        humanResourceAfter: contextAfter.humanResource,
        stateName: contextAfter.stateName
      };
      results.push(result);
      logRows.push([
        op.requestId,
        String(operations[0].requestId || ""),
        op.kind,
        op.country,
        contextAfter.stateName,
        op.armyId,
        op.armyName,
        op.cityId,
        op.cityName,
        op.hp,
        op.ratePerHp,
        op.amount,
        Math.round(op.amount * 1000),
        populationBefore,
        populationAfter,
        contextBefore.humanResource,
        contextAfter.humanResource,
        op.actorPlayerId,
        op.turnNumber,
        new Date().toISOString(),
        "APPLIED"
      ]);
    }

    if (logRows.length > 0) {
      const startRow = log.getLastRow() + 1;
      log.getRange(startRow, 1, logRows.length, LR_LOG_HEADERS.length).setValues(logRows);
    }

    SpreadsheetApp.flush();
    const states = [...new Set(normalized.map(function(entry) { return entry.op.country; }))].map(function(country) {
      return snapshotForCountry_(country, index);
    });
    return { operations: results, states };
  } catch (error) {
    for (const [row, oldPopulation] of touched.entries()) {
      backend.getRange(row, 3).setValue(oldPopulation);
    }
    SpreadsheetApp.flush();
    throw error;
  }
}

function syncState_(event) {
  if (!event || typeof event !== "object") throw new Error("INVALID_SYNC_EVENT");
  const states = Array.isArray(event.states) ? event.states : [];
  const armies = Array.isArray(event.armies) ? event.armies : [];
  const removed = Array.isArray(event.removedArmyIds) ? event.removedArmyIds.map(String) : [];

  const backend = backendSheet_();
  const index = backendIndex_();

  // Full validation before the first sheet mutation.
  for (const state of states) {
    const country = String(state.country || "").trim();
    const ships = Number(state.ships);
    if (!country || !index.has(country) || !Number.isInteger(ships) || ships < 0) {
      throw new Error("INVALID_SHIP_SYNC");
    }
  }

  const armyIds = new Set();
  for (const army of armies) {
    const armyId = String(army.armyId || "").trim();
    const stateId = army.stateId == null ? "" : String(army.stateId);
    const country = army.country == null ? "" : String(army.country);
    const hp = Number(army.hp);
    const maxHp = Number(army.maxHp);
    if (!armyId || armyIds.has(armyId) || !Number.isInteger(hp) || hp < 0 ||
        !Number.isInteger(maxHp) || maxHp < 0 || hp > maxHp) {
      throw new Error("INVALID_ARMY_SYNC");
    }
    armyIds.add(armyId);
    if (country && !index.has(country)) throw new Error("COUNTRY_NOT_FOUND:" + country);
  }
  if (armies.some(function(army) { return removed.indexOf(String(army.armyId)) >= 0; })) {
    throw new Error("ARMY_SYNC_CONFLICT");
  }

  const spreadsheet = openSpreadsheet_();
  const existingArmySheet = spreadsheet.getSheetByName(WRITEBACK_CONFIG.ARMIES_SHEET);
  let sheetWasCreated = false;
  let sheet;
  let beforeArmyValues = [];
  let beforeArmyLastRow = 1;

  if (existingArmySheet) {
    const header = existingArmySheet.getRange(1, 1, 1, ARMY_HEADERS.length).getValues()[0];
    if (header.join("\u001f") !== ARMY_HEADERS.join("\u001f")) {
      throw new Error("ARMIES_SHEET_HEADER_INVALID");
    }
    sheet = existingArmySheet;
    beforeArmyLastRow = sheet.getLastRow();
    if (beforeArmyLastRow >= 2) {
      beforeArmyValues = sheet.getRange(2, 1, beforeArmyLastRow - 1, ARMY_HEADERS.length).getValues();
    }
  } else {
    sheet = spreadsheet.insertSheet(WRITEBACK_CONFIG.ARMIES_SHEET);
    sheet.getRange(1, 1, 1, ARMY_HEADERS.length).setValues([ARMY_HEADERS]);
    sheetWasCreated = true;
  }

  const oldShipValues = new Map();
  for (const state of states) {
    const rowInfo = index.get(String(state.country).trim());
    oldShipValues.set(rowInfo.row, backend.getRange(rowInfo.row, 8).getValue());
  }

  try {
    for (const state of states) {
      const rowInfo = index.get(String(state.country).trim());
      backend.getRange(rowInfo.row, 8).setValue(Number(state.ships));
    }

    const lastRow = sheet.getLastRow();
    const values = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, ARMY_HEADERS.length).getValues() : [];
    const rowByArmy = new Map();
    for (let i = 0; i < values.length; i++) {
      const id = String(values[i][0] || "").trim();
      if (id) rowByArmy.set(id, i + 2);
    }

    for (const army of armies) {
      const row = rowByArmy.get(String(army.armyId));
      const valuesToWrite = [[
        String(army.armyId),
        army.stateId == null ? "" : String(army.stateId),
        army.country == null ? "" : String(army.country),
        Number(army.hp),
        Number(army.maxHp)
      ]];
      if (row) {
        sheet.getRange(row, 1, 1, ARMY_HEADERS.length).setValues(valuesToWrite);
      } else {
        sheet.getRange(sheet.getLastRow() + 1, 1, 1, ARMY_HEADERS.length).setValues(valuesToWrite);
      }
    }

    const rowsToDelete = [];
    for (const armyId of removed) {
      const row = rowByArmy.get(armyId);
      if (row) rowsToDelete.push(row);
    }
    rowsToDelete.sort(function(a, b) { return b - a; });
    for (const row of rowsToDelete) sheet.deleteRow(row);

    SpreadsheetApp.flush();
  } catch (error) {
    for (const [row, oldValue] of oldShipValues.entries()) {
      backend.getRange(row, 8).setValue(oldValue);
    }

    if (sheetWasCreated) {
      spreadsheet.deleteSheet(sheet);
    } else {
      const currentLastRow = sheet.getLastRow();
      if (currentLastRow >= 2) {
        sheet.getRange(2, 1, currentLastRow - 1, ARMY_HEADERS.length).clearContent();
      }
      if (beforeArmyValues.length > 0) {
        sheet.getRange(2, 1, beforeArmyValues.length, ARMY_HEADERS.length).setValues(beforeArmyValues);
      }
      // Deleted rows do not need physical removal for correctness; clearContent
      // above restores the exact pre-operation data projection.
      void beforeArmyLastRow;
    }
    SpreadsheetApp.flush();
    throw error;
  }
}

function json_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function errorCode_(error) {
  if (error && error.message) return String(error.message).slice(0, 200);
  return String(error).slice(0, 200);
}
