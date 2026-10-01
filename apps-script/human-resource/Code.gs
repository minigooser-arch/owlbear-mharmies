const SPREADSHEET_ID_FALLBACK = '1wlTrvSxeoQDPKO0s9C0ooKF3xMqmTfcCDB70y-1X2QA';
const BACKEND_SHEET = 'backend';
const STATES_SHEET = 'ГОСУДАРСТВА [1910]';
const LOG_SHEET = 'ЛР_ОПЕРАЦИИ';
const STATES_POPULATION_COL = 16; // P
const STATES_LR_COL = 44; // AR (formula-derived current LR)
const STATES_LAW_COL = 41; // AO on the details row
const LOG_HEADERS = [
  'requestId', 'createdAt', 'country', 'stateId', 'stateName', 'kind', 'hp',
  'ratePerHp', 'amount', 'amountPeople', 'populationBefore', 'populationAfter',
  'humanResourceBefore', 'humanResourceAfter', 'armyId', 'armyName', 'cityId',
  'cityName', 'actorPlayerId', 'turnNumber', 'batchRequestId', 'status'
];

function doGet(e) {
  try {
    const token = e && e.parameter ? e.parameter.token : '';
    authorize_(token);
    return json_(withLock_(function () {
      ensureDailyPopulationGrowth_();
      return { ok: true, action: 'snapshot', states: snapshot_(), appliedAt: new Date().toISOString() };
    }));
  } catch (error) {
    return json_(errorResponse_(error));
  }
}

function doPost(e) {
  try {
    const body = parseBody_(e);
    authorize_(body.token);
    const action = String(body.action || '');
    if (action === 'snapshot') {
      return json_(withLock_(function () {
        ensureDailyPopulationGrowth_();
        return { ok: true, action: action, states: snapshot_(), appliedAt: new Date().toISOString() };
      }));
    }
    if (action === 'spendLRBatch') {
      return json_(withLock_(function () { return spendLRBatch_(body); }));
    }
    if (action === 'refundLRBatch') {
      return json_(withLock_(function () { return refundLRBatch_(body); }));
    }
    throw new Error('UNKNOWN_ACTION');
  } catch (error) {
    return json_(errorResponse_(error));
  }
}

function initializeGateway() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SPREADSHEET_ID')) props.setProperty('SPREADSHEET_ID', SPREADSHEET_ID_FALLBACK);
  if (!props.getProperty('API_TOKEN')) throw new Error('Set Script Property API_TOKEN before initializing the gateway.');

  const sheet = spreadsheet_();
  ensureLogSheet_();

  props.setProperty('GROWTH_MIGRATION_PENDING', 'true');
  props.deleteProperty('LAST_GROWTH_DATE');

  ScriptApp.getProjectTriggers()
    .filter(function (trigger) {
      return trigger.getHandlerFunction() === 'runDailyPopulationGrowth';
    })
    .forEach(function (trigger) { ScriptApp.deleteTrigger(trigger); });

  ScriptApp.newTrigger('runDailyPopulationGrowth')
    .timeBased()
    .everyMinutes(1)
    .create();

  return 'Gateway initialized. Disable the old population-growth trigger before using this project.';
}

function confirmCurrentGrowthBaseline() {
  return withLock_(function () {
    const props = PropertiesService.getScriptProperties();
    const ss = spreadsheet_();
    const timezone = ss.getSpreadsheetTimeZone() || 'Europe/Moscow';
    const local = localParts_(new Date(), timezone);
    props.setProperty(
      'LAST_GROWTH_DATE',
      local.hour === 0 && local.minute < 6 ? previousDate_(local.date) : local.date
    );
    props.deleteProperty('GROWTH_MIGRATION_PENDING');
    return 'Growth baseline confirmed for ' + props.getProperty('LAST_GROWTH_DATE') + '.';
  });
}

function runDailyPopulationGrowth() {
  withLock_(function () {
    ensureDailyPopulationGrowth_();
  });
}

function spendLRBatch_(body) {
  ensureDailyPopulationGrowth_();

  const requestId = requireString_(body.requestId, 'REQUEST_ID_REQUIRED');
  const operations = normalizeOperations_(body.operations);
  if (operations.length === 0) throw new Error('EMPTY_LR_BATCH');

  const existing = findBatchRows_(requestId, 'SPENT');
  if (existing.length > 0) {
    return {
      ok: true,
      requestId: requestId,
      states: snapshot_(),
      operations: existing,
      appliedAt: existing[0].createdAt
    };
  }

  const index = countryIndex_();
  const totals = {};
  operations.forEach(function (operation) {
    totals[operation.country] = (totals[operation.country] || 0) + operation.amount;
  });

  Object.keys(totals).forEach(function (country) {
    const entry = index[country];
    if (!entry) throw new Error('COUNTRY_NOT_FOUND:' + country);
    if (entry.humanResource + 1e-9 < totals[country]) {
      throw new InsufficientResourceError(snapshot_());
    }
    if (entry.population + 1e-9 < totals[country]) {
      throw new Error('INSUFFICIENT_POPULATION:' + country);
    }
  });

  const appliedAt = new Date().toISOString();
  const running = {};
  const changed = [];
  const backend = spreadsheet_().getSheetByName(BACKEND_SHEET);

  try {
    Object.keys(totals).forEach(function (country) {
      const entry = index[country];
      const beforePopulation = entry.population;
      const afterPopulation = beforePopulation - totals[country];
      backend.getRange(entry.backendRow, 3).setValue(afterPopulation);
      changed.push({
        row: entry.backendRow,
        before: beforePopulation,
        after: afterPopulation
      });
    });

    SpreadsheetApp.flush();

    const refreshed = countryIndex_();
    const appliedOperations = operations.map(function (operation) {
      const entryBefore = index[operation.country];
      const entryAfter = refreshed[operation.country];
      const before = running[operation.country] === undefined
        ? entryBefore.humanResource
        : running[operation.country];
      const after = entryAfter.humanResource;
      running[operation.country] = after;
      return {
        ...operation,
        requestId: requestId,
        createdAt: appliedAt,
        populationBefore: entryBefore.population,
        populationAfter: entryAfter.population,
        humanResourceBefore: before,
        humanResourceAfter: after
      };
    });

    appendLogRows_(appliedOperations.map(operationLogRow_));
    return {
      ok: true,
      requestId: requestId,
      states: snapshot_(),
      operations: appliedOperations,
      appliedAt: appliedAt
    };
  } catch (error) {
    changed.reverse().forEach(function (write) {
      backend.getRange(write.row, 3).setValue(write.before);
    });
    SpreadsheetApp.flush();
    throw error;
  }
}

function refundLRBatch_(body) {
  ensureDailyPopulationGrowth_();

  const refundRequestId = requireString_(body.requestId, 'REQUEST_ID_REQUIRED');
  const originalRequestId = requireString_(body.originalRequestId, 'ORIGINAL_REQUEST_ID_REQUIRED');

  const existingRefund = findRefundRowsByRequestId_(refundRequestId);
  if (existingRefund.length > 0) {
    return {
      ok: true,
      requestId: refundRequestId,
      states: snapshot_(),
      operations: existingRefund,
      appliedAt: existingRefund[0].createdAt
    };
  }

  const spent = findBatchRows_(originalRequestId, 'SPENT');
  if (spent.length === 0) throw new Error('ORIGINAL_LR_BATCH_NOT_FOUND');
  const alreadyRefunded = findBatchRows_(originalRequestId, 'REFUNDED');
  if (alreadyRefunded.length > 0) {
    return {
      ok: true,
      requestId: refundRequestId,
      states: snapshot_(),
      operations: alreadyRefunded,
      appliedAt: alreadyRefunded[0].createdAt
    };
  }

  const index = countryIndex_();
  const refundTotals = {};
  spent.forEach(function (operation) {
    refundTotals[operation.country] = (refundTotals[operation.country] || 0) + Number(operation.amount || 0);
  });

  Object.keys(refundTotals).forEach(function (country) {
    if (!index[country]) throw new Error('COUNTRY_NOT_FOUND:' + country);
  });

  const backend = spreadsheet_().getSheetByName(BACKEND_SHEET);
  const changed = [];
  const appliedAt = new Date().toISOString();

  try {
    Object.keys(refundTotals).forEach(function (country) {
      const entry = index[country];
      const before = entry.population;
      const after = before + refundTotals[country];
      backend.getRange(entry.backendRow, 3).setValue(after);
      changed.push({
        row: entry.backendRow,
        before: before,
        after: after
      });
    });

    SpreadsheetApp.flush();

    const refreshed = countryIndex_();
    const logRows = spent.map(function (operation, indexNumber) {
      const entry = refreshed[operation.country];
      return {
        requestId: refundRequestId + ':' + indexNumber,
        createdAt: appliedAt,
        country: operation.country,
        stateId: operation.stateId,
        stateName: operation.stateName,
        kind: 'REFUND',
        hp: operation.hp,
        ratePerHp: operation.ratePerHp,
        amount: -Number(operation.amount),
        populationBefore: operation.populationBefore,
        populationAfter: entry.population,
        humanResourceBefore: operation.humanResourceBefore,
        humanResourceAfter: entry.humanResource,
        armyId: operation.armyId,
        armyName: operation.armyName,
        cityId: operation.cityId,
        cityName: operation.cityName,
        actorPlayerId: 'SYSTEM:REFUND',
        turnNumber: operation.turnNumber,
        batchRequestId: originalRequestId,
        status: 'REFUNDED'
      };
    });

    appendLogRows_(logRows.map(operationLogRow_));
    return {
      ok: true,
      requestId: refundRequestId,
      states: snapshot_(),
      operations: logRows,
      appliedAt: appliedAt
    };
  } catch (error) {
    changed.reverse().forEach(function (write) {
      backend.getRange(write.row, 3).setValue(write.before);
    });
    SpreadsheetApp.flush();
    throw error;
  }
}

function snapshot_() {
  const index = countryIndex_();
  return Object.keys(index).map(function (country) {
    return {
      country: country,
      population: index[country].population,
      humanResource: index[country].humanResource,
      humanResourceCapacity: index[country].humanResourceCapacity,
      conscriptionRate: index[country].conscriptionRate
    };
  });
}

function countryIndex_() {
  const ss = spreadsheet_();
  const backend = ss.getSheetByName(BACKEND_SHEET);
  const states = ss.getSheetByName(STATES_SHEET);
  if (!backend || !states) throw new Error('REQUIRED_SHEET_NOT_FOUND');

  const backendLastRow = backend.getLastRow();
  const backendValues = backend.getRange(1, 1, Math.max(backendLastRow, 1), 11).getValues();
  const stateLastRow = states.getLastRow();
  const populationFormulas = states.getRange(1, STATES_POPULATION_COL, Math.max(stateLastRow, 1), 1).getFormulas();
  const populationValues = states.getRange(1, STATES_POPULATION_COL, Math.max(stateLastRow, 1), 1).getValues();
  const lrValues = states.getRange(1, STATES_LR_COL, Math.max(stateLastRow, 1), 1).getValues();
  const lawValues = states.getRange(1, STATES_LAW_COL, Math.max(stateLastRow, 1) + 1, 1).getDisplayValues();
  const nameValues = states.getRange(1, 11, Math.max(stateLastRow, 1), 1).getDisplayValues();

  const index = {};
  for (let row = 1; row < backendValues.length; row += 1) {
    const country = String(backendValues[row][0] || '').trim();
    if (!country) continue;
    index[country.toLowerCase()] = {
      country: country,
      backendRow: row + 1,
      population: Number(backendValues[row][2]) || 0,
      humanResource: 0,
      humanResourceCapacity: 0,
      conscriptionRate: 0,
      stateRow: null,
      stateName: ''
    };
  }

  populationFormulas.forEach(function (formulaRow, indexRow) {
    const formula = String(formulaRow[0] || '').replace(/\$/g, '');
    const match = formula.match(/backend!C(\d+)/i);
    if (!match) return;
    const backendRow = Number(match[1]);
    const backendEntry = Object.keys(index).find(function (country) {
      return index[country].backendRow === backendRow;
    });
    if (!backendEntry) return;

    const population = Number(populationValues[indexRow][0]);
    const rate = conscriptionRate_(String(lawValues[indexRow + 1] ? lawValues[indexRow + 1][0] : ''));
    const humanResource = Number(lrValues[indexRow][0]);

    index[backendEntry].population = Number.isFinite(population) ? population : index[backendEntry].population;
    index[backendEntry].humanResource = Number.isFinite(humanResource) ? humanResource : 0;
    index[backendEntry].humanResourceCapacity = calculateHumanResourceCapacity_(index[backendEntry].population, rate);
    index[backendEntry].conscriptionRate = rate;
    index[backendEntry].stateRow = indexRow + 1;
    index[backendEntry].stateName = String(nameValues[indexRow][0] || '').trim();
  });

  return index;
}

function conscriptionRate_(value) {
  const text = String(value || '').toUpperCase();
  if (text.indexOf('ВСЕХ ПОД РУЖЬЁ') >= 0) return 0.24;
  if (text.indexOf('МАССОВАЯ МОБИЛИЗАЦИЯ') >= 0) return 0.18;
  if (text.indexOf('ЧАСТИЧНАЯ МОБИЛИЗАЦИЯ') >= 0) return 0.08;
  if (text.indexOf('СРОЧНЫЙ ПРИЗЫВ') >= 0) return 0.04;
  if (text.indexOf('КОНТРАКТНАЯ СЛУЖБА') >= 0) return 0.02;
  return 0;
}

function calculateHumanResourceCapacity_(population, rate) {
  if (!Number.isFinite(population) || population <= 0 || !Number.isFinite(rate) || rate <= 0) return 0;
  return Math.min(population, rate * population * Math.pow(4200 / population, 0.48));
}

function ensureDailyPopulationGrowth_() {
  const props = PropertiesService.getScriptProperties();
  const ss = spreadsheet_();
  const timezone = ss.getSpreadsheetTimeZone() || 'Europe/Moscow';
  const local = localParts_(new Date(), timezone);
  if (local.hour === 0 && local.minute < 6) return;
  if (props.getProperty('GROWTH_MIGRATION_PENDING') === 'true') {
    throw new Error('GROWTH_MIGRATION_PENDING');
  }
  if (props.getProperty('LAST_GROWTH_DATE') === local.date) return;

  const backend = ss.getSheetByName(BACKEND_SHEET);
  const lastRow = backend.getLastRow();
  if (lastRow < 2) {
    props.setProperty('LAST_GROWTH_DATE', local.date);
    return;
  }

  const values = backend.getRange(2, 1, lastRow - 1, 11).getValues();
  const nextPopulation = values.map(function (row) {
    const population = Number(row[2]) || 0;
    const growthRate = Number(row[10]);
    const factor = Number.isFinite(growthRate) && growthRate > 0 ? growthRate : 1;
    return [Math.floor(population * factor + 0.5)];
  });

  backend.getRange(2, 3, nextPopulation.length, 1).setValues(nextPopulation);
  SpreadsheetApp.flush();
  props.setProperty('LAST_GROWTH_DATE', local.date);
}

function ensureLogSheet_() {
  const ss = spreadsheet_();
  let sheet = ss.getSheetByName(LOG_SHEET);
  if (!sheet) sheet = ss.insertSheet(LOG_SHEET);
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]);
}

function appendLogRows_(rows) {
  if (!rows || rows.length === 0) return;
  const sheet = ensureLogSheet_();
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, LOG_HEADERS.length).setValues(rows);
}

function findBatchRows_(batchRequestId, status) {
  const sheet = ensureLogSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, LOG_HEADERS.length).getValues();
  return values
    .filter(function (row) {
      return String(row[20] || '') === batchRequestId && (!status || String(row[21] || '') === status);
    })
    .map(logRowToOperation_);
}

function findRefundRowsByRequestId_(refundRequestId) {
  const sheet = ensureLogSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, LOG_HEADERS.length).getValues();
  return values
    .filter(function (row) {
      return String(row[21] || '') === 'REFUNDED' &&
        String(row[0] || '').indexOf(String(refundRequestId) + ':') === 0;
    })
    .map(logRowToOperation_);
}

function logRowToOperation_(row) {
  return {
    requestId: String(row[0] || '') || undefined,
    createdAt: String(row[1] || '') || undefined,
    country: String(row[2] || ''),
    stateId: String(row[3] || '') || undefined,
    stateName: String(row[4] || '') || undefined,
    kind: String(row[5] || '') || undefined,
    hp: row[6] === '' ? undefined : Number(row[6]),
    ratePerHp: row[7] === '' ? undefined : Number(row[7]),
    amount: Math.abs(Number(row[8] || 0)),
    populationBefore: Number(row[10] || 0),
    populationAfter: Number(row[11] || 0),
    humanResourceBefore: Number(row[12] || 0),
    humanResourceAfter: Number(row[13] || 0),
    armyId: String(row[14] || '') || undefined,
    armyName: String(row[15] || '') || undefined,
    cityId: String(row[16] || '') || undefined,
    cityName: String(row[17] || '') || undefined,
    actorPlayerId: String(row[18] || '') || undefined,
    turnNumber: row[19] === '' ? undefined : Number(row[19]),
    batchRequestId: String(row[20] || '') || undefined,
    status: String(row[21] || '') || undefined
  };
}

function operationLogRow_(operation) {
  return [
    operation.requestId || '',
    operation.createdAt || '',
    operation.country || '',
    operation.stateId || '',
    operation.stateName || '',
    operation.kind || '',
    operation.hp === undefined || operation.hp === '' ? '' : operation.hp,
    operation.ratePerHp === undefined || operation.ratePerHp === '' ? '' : operation.ratePerHp,
    operation.amount,
    Number(operation.amount) * 1000,
    operation.populationBefore,
    operation.populationAfter,
    operation.humanResourceBefore,
    operation.humanResourceAfter,
    operation.armyId || '',
    operation.armyName || '',
    operation.cityId || '',
    operation.cityName || '',
    operation.actorPlayerId || '',
    operation.turnNumber === undefined || operation.turnNumber === '' ? '' : operation.turnNumber,
    operation.batchRequestId || operation.requestId || '',
    operation.status || 'SPENT'
  ];
}

function normalizeOperations_(raw) {
  if (!Array.isArray(raw)) throw new Error('OPERATIONS_REQUIRED');
  return raw.map(function (value) {
    if (!value || typeof value !== 'object') throw new Error('INVALID_LR_OPERATION');
    const country = requireString_(value.country, 'COUNTRY_REQUIRED').toLowerCase();
    const amount = Number(value.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('INVALID_LR_AMOUNT');
    return {
      country: country,
      amount: amount,
      expectedHumanResourceBefore: value.expectedHumanResourceBefore === undefined ? '' : Number(value.expectedHumanResourceBefore),
      kind: value.kind ? String(value.kind) : '',
      hp: value.hp === undefined ? '' : Number(value.hp),
      ratePerHp: value.ratePerHp === undefined ? '' : Number(value.ratePerHp),
      stateId: value.stateId ? String(value.stateId) : '',
      stateName: value.stateName ? String(value.stateName) : '',
      armyId: value.armyId ? String(value.armyId) : '',
      armyName: value.armyName ? String(value.armyName) : '',
      cityId: value.cityId == null ? '' : String(value.cityId),
      cityName: value.cityName == null ? '' : String(value.cityName),
      actorPlayerId: value.actorPlayerId ? String(value.actorPlayerId) : '',
      turnNumber: value.turnNumber === undefined ? '' : Number(value.turnNumber),
      requestId: value.requestId ? String(value.requestId) : ''
    };
  });
}

function parseBody_(event) {
  if (!event || !event.postData || !event.postData.contents) throw new Error('EMPTY_REQUEST');
  try {
    return JSON.parse(event.postData.contents);
  } catch (error) {
    throw new Error('INVALID_JSON');
  }
}

function authorize_(token) {
  const expected = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  if (!expected) throw new Error('API_TOKEN_NOT_CONFIGURED');
  if (String(token || '') !== expected) throw new Error('UNAUTHORIZED');
}

function spreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || SPREADSHEET_ID_FALLBACK;
  return SpreadsheetApp.openById(id);
}

function withLock_(callback) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function localParts_(date, timezone) {
  const parts = Object.fromEntries(
    Utilities.formatDate(date, timezone, 'yyyy-MM-dd-HH-mm').split('-').map(function (value, index) {
      return [index, value];
    })
  );
  return {
    date: Utilities.formatDate(date, timezone, 'yyyy-MM-dd'),
    hour: Number(Utilities.formatDate(date, timezone, 'HH')),
    minute: Number(Utilities.formatDate(date, timezone, 'mm'))
  };
}

function previousDate_(date) {
  const parsed = new Date(date + 'T12:00:00Z');
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return Utilities.formatDate(parsed, 'UTC', 'yyyy-MM-dd');
}

function nearlyEqual_(left, right) {
  return Math.abs(Number(left) - Number(right)) < 1e-9;
}

function propertyKey_(prefix, requestId) {
  return prefix + requestId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 180);
}

function requireString_(value, code) {
  const result = String(value == null ? '' : value).trim();
  if (!result) throw new Error(code);
  return result;
}

function errorResponse_(error) {
  const code = error instanceof InsufficientResourceError
    ? 'INSUFFICIENT_HUMAN_RESOURCE'
    : error instanceof StateChangedError
      ? 'STATE_CHANGED'
      : error && error.message
      ? String(error.message)
      : 'INTERNAL_ERROR';
  return {
    ok: false,
    code: code,
    message: code === 'INTERNAL_ERROR' ? 'Internal Apps Script error.' : code,
    ...(error instanceof InsufficientResourceError || error instanceof StateChangedError ? { states: error.states } : {})
  };
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function InsufficientResourceError(states) {
  this.name = 'InsufficientResourceError';
  this.message = 'INSUFFICIENT_HUMAN_RESOURCE';
  this.states = states || [];
}

function StateChangedError(states) {
  this.name = 'StateChangedError';
  this.message = 'STATE_CHANGED';
  this.states = states || [];
}
