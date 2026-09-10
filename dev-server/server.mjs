// Local stand-in for Google Apps Script. Loads apps-script/Code.gs verbatim
// with shims for SpreadsheetApp / PropertiesService / LockService / etc.,
// so the frontend can be developed and tested against the real API logic.
// Not used in production.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const TOKEN = process.env.TOKEN || 'dev-token';
const PORT = Number(process.env.PORT || 8787);

const state = fs.existsSync(DATA_FILE)
  ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
  : { sheets: { Sheet1: [[]] } };
const save = () => fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));

function makeSheet(name) {
  const rows = () => state.sheets[name];
  return {
    getName: () => name,
    getLastRow: () => {
      const r = rows();
      let last = 0;
      r.forEach((row, i) => { if (row.some((c) => c !== '' && c !== null && c !== undefined)) last = i + 1; });
      return last;
    },
    getMaxRows: () => Math.max(rows().length, 1000),
    getRange: (row, col, numRows = 1, numCols = 1) => ({
      getValues: () => {
        const out = [];
        for (let r = 0; r < numRows; r++) {
          const src = rows()[row - 1 + r] || [];
          const line = [];
          for (let c = 0; c < numCols; c++) line.push(src[col - 1 + c] ?? '');
          out.push(line);
        }
        return out;
      },
      setValues: (vals) => {
        vals.forEach((line, r) => {
          const idx = row - 1 + r;
          while (rows().length <= idx) rows().push([]);
          line.forEach((v, c) => { rows()[idx][col - 1 + c] = v; });
        });
        save();
      },
      setValue: (v) => {
        const idx = row - 1;
        while (rows().length <= idx) rows().push([]);
        rows()[idx][col - 1] = v;
        save();
      },
      setNumberFormat: () => {},
    }),
    deleteRow: (row) => { rows().splice(row - 1, 1); save(); },
    setFrozenRows: () => {},
  };
}

const ss = {
  getSheetByName: (name) => (state.sheets[name] ? makeSheet(name) : null),
  insertSheet: (name) => { state.sheets[name] = [[]]; save(); return makeSheet(name); },
  getSheets: () => Object.keys(state.sheets).map(makeSheet),
  deleteSheet: (s) => { delete state.sheets[s.getName()]; save(); },
};

const props = { ACCESS_TOKEN: TOKEN };
const sandbox = {
  SpreadsheetApp: { getActiveSpreadsheet: () => ss },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
  LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
  Utilities: { getUuid: () => randomUUID(), formatDate: (d, _tz, fmt) => (fmt === 'HH:mm' ? d.toTimeString().slice(0, 5) : d.toISOString().slice(0, 10)) },
  Session: { getScriptTimeZone: () => 'UTC' },
  Logger: { log: (m) => console.log('[gs]', m) },
  ContentService: {
    MimeType: { JSON: 'json' },
    createTextOutput: (text) => ({ text, setMimeType() { return this; } }),
  },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), sandbox);
if (!state.sheets.Tasks) sandbox.setup();

let delay = Number(process.env.DELAY_MS || 0);
let failNext = 0; // set via /__fail?n=2 to simulate network failures

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.end();
  if (req.url.startsWith('/__fail')) { failNext = Number(new URL(req.url, 'http://x').searchParams.get('n') || 1); return res.end('ok'); }
  if (req.url.startsWith('/__delay')) { delay = Number(new URL(req.url, 'http://x').searchParams.get('ms') || 0); return res.end('ok'); }
  if (req.method === 'GET') { res.setHeader('Content-Type', 'application/json'); return res.end(sandbox.doGet().text); }
  let body = '';
  for await (const chunk of req) body += chunk;
  if (failNext > 0) { failNext--; req.socket.destroy(); return; }
  if (delay) await new Promise((r) => setTimeout(r, delay));
  const out = sandbox.doPost({ postData: { contents: body } });
  res.setHeader('Content-Type', 'application/json');
  res.end(out.text);
});

server.listen(PORT, () => console.log(`dev API on http://localhost:${PORT}  token=${TOKEN}`));
