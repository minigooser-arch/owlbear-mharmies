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
  FACTION_SHEET: "ФРАКЦИИ(РАЗРАБОТКА) [1910]",
  LR_LOG_SHEET: "ЛР_ОПЕРАЦИИ",
  ARMIES_SHEET: "АРМИИ",
  TOKEN_PROPERTY: "API_TOKEN"
});

const LR_LOG_HEADERS = [
  "requestId", "createdAt", "country", "stateId", "stateName", "kind",
  "hp", "ratePerHp", "amount", "amountPeople", "populationBefore",
  "populationAfter", "humanResourceBefore", "humanResourceAfter",
  "armyId", "armyName", "cityId", "cityName", "actorPlayerId",
  "turnNumber", "batchRequestId", "status"
];

const LR_EXTRA_HEADERS = [
  "operationType", "factionId", "factionName", "influenceDelta",
  "influenceBefore", "influenceAfter", "reasonCode"
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
      case "GET_FACTIONS":
        return json_({ ok: true, result: withScriptLock_(function() {
          return { factions: getFactionInfluenceSnapshots_(body.factions) };
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
      case "ADJUST_MILITARY_INFLUENCE_BATCH":
        return json_({ ok: true, result: withScriptLock_(function() {
          return adjustMilitaryInfluenceBatch_(body.operations);
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
  const required = LR_LOG_HEADERS.concat(LR_EXTRA_HEADERS);
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const header = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function(value) {
    return String(value || "").trim();
  });
  for (const name of required) {
    if (header.indexOf(name) < 0) {
      sheet.getRange(1, header.length + 1).setValue(name);
      header.push(name);
    }
  }
  return { sheet: sheet, headers: header };
}

function headerIndex_(headers) {
  const result = {};
  headers.forEach(function(name, index) { result[name] = index; });
  return result;
}

function cell_(row, indexes, name) {
  const index = indexes[name];
  return index === undefined ? "" : row[index];
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
  const humanResource = Number(sheet.getRange(stateRow, 41).getValue());
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
    "ДЕМИЛИТАРИЗОВАННАЯ НАЦИЯ": 0,
    "КОНТРАКТНАЯ СЛУЖБА": 0.02,
    "СРОЧНЫЙ ПРИЗЫВ": 0.04,
    "ЧАСТИЧНАЯ МОБИЛИЗАЦИЯ": 0.08,
    "МАССОВАЯ МОБИЛИЗАЦИЯ": 0.18,
    "ВСЕОБЩАЯ МОБИЛИЗАЦИЯ": 0.24,
    "ВСЕХ ПОД РУЖЬЁ!": 0.24
  };
  return Object.prototype.hasOwnProperty.call(rates, normalized) ? rates[normalized] : undefined;
}

function snapshotForCountry_(country, index, spentByCountry) {
  const backendRow = index.get(country);
  if (!backendRow) throw new Error("COUNTRY_NOT_FOUND:" + country);
  const context = stateContext_(country, backendRow);
  return {
    country,
    population: Number(backendSheet_().getRange(backendRow.row, 3).getValue()),
    humanResource: context.humanResource,
    humanResourceCapacity: context.humanResource + (spentByCountry ? (spentByCountry.get(country) || 0) : 0),
    ...(context.conscriptionRate === undefined ? {} : { conscriptionRate: context.conscriptionRate })
  };
}

function getStateSnapshots_(countries) {
  if (!Array.isArray(countries)) throw new Error("INVALID_COUNTRIES");
  const index = backendIndex_();
  const spentByCountry = lrV2SpentByCountry_(lrLogSheet_());
  const unique = [...new Set(countries.map(function(country) {
    return String(country || "").trim();
  }).filter(Boolean))];
  return unique.map(function(country) {
    return snapshotForCountry_(country, index, spentByCountry);
  });
}

const LR_V2_REASON_CODE = "LR_V2";

/** Read only new confirmed army expenses; earlier APPLIED rows do not count. */
function lrV2SpentByCountry_(schema) {
  const spent = new Map();
  const lastRow = schema.sheet.getLastRow();
  if (lastRow < 2) return spent;
  const idx = headerIndex_(schema.headers);
  const rows = schema.sheet.getRange(2, 1, lastRow - 1, schema.headers.length).getValues();
  for (const row of rows) {
    if (String(cell_(row, idx, "operationType")).trim() !== "LR" ||
      String(cell_(row, idx, "status")).trim() !== "APPLIED" ||
      String(cell_(row, idx, "reasonCode")).trim() !== LR_V2_REASON_CODE) continue;
    const country = String(cell_(row, idx, "country") || "").trim();
    const amount = Number(cell_(row, idx, "amount"));
    if (!country || !Number.isFinite(amount) || amount <= 0) throw new Error("LR_V2_LEDGER_INVALID");
    spent.set(country, (spent.get(country) || 0) + amount);
  }
  return spent;
}

/**
 * One-time migration: preserves the ORIGINAL AO formula and subtracts only
 * LR_V2 operations. Install in the same bound Apps Script project as growth.
 * Safe to rerun: migrated formulas are skipped.
 */
function installLrV2Formulas() {
  return withScriptLock_(function() {
    const index = backendIndex_();
    const sheet = stateSheet_();
    lrLogSheet_(); // Check or extend the schema before writing formulas.
    for (const [country, entry] of index.entries()) {
      const cell = sheet.getRange(entry.stateRow, 41);
      const oldFormula = cell.getFormula();
      if (oldFormula.indexOf('LR_V2') >= 0) continue;
      if (!oldFormula || oldFormula[0] !== "=") throw new Error("LR_V2_SOURCE_FORMULA_MISSING:" + country);
      const safeCountry = country.replace(/"/g, '""');
      const r = "'ЛР_ОПЕРАЦИИ'!";
      const spent = 'SUMIFS(' + r + '$I$2:$I;' + r + '$C$2:$C;"' + safeCountry +
        '";' + r + '$V$2:$V;"APPLIED";' + r + '$W$2:$W;"LR";' +
        r + '$AC$2:$AC;"LR_V2")';
      cell.setFormula('=MAX(0;(' + oldFormula.slice(1) + ')-' + spent + ')');
    }
    SpreadsheetApp.flush();
    for (const country of index.keys()) {
      const value = Number(stateSheet_().getRange(index.get(country).stateRow, 41).getValue());
      if (!Number.isFinite(value) || value < 0) throw new Error("LR_V2_MIGRATED_FORMULA_INVALID:" + country);
    }
    PropertiesService.getScriptProperties().setProperty("LR_V2_ENABLED", "true");
  });
}

/** Google time triggers are approximate, not exactly 01:00:00. */
function installDailySheetSyncTrigger() {
  const handler = "dailySheetSyncAtOneMsk";
  for (const trigger of ScriptApp.getProjectTriggers()) {
    if (trigger.getHandlerFunction() === handler) ScriptApp.deleteTrigger(trigger);
  }
  ScriptApp.newTrigger(handler).timeBased().atHour(1).nearMinute(0).everyDays(1)
    .inTimezone("Europe/Moscow").create();
}

/** Independent sheet health/check job; scene HP/ships require a live GM. */
function dailySheetSyncAtOneMsk() {
  return withScriptLock_(function() {
    if (PropertiesService.getScriptProperties().getProperty("LR_V2_ENABLED") !== "true") return;
    const index = backendIndex_();
    const spent = lrV2SpentByCountry_(lrLogSheet_());
    for (const country of index.keys()) snapshotForCountry_(country, index, spent);
    SpreadsheetApp.flush();
    PropertiesService.getScriptProperties().setProperty(
      "LR_V2_LAST_SHEET_CHECK_MSK",
      Utilities.formatDate(new Date(), "Europe/Moscow", "yyyy-MM-dd'T'HH:mm:ss")
    );
  });
}

function existingLRRequests_(schema) {
  const result = new Map();
  const indexes = headerIndex_(schema.headers);
  const lastRow = schema.sheet.getLastRow();
  if (lastRow < 2) return result;
  const values = schema.sheet.getRange(2, 1, lastRow - 1, schema.headers.length).getValues();
  for (const row of values) {
    const operationType = String(cell_(row, indexes, "operationType") || "LR").trim();
    if (operationType && operationType !== "LR") continue;
    const requestId = String(cell_(row, indexes, "requestId") || "").trim();
    if (!requestId) continue;
    result.set(requestId, {
      requestId,
      reasonCode: String(cell_(row, indexes, "reasonCode") || ""),
      status: String(cell_(row, indexes, "status") || ""),
      batchRequestId: String(cell_(row, indexes, "batchRequestId") || ""),
      kind: String(cell_(row, indexes, "kind") || ""),
      country: String(cell_(row, indexes, "country") || ""),
      stateName: String(cell_(row, indexes, "stateName") || ""),
      armyId: String(cell_(row, indexes, "armyId") || ""),
      armyName: String(cell_(row, indexes, "armyName") || ""),
      cityId: String(cell_(row, indexes, "cityId") || ""),
      cityName: String(cell_(row, indexes, "cityName") || ""),
      hp: Number(cell_(row, indexes, "hp")),
      ratePerHp: Number(cell_(row, indexes, "ratePerHp")),
      amount: Number(cell_(row, indexes, "amount")),
      actorPlayerId: String(cell_(row, indexes, "actorPlayerId") || ""),
      turnNumber: Number(cell_(row, indexes, "turnNumber")),
      populationBefore: Number(cell_(row, indexes, "populationBefore")),
      populationAfter: Number(cell_(row, indexes, "populationAfter")),
      humanResourceBefore: Number(cell_(row, indexes, "humanResourceBefore")),
      humanResourceAfter: Number(cell_(row, indexes, "humanResourceAfter"))
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
    existing.armyName === operation.armyName &&
    existing.cityId === operation.cityId &&
    existing.cityName === operation.cityName &&
    existing.actorPlayerId === operation.actorPlayerId &&
    existing.turnNumber === operation.turnNumber &&
    existing.hp === operation.hp &&
    Math.abs(existing.ratePerHp - operation.ratePerHp) <= 1e-9 &&
    Math.abs(existing.amount - operation.amount) <= 1e-9;
}

function halfUp_(value) {
  return Math.floor(value + 0.5);
}

function spendLRBatch_(operations, batchRequestId) {
  if (PropertiesService.getScriptProperties().getProperty("LR_V2_ENABLED") !== "true") throw new Error("LR_V2_NOT_ENABLED");
  if (!Array.isArray(operations) || operations.length === 0 || operations.length > 64) throw new Error("INVALID_SPEND_BATCH");
  const schema = lrLogSheet_();
  const index = backendIndex_();
  const existing = existingLRRequests_(schema);
  const normalized = [];
  const seen = new Set();
  for (const raw of operations) {
    const op = validateSpendOperation_(raw, index);
    if (seen.has(op.requestId)) throw new Error("DUPLICATE_BATCH_REQUEST_ID:" + op.requestId);
    seen.add(op.requestId);
    const old = existing.get(op.requestId);
    if (old) {
      if (old.reasonCode !== "LR_V2" || old.status !== "APPLIED" || !sameDuplicateRequest_(old, op)) throw new Error("REQUEST_ID_CONFLICT:" + op.requestId);
      normalized.push({ op, duplicate: old });
    } else normalized.push({ op, duplicate: null });
  }
  const reservations = new Map();
  const results = normalized.filter(function(item) { return item.duplicate !== null; }).map(function(item) { return item.duplicate; });
  const records = [];
  for (const item of normalized) {
    if (item.duplicate) continue;
    const op = item.op;
    const info = index.get(op.country);
    const population = Number(backendSheet_().getRange(info.row, 3).getValue());
    if (!Number.isFinite(population) || population < 0) throw new Error("POPULATION_INVALID:" + op.country);
    const context = stateContext_(op.country, info);
    const available = context.humanResource - (reservations.get(op.country) || 0);
    if (available + 1e-9 < op.amount) throw new Error("INSUFFICIENT_LR:" + op.requestId);
    const after = Math.max(0, available - op.amount);
    reservations.set(op.country, (reservations.get(op.country) || 0) + op.amount);
    results.push({ requestId: op.requestId, populationBefore: population, populationAfter: population,
      humanResourceBefore: available, humanResourceAfter: after, stateName: context.stateName });
    records.push({ operationType: "LR", reasonCode: "LR_V2",
      requestId: op.requestId, createdAt: new Date().toISOString(), country: op.country,
      stateId: "", stateName: context.stateName, kind: op.kind, hp: op.hp, ratePerHp: op.ratePerHp,
      amount: op.amount, amountPeople: Math.round(op.amount * 1000), populationBefore: population,
      populationAfter: population, humanResourceBefore: available, humanResourceAfter: after,
      armyId: op.armyId, armyName: op.armyName, cityId: op.cityId, cityName: op.cityName,
      actorPlayerId: op.actorPlayerId, turnNumber: op.turnNumber,
      batchRequestId: String(batchRequestId || ""), status: "APPLIED" });
  }
  // Under ScriptLock, validate the whole batch, then append it. Never write backend!C.
  if (records.length > 0) {
    const startRow = schema.sheet.getLastRow() + 1;
    const rows = records.map(function(record) { return schema.headers.map(function(name) {
      return record[name] === undefined || record[name] === null ? "" : record[name];
    }); });
    schema.sheet.getRange(startRow, 1, rows.length, schema.headers.length).setValues(rows);
    SpreadsheetApp.flush();
  }
  const spentByCountry = lrV2SpentByCountry_(schema);
  const states = [...new Set(normalized.map(function(item) { return item.op.country; }))].map(function(country) {
    return snapshotForCountry_(country, index, spentByCountry);
  });
  return { operations: results, states: states };
}

function normalizeKey_(value) {
  return String(value == null ? "" : value).normalize("NFKC").replace(/[\\u00A0\\u2007\\u202F]/g, " ")
    .trim().toLocaleLowerCase("ru-RU").replace(/\\s+/g, " ");
}

function factionSheet_() {
  const sheet = openSpreadsheet_().getSheetByName(WRITEBACK_CONFIG.FACTION_SHEET);
  if (!sheet) throw new Error("FACTION_SHEET_MISSING");
  return sheet;
}

function factionRows_() {
  const sheet = factionSheet_();
  if (!String(sheet.getRange(4, 53).getValue() || "").trim()) sheet.getRange(4, 53).setValue("factionId");
  if (!String(sheet.getRange(4, 54).getValue() || "").trim()) sheet.getRange(4, 54).setValue("country");
  const count = Math.max(sheet.getLastRow() - 6, 1);
  const names = sheet.getRange(7, 11, count, 1).getDisplayValues();
  const ids = sheet.getRange(7, 53, count, 1).getValues();
  const countries = sheet.getRange(7, 54, count, 1).getValues();
  const rows = [];
  for (let i = 0; i < count; i++) {
    const name = String(names[i][0] || "").trim();
    if (name) rows.push({ row: i + 7, name, id: String(ids[i][0] || "").trim(), country: String(countries[i][0] || "").trim() });
  }
  return rows;
}

function resolveFactionTarget_(input, rows) {
  const factionId = String(input.factionId || "").trim();
  const factionName = String(input.factionName || "").trim();
  const country = String(input.country || "").trim();
  if (!factionId || !factionName || !country) throw new Error("INVALID_FACTION_IDENTITY");
  let matches = rows.filter(function(row) { return row.id === factionId; });
  if (matches.length === 0) {
    matches = rows.filter(function(row) {
      return normalizeKey_(row.name) === normalizeKey_(factionName) &&
        (!row.country || normalizeKey_(row.country) === normalizeKey_(country));
    });
  }
  if (matches.length !== 1) throw new Error(matches.length === 0 ? "FACTION_NOT_FOUND:" + factionName : "FACTION_AMBIGUOUS:" + factionName);
  return matches[0];
}

function applyFactionAndStateArmy_(event, index) {
  const factions = Array.isArray(event.factions) ? event.factions : [];
  const stateArmies = Array.isArray(event.stateArmies) ? event.stateArmies : [];
  if (factions.length === 0 && stateArmies.length === 0) return;
  const sheet = factionSheet_();
  const rows = factionRows_();
  const targets = [];
  const seenFactions = new Set();
  for (const faction of factions) {
    const factionId = String(faction.factionId || "").trim();
    const factionName = String(faction.factionName || "").trim();
    const country = String(faction.country || "").trim();
    const hp = Number(faction.hp);
    const maxHp = Number(faction.maxHp);
    if (!factionId || !factionName || !country || !Number.isInteger(hp) || hp < 0 ||
        !Number.isInteger(maxHp) || maxHp < 0 || hp > maxHp || seenFactions.has(factionId)) {
      throw new Error("INVALID_FACTION_SYNC");
    }
    if (!index.has(country)) throw new Error("COUNTRY_NOT_FOUND:" + country);
    const target = resolveFactionTarget_({ factionId, factionName, country }, rows);
    targets.push({ target, factionId, country, hp });
    seenFactions.add(factionId);
  }
  const stateTargets = [];
  const seenCountries = new Set();
  for (const state of stateArmies) {
    const country = String(state.country || "").trim();
    const hp = Number(state.hp);
    const maxHp = Number(state.maxHp);
    if (!country || !index.has(country) || !Number.isInteger(hp) || hp < 0 ||
        !Number.isInteger(maxHp) || maxHp < 0 || hp > maxHp || seenCountries.has(country)) {
      throw new Error("INVALID_STATE_ARMY_SYNC");
    }
    stateTargets.push({ country, hp, row: index.get(country).stateRow });
    seenCountries.add(country);
  }
  const oldFaction = targets.map(function(entry) {
    return { row: entry.target.row, id: sheet.getRange(entry.target.row, 53).getValue(),
      country: sheet.getRange(entry.target.row, 54).getValue(), hp: sheet.getRange(entry.target.row, 45).getValue() };
  });
  const stateSheet = stateSheet_();
  const oldState = stateTargets.map(function(entry) {
    const cell = stateSheet.getRange(entry.row, 40);
    return { row: entry.row, formula: cell.getFormula(), value: cell.getValue() };
  });
  try {
    for (const entry of targets) {
      sheet.getRange(entry.target.row, 53, 1, 2).setValues([[entry.factionId, entry.country]]);
      sheet.getRange(entry.target.row, 45).setValue(entry.hp);
    }
    for (const entry of stateTargets) stateSheet.getRange(entry.row, 40).setValue(entry.hp);
    SpreadsheetApp.flush();
  } catch (error) {
    for (const entry of oldFaction) {
      sheet.getRange(entry.row, 53, 1, 2).setValues([[entry.id, entry.country]]);
      sheet.getRange(entry.row, 45).setValue(entry.hp);
    }
    for (const entry of oldState) {
      const cell = stateSheet.getRange(entry.row, 40);
      if (entry.formula) cell.setFormula(entry.formula); else cell.setValue(entry.value);
    }
    SpreadsheetApp.flush();
    throw error;
  }
}

const MILITARY_INFLUENCE_DELTAS = {
  LAND_BATTLE_VICTORY: 4, NAVAL_BATTLE_VICTORY: 4, DESTROY_ENEMY_ARMY: 3,
  DESTROY_ENEMY_SHIP: 3, SUCCESSFUL_CITY_DEFENSE: 3, SUCCESSFUL_CITY_OCCUPATION: 3,
  SHIP_TRANSFER: -15, MILITARY_UPGRADE_I: -20, APPOINT_COMMANDER_IN_CHIEF: -30,
  MILITARY_UPGRADE_II: -30, MILITARY_UPGRADE_III: -50
};

function existingMilitaryRequests_(schema) {
  const result = new Map();
  const indexes = headerIndex_(schema.headers);
  const lastRow = schema.sheet.getLastRow();
  if (lastRow < 2) return result;
  const values = schema.sheet.getRange(2, 1, lastRow - 1, schema.headers.length).getValues();
  for (const row of values) {
    if (String(cell_(row, indexes, "operationType") || "").trim() !== "MILITARY_INFLUENCE") continue;
    const requestId = String(cell_(row, indexes, "requestId") || "").trim();
    if (!requestId) continue;
    result.set(requestId, { requestId, factionId: String(cell_(row, indexes, "factionId") || ""),
      factionName: String(cell_(row, indexes, "factionName") || ""),
      country: String(cell_(row, indexes, "country") || ""),
      reasonCode: String(cell_(row, indexes, "reasonCode") || ""),
      delta: Number(cell_(row, indexes, "influenceDelta")),
      balanceBefore: Number(cell_(row, indexes, "influenceBefore")),
      balanceAfter: Number(cell_(row, indexes, "influenceAfter")) });
  }
  return result;
}

function sameMilitaryRequest_(old, op) {
  return old.factionId === op.factionId && old.factionName === op.factionName &&
    old.country === op.country && old.reasonCode === op.reasonCode && old.delta === op.delta;
}

function adjustMilitaryInfluenceBatch_(operations) {
  if (!Array.isArray(operations) || operations.length === 0 || operations.length > 64) throw new Error("INVALID_MILITARY_INFLUENCE_BATCH");
  const schema = lrLogSheet_();
  const index = backendIndex_();
  const rows = factionRows_();
  const existing = existingMilitaryRequests_(schema);
  const normalized = [];
  const seen = new Set();
  for (const raw of operations) {
    const requestId = String(raw && raw.requestId || "").trim();
    const reasonCode = String(raw && raw.reasonCode || "").trim();
    const delta = Number(raw && raw.delta);
    const expected = MILITARY_INFLUENCE_DELTAS[reasonCode];
    if (!requestId || expected === undefined || delta !== expected) throw new Error("INVALID_MILITARY_INFLUENCE_OPERATION");
    const op = { requestId, factionId: String(raw.factionId || "").trim(), factionName: String(raw.factionName || "").trim(),
      country: String(raw.country || "").trim(), reasonCode, delta,
      actorPlayerId: String(raw.actorPlayerId || ""), turnNumber: Number(raw.turnNumber || 0),
      cityId: raw.cityId == null ? "" : String(raw.cityId), cityName: raw.cityName == null ? "" : String(raw.cityName) };
    if (!op.factionId || !op.factionName || !op.country || !index.has(op.country) || seen.has(requestId)) throw new Error("INVALID_MILITARY_INFLUENCE_OPERATION");
    seen.add(requestId);
    const old = existing.get(requestId);
    if (old) {
      if (!sameMilitaryRequest_(old, op)) throw new Error("REQUEST_ID_CONFLICT:" + requestId);
      normalized.push({ op, duplicate: old });
    } else normalized.push({ op, duplicate: null });
  }
  const sheet = factionSheet_();
  const targets = normalized.map(function(entry) { return { entry, target: resolveFactionTarget_(entry.op, rows) }; });
  const touched = new Map();
  const records = [];
  const results = normalized.filter(function(entry) { return entry.duplicate !== null; }).map(function(entry) { return entry.duplicate; });
  let startRow = 0;
  try {
    for (const item of targets) {
      if (item.entry.duplicate) continue;
      const op = item.entry.op;
      const row = item.target.row;
      const before = Number(sheet.getRange(row, 35).getValue());
      if (!Number.isInteger(before) || before < 0) throw new Error("MILITARY_INFLUENCE_BALANCE_INVALID:" + op.factionId);
      const after = before + op.delta;
      if (after < 0) throw new Error("INSUFFICIENT_MILITARY_INFLUENCE:" + op.requestId);
      if (!touched.has(row)) touched.set(row, before);
      sheet.getRange(row, 35).setValue(after);
      results.push({ requestId: op.requestId, factionId: op.factionId, balanceBefore: before, balanceAfter: after, delta: op.delta });
      records.push({ operationType: "MILITARY_INFLUENCE", requestId: op.requestId, createdAt: new Date().toISOString(),
        country: op.country, stateId: "", stateName: stateContext_(op.country, index.get(op.country)).stateName,
        kind: "MILITARY_INFLUENCE", cityId: op.cityId, cityName: op.cityName,
        actorPlayerId: op.actorPlayerId, turnNumber: op.turnNumber, status: "APPLIED",
        factionId: op.factionId, factionName: op.factionName, influenceDelta: op.delta,
        influenceBefore: before, influenceAfter: after, reasonCode: op.reasonCode });
    }
    if (records.length > 0) {
      const rowsToWrite = records.map(function(record) {
        return schema.headers.map(function(name) { return record[name] === undefined || record[name] === null ? "" : record[name]; });
      });
      startRow = schema.sheet.getLastRow() + 1;
      schema.sheet.getRange(startRow, 1, rowsToWrite.length, schema.headers.length).setValues(rowsToWrite);
    }
    SpreadsheetApp.flush();
    return { operations: results };
  } catch (error) {
    for (const [row, before] of touched.entries()) sheet.getRange(row, 35).setValue(before);
    if (startRow > 0) try { schema.sheet.deleteRows(startRow, records.length); } catch (rollbackError) { console.error(rollbackError); }
    SpreadsheetApp.flush();
    throw error;
  }
}

function syncState_(event) {
  if (!event || typeof event !== "object") throw new Error("INVALID_SYNC_EVENT");
  // Individual army state remains private to Owlbear. Aggregate faction/state
  // HP is public and is written to the existing ЖИЗНИ columns.
  const index = backendIndex_();
  applyFactionAndStateArmy_(event, index);
  const operations = Array.isArray(event.militaryInfluenceOperations)
    ? event.militaryInfluenceOperations
    : [];
  if (operations.length > 0) adjustMilitaryInfluenceBatch_(operations);
}

function getFactionInfluenceSnapshots_(factions) {
  if (!Array.isArray(factions)) throw new Error("INVALID_FACTIONS");
  const sheet = factionSheet_();
  const rows = factionRows_();
  const seen = new Set();
  return factions.map(function(raw) {
    const factionId = String(raw && raw.factionId || "").trim();
    const factionName = String(raw && raw.factionName || "").trim();
    const country = String(raw && raw.country || "").trim();
    if (!factionId || !factionName || !country || seen.has(factionId)) {
      throw new Error("INVALID_FACTION_IDENTITY");
    }
    const target = resolveFactionTarget_({ factionId, factionName, country }, rows);
    const militaryInfluence = Number(sheet.getRange(target.row, 35).getValue());
    if (!Number.isInteger(militaryInfluence) || militaryInfluence < 0) {
      throw new Error("MILITARY_INFLUENCE_BALANCE_INVALID:" + factionId);
    }
    seen.add(factionId);
    return { factionId, factionName, country, militaryInfluence };
  });
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

