/**
 * Dýňová stezka Úvaly – jednoduchý backend nad Google Tabulkou.
 * Vložte do Rozšíření → Apps Script v prázdné Google Tabulce a nasaďte jako webovou aplikaci
 * (Spustit jako: Já, Přístup: Kdokoli). Postup je v NAVOD.md.
 */
const SHEET = 'Stanoviste';
const ADMIN_KEY = 'dyne-2e41849e';        // heslo správce pro mazání cizích stanovišť (?admin=HESLO)
const MAX_STATIONS = 300;                      // pojistka proti spamu
const BOUNDS = { minLat: 50.03, maxLat: 50.10, minLng: 14.66, maxLng: 14.80 }; // Úvaly a okolí
const COLS = ['id','token','name','address','lat','lng','scare','allergyFree','nonCandy','accessible','from','to','note','status','created','updated'];

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET);
  if (!sh) {
    sh = ss.insertSheet(SHEET);
    sh.getRange(1, 1, 1, COLS.length).setValues([COLS]).setFontWeight('bold');
    sh.getRange('A:P').setNumberFormat('@');   // vše jako text, ať Tabulky nepřevádí časy na datum
    sh.setFrozenRows(1);
  }
  return sh;
}

function rows_() {
  const sh = sheet_();
  const values = sh.getDataRange().getValues();
  const head = values.shift();
  return values.map((r, i) => {
    const o = { _row: i + 2 };
    head.forEach((k, j) => o[k] = r[j]);
    return o;
  }).filter(o => o.id);
}

const bool_ = v => v === true || String(v).toLowerCase() === 'true';
const str_ = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const time_ = v => /^\d{1,2}:\d{2}$/.test(String(v)) ? String(v) : '';

function public_(o) {
  return {
    id: String(o.id), name: String(o.name), address: String(o.address),
    lat: Number(o.lat), lng: Number(o.lng), scare: Number(o.scare) || 1,
    allergyFree: bool_(o.allergyFree), nonCandy: bool_(o.nonCandy), accessible: bool_(o.accessible),
    from: String(o.from), to: String(o.to), note: String(o.note),
    status: ['open', 'out', 'closed'].indexOf(String(o.status)) >= 0 ? String(o.status) : 'open'
  };
}

function clean_(s, prev) {
  prev = prev || {};
  const get = (k) => (s[k] !== undefined ? s[k] : prev[k]);
  const out = {
    name: str_(get('name'), 60),
    address: str_(get('address'), 80),
    lat: Number(get('lat')), lng: Number(get('lng')),
    scare: Math.min(3, Math.max(1, parseInt(get('scare'), 10) || 1)),
    allergyFree: bool_(get('allergyFree')), nonCandy: bool_(get('nonCandy')), accessible: bool_(get('accessible')),
    from: time_(get('from')), to: time_(get('to')),
    note: str_(get('note'), 200),
    status: ['open', 'out', 'closed'].indexOf(String(get('status'))) >= 0 ? String(get('status')) : 'open'
  };
  if (!out.name) throw new Error('Chybí název stanoviště.');
  if (!(out.lat >= BOUNDS.minLat && out.lat <= BOUNDS.maxLat && out.lng >= BOUNDS.minLng && out.lng <= BOUNDS.maxLng))
    throw new Error('Poloha je mimo povolenou oblast.');
  return out;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function writeRow_(sh, rowIndex, o) {
  const row = COLS.map(k => {
    const v = o[k];
    return v === undefined || v === null ? '' : String(v);
  });
  sh.getRange(rowIndex, 1, 1, COLS.length).setValues([row]);
}

function doGet() {
  try {
    return json_({ ok: true, stations: rows_().map(public_) });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    const sh = sheet_();
    const all = rows_();
    const now = new Date().toISOString();
    const isAdmin = body.admin && body.admin === ADMIN_KEY;

    if (body.action === 'add') {
      if (all.length >= MAX_STATIONS) throw new Error('Mapa je plná, ozvěte se organizátorovi.');
      const s = clean_(body.station || {});
      const id = Utilities.getUuid().slice(0, 8);
      const token = Utilities.getUuid();
      writeRow_(sh, sh.getLastRow() + 1, Object.assign({ id: id, token: token, created: now, updated: now }, s));
      return json_({ ok: true, id: id, token: token });
    }

    const row = all.filter(r => String(r.id) === String(body.id))[0];
    if (!row) throw new Error('Stanoviště nebylo nalezeno.');
    if (!isAdmin && String(row.token) !== String(body.token || ''))
      throw new Error('Toto stanoviště můžete upravit jen z telefonu, ze kterého bylo přidáno.');

    if (body.action === 'update') {
      const s = clean_(body.station || {}, public_(row));
      writeRow_(sh, row._row, Object.assign({}, row, s, { updated: now }));
      return json_({ ok: true });
    }
    if (body.action === 'delete') {
      sh.deleteRow(row._row);
      return json_({ ok: true });
    }
    throw new Error('Neznámá akce.');
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  } finally {
    lock.releaseLock();
  }
}
