/**
 * Tasks — Google Apps Script API
 *
 * Deploy as a Web App: "Execute as: Me", "Who has access: Anyone".
 * Run `setup()` once from the editor: it creates the three tabs, formats
 * the columns as plain text, and generates the secret access token
 * (printed in the execution log and stored in Script Properties).
 *
 * The frontend sends POST requests with a text/plain body containing JSON:
 *   { token, action, payload }
 * and receives JSON back:
 *   { ok: true, data } | { ok: false, error, data? }
 */

var SHEETS = {
  Tasks: [
    'id', 'title', 'notes', 'area_id', 'project_id', 'due_date', 'due_time',
    'priority', 'status', 'subtasks', 'recurrence', 'sort_order',
    'created_at', 'completed_at', 'updated_at'
  ],
  Projects: ['id', 'name', 'area_id', 'sort_order', 'archived', 'created_at', 'updated_at'],
  Areas: ['id', 'name', 'sort_order', 'archived', 'created_at', 'updated_at']
};

var NUMERIC = { sort_order: true };
var BOOLEAN = { archived: true };

var DEFAULT_AREAS = ['Work', 'Personal', 'Family', 'Properties', 'Business', 'Finance', 'Ideas'];

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS).forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    var headers = SHEETS[name];
    var first = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    if (first.join('') !== headers.join('')) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
    // Plain-text format so Sheets never turns "2026-09-10" into a Date
    // or "09:00" into a time.
    sheet.getRange(1, 1, sheet.getMaxRows(), headers.length).setNumberFormat('@');
    sheet.setFrozenRows(1);
  });
  var defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 3) ss.deleteSheet(defaultSheet);

  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('ACCESS_TOKEN');
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props.setProperty('ACCESS_TOKEN', token);
  }

  if (readAll_('Areas').length === 0) {
    var now = nowIso_();
    DEFAULT_AREAS.forEach(function (name, i) {
      appendRow_('Areas', {
        id: Utilities.getUuid(), name: name, sort_order: i, archived: false,
        created_at: now, updated_at: now
      });
    });
  }

  Logger.log('ACCESS TOKEN (paste this into the app once per device):\n' + token);
  return token;
}

/** Run this to change the token (you will need to re-enter it on every device). */
function rotateToken() {
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('ACCESS_TOKEN', token);
  Logger.log('NEW ACCESS TOKEN:\n' + token);
  return token;
}

/* ------------------------------------------------------------------ */
/* HTTP entry points                                                   */
/* ------------------------------------------------------------------ */

function doGet() {
  return json_({ ok: true, data: { service: 'tasks', version: 1 } });
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'bad_json' });
  }

  var expected = PropertiesService.getScriptProperties().getProperty('ACCESS_TOKEN');
  if (!expected || !body.token || body.token !== expected) {
    return json_({ ok: false, error: 'unauthorized' });
  }

  var handler = ACTIONS[body.action];
  if (!handler) return json_({ ok: false, error: 'unknown_action' });

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (err) {
    return json_({ ok: false, error: 'busy' });
  }
  try {
    var result = handler(body.payload || {});
    return json_(result.ok === false ? result : { ok: true, data: result });
  } catch (err) {
    return json_({ ok: false, error: 'server_error', message: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

var ACTIONS = {
  bootstrap: function () {
    return {
      tasks: readAll_('Tasks'),
      projects: readAll_('Projects'),
      areas: readAll_('Areas'),
      serverTime: nowIso_()
    };
  },

  createTask: function (p) {
    var task = p.task;
    if (!task || !task.id || !task.title) return { ok: false, error: 'invalid_task' };
    var existing = findRow_('Tasks', task.id);
    if (existing) return { task: existing.row }; // idempotent retry
    var now = nowIso_();
    var row = normalizeTask_(task);
    row.created_at = row.created_at || now;
    row.updated_at = now;
    row.status = row.status || 'open';
    if (row.sort_order === null || row.sort_order === undefined) row.sort_order = nextSortOrder_();
    appendRow_('Tasks', row);
    return { task: row };
  },

  /** payload: { id, changes, baseUpdatedAt } */
  updateTask: function (p) {
    var found = findRow_('Tasks', p.id);
    if (!found) return { ok: false, error: 'not_found' };
    if (p.baseUpdatedAt && found.row.updated_at && p.baseUpdatedAt !== found.row.updated_at) {
      return { ok: false, error: 'conflict', data: { task: found.row } };
    }
    var row = normalizeTask_(merge_(found.row, p.changes || {}));
    row.id = found.row.id;
    row.created_at = found.row.created_at;
    row.updated_at = nowIso_();
    writeRow_('Tasks', found.index, row);
    return { task: row };
  },

  /** payload: { id } → { task, next? } */
  completeTask: function (p) {
    var found = findRow_('Tasks', p.id);
    if (!found) return { ok: false, error: 'not_found' };
    var now = nowIso_();
    var row = found.row;
    var alreadyDone = row.status === 'done';
    if (!alreadyDone) {
      row.status = 'done';
      row.completed_at = now;
      row.updated_at = now;
      writeRow_('Tasks', found.index, row);
    }
    var result = { task: row };
    if (!alreadyDone && row.recurrence) {
      var nextId = p.nextId || Utilities.getUuid();
      if (!findRow_('Tasks', nextId)) {
        var next = {
          id: nextId,
          title: row.title,
          notes: row.notes,
          area_id: row.area_id,
          project_id: row.project_id,
          due_date: nextDueDate_(row.due_date, row.recurrence, today_()),
          due_time: row.due_time,
          priority: row.priority,
          status: 'open',
          subtasks: (row.subtasks || []).map(function (s) { return { id: Utilities.getUuid(), title: s.title, done: false }; }),
          recurrence: row.recurrence,
          sort_order: row.sort_order,
          created_at: now,
          completed_at: '',
          updated_at: now
        };
        appendRow_('Tasks', next);
        result.next = next;
      }
    }
    return result;
  },

  restoreTask: function (p) {
    var found = findRow_('Tasks', p.id);
    if (!found) return { ok: false, error: 'not_found' };
    var row = found.row;
    row.status = 'open';
    row.completed_at = '';
    row.updated_at = nowIso_();
    writeRow_('Tasks', found.index, row);
    return { task: row };
  },

  deleteTask: function (p) {
    var found = findRow_('Tasks', p.id);
    if (found) sheet_('Tasks').deleteRow(found.index);
    return { id: p.id };
  },

  /** payload: { orders: [{ id, sort_order }] } */
  reorderTasks: function (p) {
    var orders = p.orders || [];
    var byId = {};
    orders.forEach(function (o) { byId[o.id] = Number(o.sort_order); });
    var sheet = sheet_('Tasks');
    var data = readAll_('Tasks');
    var now = nowIso_();
    var headers = SHEETS.Tasks;
    var soCol = headers.indexOf('sort_order') + 1;
    var upCol = headers.indexOf('updated_at') + 1;
    data.forEach(function (row, i) {
      if (byId.hasOwnProperty(row.id)) {
        sheet.getRange(i + 2, soCol).setValue(byId[row.id]);
        sheet.getRange(i + 2, upCol).setValue(now);
      }
    });
    return { count: orders.length };
  },

  /** payload: { areas: [Area] } — creates or updates each */
  upsertAreas: function (p) {
    return { areas: (p.areas || []).map(function (a) { return upsert_('Areas', a); }) };
  },

  /** payload: { projects: [Project] } */
  upsertProjects: function (p) {
    return { projects: (p.projects || []).map(function (pr) { return upsert_('Projects', pr); }) };
  }
};

/* ------------------------------------------------------------------ */
/* Recurrence                                                          */
/* ------------------------------------------------------------------ */

/** recurrence: 'daily' | 'weekly' | 'monthly' | 'every:N:days|weeks|months' */
function parseRecurrence_(r) {
  if (!r) return null;
  if (r === 'daily') return { n: 1, unit: 'days' };
  if (r === 'weekly') return { n: 1, unit: 'weeks' };
  if (r === 'monthly') return { n: 1, unit: 'months' };
  var m = /^every:(\d+):(days|weeks|months)$/.exec(r);
  if (!m) return null;
  return { n: Math.max(1, parseInt(m[1], 10)), unit: m[2] };
}

function addInterval_(ymd, rec) {
  var parts = ymd.split('-').map(Number);
  var d = new Date(parts[0], parts[1] - 1, parts[2]);
  if (rec.unit === 'days') d.setDate(d.getDate() + rec.n);
  else if (rec.unit === 'weeks') d.setDate(d.getDate() + rec.n * 7);
  else {
    var day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + rec.n);
    var last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
  }
  return fmtYmd_(d);
}

/** Next occurrence strictly after today, stepping from the scheduled date. */
function nextDueDate_(dueDate, recurrence, today) {
  var rec = parseRecurrence_(recurrence);
  if (!rec) return '';
  var next = addInterval_(dueDate || today, rec);
  var guard = 0;
  while (next <= today && guard++ < 1000) next = addInterval_(next, rec);
  return next;
}

/* ------------------------------------------------------------------ */
/* Sheet helpers                                                       */
/* ------------------------------------------------------------------ */

function sheet_(name) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('Missing sheet "' + name + '". Run setup().');
  return sheet;
}

function readAll_(name) {
  var sheet = sheet_(name);
  var headers = SHEETS[name];
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var values = sheet.getRange(2, 1, last - 1, headers.length).getValues();
  var rows = [];
  values.forEach(function (v) {
    if (!v[0]) return;
    var obj = {};
    headers.forEach(function (h, i) { obj[h] = fromCell_(h, v[i]); });
    rows.push(obj);
  });
  return rows;
}

function findRow_(name, id) {
  if (!id) return null;
  var sheet = sheet_(name);
  var last = sheet.getLastRow();
  if (last < 2) return null;
  var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      var headers = SHEETS[name];
      var v = sheet.getRange(i + 2, 1, 1, headers.length).getValues()[0];
      var obj = {};
      headers.forEach(function (h, j) { obj[h] = fromCell_(h, v[j]); });
      return { index: i + 2, row: obj };
    }
  }
  return null;
}

function appendRow_(name, obj) {
  var headers = SHEETS[name];
  var sheet = sheet_(name);
  var rowIndex = sheet.getLastRow() + 1;
  sheet.getRange(rowIndex, 1, 1, headers.length).setValues([headers.map(function (h) { return toCell_(h, obj[h]); })]);
}

function writeRow_(name, index, obj) {
  var headers = SHEETS[name];
  sheet_(name).getRange(index, 1, 1, headers.length).setValues([headers.map(function (h) { return toCell_(h, obj[h]); })]);
}

function upsert_(name, obj) {
  if (!obj || !obj.id) throw new Error('missing id');
  var now = nowIso_();
  var found = findRow_(name, obj.id);
  var row = merge_(found ? found.row : {}, obj);
  row.updated_at = now;
  if (!found) {
    row.created_at = row.created_at || now;
    if (row.sort_order === undefined || row.sort_order === null) row.sort_order = 0;
    row.archived = !!row.archived;
    appendRow_(name, row);
  } else {
    row.created_at = found.row.created_at;
    writeRow_(name, found.index, row);
  }
  return row;
}

function nextSortOrder_() {
  var max = 0;
  readAll_('Tasks').forEach(function (t) { if (t.sort_order > max) max = t.sort_order; });
  return max + 1;
}

function normalizeTask_(t) {
  var out = {};
  SHEETS.Tasks.forEach(function (h) { out[h] = t[h]; });
  out.title = String(out.title || '').trim();
  out.notes = String(out.notes || '');
  out.area_id = out.area_id || '';
  out.project_id = out.project_id || '';
  out.due_date = out.due_date || '';
  out.due_time = out.due_time || '';
  out.priority = out.priority || 'none';
  out.status = out.status === 'done' ? 'done' : 'open';
  out.subtasks = Array.isArray(out.subtasks) ? out.subtasks : [];
  out.recurrence = parseRecurrence_(out.recurrence) ? out.recurrence : '';
  out.sort_order = out.sort_order === '' || out.sort_order === undefined || out.sort_order === null ? null : Number(out.sort_order);
  out.completed_at = out.status === 'done' ? (out.completed_at || '') : '';
  return out;
}

function toCell_(h, v) {
  if (h === 'subtasks') return JSON.stringify(Array.isArray(v) ? v : []);
  if (BOOLEAN[h]) return v ? 'TRUE' : 'FALSE';
  if (NUMERIC[h]) return v === null || v === undefined || v === '' ? '' : Number(v);
  if (v === null || v === undefined) return '';
  return String(v);
}

function fromCell_(h, v) {
  if (h === 'subtasks') {
    try { var arr = JSON.parse(v || '[]'); return Array.isArray(arr) ? arr : []; } catch (e) { return []; }
  }
  if (BOOLEAN[h]) return v === true || String(v).toUpperCase() === 'TRUE';
  if (NUMERIC[h]) return v === '' || v === null ? 0 : Number(v);
  if (v instanceof Date) {
    // Defensive: if Sheets parsed a value as a date anyway.
    if (h === 'due_time') return Utilities.formatDate(v, Session.getScriptTimeZone(), 'HH:mm');
    if (h === 'due_date') return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    return v.toISOString();
  }
  return v === null || v === undefined ? '' : String(v);
}

function merge_(base, changes) {
  var out = {};
  Object.keys(base).forEach(function (k) { out[k] = base[k]; });
  Object.keys(changes).forEach(function (k) { out[k] = changes[k]; });
  return out;
}

function nowIso_() { return new Date().toISOString(); }

function fmtYmd_(d) {
  var m = d.getMonth() + 1, day = d.getDate();
  return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
}

function today_() { return fmtYmd_(new Date()); }

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
