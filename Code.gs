/**
 * Sousedský Halloween – backend nad Google Tabulkou.
 * Listy: Lokality (jednotlivé akce/obce), Stanoviste (domy), Hodnoceni (hvězdičky 3–5), Fotky (Google Disk).
 * Nasazení: Implementovat → Webová aplikace, Spustit jako: Já, Přístup: Kdokoli.
 * Po každé úpravě: Implementovat → Spravovat implementace → Verze: Nová verze.
 */
const SHEET = 'Stanoviste';
const SHEET_RATE = 'Hodnoceni';
const SHEET_PHOTO = 'Fotky';
const SHEET_LOC = 'Lokality';
const ADMIN_KEY = 'dyne-2e41849e';            // heslo správce (?admin=HESLO)
const MAX_STATIONS = 300;                      // pojistka proti spamu (na jednu lokalitu)
const MAX_LOCS = 500;
const RADIUS_KM = 6;                           // stanoviště musí být do této vzdálenosti od středu lokality
const DEFAULT_LOC = 'uvaly';                   // stanoviště z doby před lokalitami
const MAX_PHOTOS_PER_STATION = 30;
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;       // 3 MB po zmenšení v prohlížeči bohatě stačí
const REGION = { minLat: 47.7, maxLat: 51.1, minLng: 12.0, maxLng: 22.6 }; // Česko + Slovensko
const COLS = ['id','token','pinHash','name','address','lat','lng','scare','allergyFree','nonCandy','accessible','from','to','note','status','created','updated','loc'];
const RATE_COLS = ['stationId','voter','stars','created','updated'];
const PHOTO_COLS = ['id','stationId','fileId','by','voter','created'];
const LOC_COLS = ['id','name','city','lat','lng','zoom','start','end','meeting','note','pinHash','token','created','updated'];

/* ---------- listy ---------- */
function aux_(name, cols) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@'); // vše jako text
    sh.setFrozenRows(1);
  }
  const head = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), cols.length)).getValues()[0];
  if (cols.some(function (c, i) { return head[i] !== c; })) {
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
  }
  return sh;
}
function sheet_() { return aux_(SHEET, COLS); }

function table_(sh) {
  const values = sh.getDataRange().getValues();
  const head = values.shift() || [];
  return values.map(function (r, i) {
    const o = { _row: i + 2 };
    head.forEach(function (k, j) { o[k] = r[j]; });
    return o;
  });
}
function rows_() { return table_(sheet_()).filter(function (o) { return o.id; }); }

/* ---------- pomocné ---------- */
const bool_ = v => v === true || String(v).toLowerCase() === 'true';
const str_ = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const time_ = v => /^\d{1,2}:\d{2}$/.test(String(v)) ? String(v) : '';

function public_(o) {
  return {
    id: String(o.id), name: String(o.name), address: String(o.address),
    lat: Number(o.lat), lng: Number(o.lng), scare: Number(o.scare) || 1,
    allergyFree: bool_(o.allergyFree), nonCandy: bool_(o.nonCandy), accessible: bool_(o.accessible),
    from: String(o.from), to: String(o.to), note: String(o.note),
    status: ['open', 'out', 'closed'].indexOf(String(o.status)) >= 0 ? String(o.status) : 'open',
    loc: String(o.loc || DEFAULT_LOC)
  };
}

/* ---------- lokality ---------- */
function locs_() {
  const sh = aux_(SHEET_LOC, LOC_COLS);
  let list = table_(sh).filter(function (o) { return o.id; });
  if (!list.length) {                                   // první spuštění: založ Úvaly
    const now = new Date().toISOString();
    sh.appendRow([DEFAULT_LOC, 'Primavera & Radlická čtvrť', 'Úvaly', '50.0668', '14.7155', '16',
      '2026-11-07T17:00:00+01:00', '2026-11-07T20:00:00+01:00', '', '', '', Utilities.getUuid(), now, now]);
    list = table_(sh).filter(function (o) { return o.id; });
  }
  return list;
}
function locPublic_(o) {
  return { id: String(o.id), name: String(o.name), city: String(o.city), lat: Number(o.lat), lng: Number(o.lng),
    zoom: Number(o.zoom) || 16, start: String(o.start), end: String(o.end), meeting: String(o.meeting), note: String(o.note) };
}
const dt_ = v => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)?$/.test(String(v)) ? String(v) : '';
function locClean_(s, prev) {
  prev = prev || {};
  const get = (k) => (s[k] !== undefined ? s[k] : prev[k]);
  const out = {
    name: str_(get('name'), 60), city: str_(get('city'), 40),
    lat: Number(get('lat')), lng: Number(get('lng')),
    zoom: Math.min(18, Math.max(12, parseInt(get('zoom'), 10) || 16)),
    start: dt_(get('start')), end: dt_(get('end')),
    meeting: str_(get('meeting'), 120), note: str_(get('note'), 300)
  };
  if (!out.city) throw new Error('Vyplňte obec nebo město.');
  if (!out.name) throw new Error('Vyplňte název čtvrti nebo akce.');
  if (!out.start || !out.end) throw new Error('Vyplňte datum a čas akce.');
  if (!(out.lat >= REGION.minLat && out.lat <= REGION.maxLat && out.lng >= REGION.minLng && out.lng <= REGION.maxLng))
    throw new Error('Střed mapy musí být v Česku nebo na Slovensku.');
  return out;
}
function slug_(t) {
  return String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'lokalita';
}
function km_(a, b) {
  const R = 6371, r = function (x) { return x * Math.PI / 180; };
  const dLa = r(b.lat - a.lat), dLo = r(b.lng - a.lng);
  const h = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
  return 2 * R * Math.asin(Math.sqrt(h));
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
  if (!(out.lat >= REGION.minLat && out.lat <= REGION.maxLat && out.lng >= REGION.minLng && out.lng <= REGION.maxLng))
    throw new Error('Poloha je mimo povolenou oblast.');
  return out;
}

function hash_(pin, id) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'dyne|' + id + '|' + pin, Utilities.Charset.UTF_8);
  return raw.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
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

/* ---------- fotky v Google Disku ---------- */
function photoUrl_(fileId) { return 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1200'; }

function folder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('photoFolder');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const f = DriveApp.createFolder('Sousedský Halloween – fotky');
  props.setProperty('photoFolder', f.getId());
  return f;
}

function trashPhotos_(stationId) {
  const sh = aux_(SHEET_PHOTO, PHOTO_COLS);
  const list = table_(sh).filter(function (p) { return String(p.stationId) === String(stationId); });
  list.sort(function (a, b) { return b._row - a._row; }).forEach(function (p) {
    try { DriveApp.getFileById(String(p.fileId)).setTrashed(true); } catch (e) {}
    sh.deleteRow(p._row);
  });
}

/* ---------- API ---------- */
function doGet(e) {
  if (!e) return json_({ ok: true, setup: setup() });   // spuštění z editoru = inicializace + oprávnění
  try {
    const locations = locs_().map(locPublic_);
    const want = e.parameter && e.parameter.loc ? String(e.parameter.loc) : '';
    const stations = rows_().map(public_).filter(function (s) { return !want || s.loc === want; });
    const agg = {};
    table_(aux_(SHEET_RATE, RATE_COLS)).forEach(function (r) {
      const s = Number(r.stars), k = String(r.stationId);
      if (!(s >= 3 && s <= 5)) return;
      agg[k] = agg[k] || { sum: 0, n: 0 };
      agg[k].sum += s; agg[k].n++;
    });
    const ph = {};
    table_(aux_(SHEET_PHOTO, PHOTO_COLS)).forEach(function (p) {
      if (!p.fileId) return;
      const k = String(p.stationId);
      (ph[k] = ph[k] || []).push({ id: String(p.id), url: photoUrl_(p.fileId), host: String(p.by) === 'host', created: String(p.created) });
    });
    stations.forEach(function (s) {
      const a = agg[s.id];
      s.rating = a ? { avg: Math.round(a.sum / a.n * 10) / 10, count: a.n } : { avg: 0, count: 0 };
      s.photos = (ph[s.id] || []).sort(function (a, b) {
        return (b.host - a.host) || (a.created < b.created ? 1 : -1);
      }).slice(0, 24);
    });
    return json_({ ok: true, locations: locations, stations: stations });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    const sh = sheet_();
    const all = rows_();
    const now = new Date().toISOString();
    const isAdmin = body.admin && body.admin === ADMIN_KEY;
    const locSh = aux_(SHEET_LOC, LOC_COLS);
    const locList = locs_();
    const findLoc = function (id) { return locList.filter(function (l) { return String(l.id) === String(id); })[0]; };

    // --- lokality ---
    if (body.action === 'addloc') {
      if (locList.length >= MAX_LOCS) throw new Error('Lokalit je už příliš, ozvěte se správci.');
      const L = locClean_(body.location || {});
      const pin = String(body.pin || '');
      if (pin.length < 4 || pin.length > 32) throw new Error('Zvolte PIN organizátora o délce 4 až 32 znaků.');
      let id = slug_(L.city + '-' + L.name), base = id, n = 2;
      while (findLoc(id)) id = base + '-' + (n++);
      const token = Utilities.getUuid();
      locSh.appendRow([id, L.name, L.city, String(L.lat), String(L.lng), String(L.zoom), L.start, L.end, L.meeting, L.note, hash_(pin, 'loc:' + id), token, now, now]);
      return json_({ ok: true, id: id, token: token });
    }
    if (body.action === 'loginloc' || body.action === 'updloc' || body.action === 'delloc') {
      const loc = findLoc(body.loc);
      if (!loc) throw new Error('Lokalita nebyla nalezena.');
      if (body.action === 'loginloc') {
        if (!loc.pinHash) throw new Error('Tato lokalita nemá PIN organizátora, ozvěte se správci.');
        if (hash_(String(body.pin || ''), 'loc:' + loc.id) !== String(loc.pinHash)) { Utilities.sleep(1000); throw new Error('Nesprávný PIN organizátora.'); }
        return json_({ ok: true, loc: String(loc.id), token: String(loc.token) });
      }
      if (!isAdmin && String(body.token || '') !== String(loc.token)) throw new Error('Lokalitu může upravit jen její organizátor.');
      if (body.action === 'updloc') {
        const L = locClean_(body.location || {}, locPublic_(loc));
        locSh.getRange(loc._row, 2, 1, 9).setValues([[L.name, L.city, String(L.lat), String(L.lng), String(L.zoom), L.start, L.end, L.meeting, L.note]]);
        locSh.getRange(loc._row, 14).setValue(now);
        return json_({ ok: true });
      }
      if (all.some(function (r) { return String(r.loc || DEFAULT_LOC) === String(loc.id); })) throw new Error('V lokalitě jsou ještě stanoviště – nejdřív je smažte.');
      locSh.deleteRow(loc._row);
      return json_({ ok: true });
    }

    if (body.action === 'add') {
      const loc = findLoc(body.loc || DEFAULT_LOC);
      if (!loc) throw new Error('Lokalita nebyla nalezena.');
      if (all.filter(function (r) { return String(r.loc || DEFAULT_LOC) === String(loc.id); }).length >= MAX_STATIONS)
        throw new Error('Mapa je plná, ozvěte se organizátorovi.');
      const s = clean_(body.station || {});
      if (km_(s, { lat: Number(loc.lat), lng: Number(loc.lng) }) > RADIUS_KM)
        throw new Error('Dům je moc daleko od lokality „' + loc.city + ' – ' + loc.name + '“. Nejste v jiné lokalitě?');
      s.loc = String(loc.id);
      const pin = String(body.pin || '');
      if (pin.length < 4 || pin.length > 32) throw new Error('Zvolte PIN o délce 4 až 32 znaků.');
      const id = Utilities.getUuid().slice(0, 8);
      const token = Utilities.getUuid();
      writeRow_(sh, sh.getLastRow() + 1, Object.assign({ id: id, token: token, pinHash: hash_(pin, id), created: now, updated: now }, s));
      return json_({ ok: true, id: id, token: token });
    }

    const row = all.filter(r => String(r.id) === String(body.id))[0];
    if (!row) throw new Error('Stanoviště nebylo nalezeno.');
    const isHost = !!body.token && String(body.token) === String(row.token);
    const rowLoc = findLoc(row.loc || DEFAULT_LOC);
    const isOrg = !!body.orgToken && !!rowLoc && String(body.orgToken) === String(rowLoc.token);
    const voter = str_(body.voter, 64);

    // --- hodnocení: kdokoli, jedno na zařízení a stanoviště (lze změnit) ---
    if (body.action === 'rate') {
      const stars = parseInt(body.stars, 10);
      if ([3, 4, 5].indexOf(stars) < 0) throw new Error('Hodnotit lze 3 až 5 hvězdičkami.');
      if (voter.length < 8) throw new Error('Nepodařilo se rozpoznat zařízení, obnovte stránku.');
      const rs = aux_(SHEET_RATE, RATE_COLS);
      const ex = table_(rs).filter(function (r) { return String(r.stationId) === String(row.id) && String(r.voter) === voter; })[0];
      if (ex) rs.getRange(ex._row, 3, 1, 3).setValues([[String(stars), String(ex.created), now]]);
      else rs.appendRow([String(row.id), voter, String(stars), now, now]);
      return json_({ ok: true });
    }

    // --- fotka: kdokoli; s tokenem hostitele se označí jako fotka od hostitele ---
    if (body.action === 'photo') {
      const ps = aux_(SHEET_PHOTO, PHOTO_COLS);
      const count = table_(ps).filter(function (p) { return String(p.stationId) === String(row.id); }).length;
      if (count >= MAX_PHOTOS_PER_STATION) throw new Error('U tohoto stanoviště už je fotek dost.');
      const m = /^data:(image\/(jpeg|png|webp));base64,(.+)$/.exec(String(body.image || ''));
      if (!m) throw new Error('Tohle není obrázek.');
      const bytes = Utilities.base64Decode(m[3]);
      if (bytes.length > MAX_PHOTO_BYTES) throw new Error('Fotka je moc velká.');
      const pid = Utilities.getUuid().slice(0, 8);
      const ext = m[2] === 'jpeg' ? 'jpg' : m[2];
      const file = folder_().createFile(Utilities.newBlob(bytes, m[1], row.id + '-' + pid + '.' + ext));
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      ps.appendRow([pid, String(row.id), file.getId(), isHost ? 'host' : 'visitor', voter, now]);
      return json_({ ok: true, id: pid, url: photoUrl_(file.getId()), host: isHost });
    }

    // --- smazání fotky: správce, hostitel stanoviště, nebo ten, kdo ji nahrál ---
    if (body.action === 'delphoto') {
      const ps = aux_(SHEET_PHOTO, PHOTO_COLS);
      const p = table_(ps).filter(function (x) { return String(x.id) === String(body.photoId) && String(x.stationId) === String(row.id); })[0];
      if (!p) throw new Error('Fotka nebyla nalezena.');
      if (!isAdmin && !isOrg && !isHost && !(voter && String(p.voter) === voter)) throw new Error('Tuto fotku smazat nemůžete.');
      try { DriveApp.getFileById(String(p.fileId)).setTrashed(true); } catch (err) {}
      ps.deleteRow(p._row);
      return json_({ ok: true });
    }

    // --- přihlášení hostitele PINem ---
    if (body.action === 'login') {
      const pin = String(body.pin || '');
      if (!row.pinHash) throw new Error('U tohoto stanoviště není PIN nastavený, ozvěte se organizátorovi.');
      if (hash_(pin, row.id) !== String(row.pinHash)) {
        Utilities.sleep(1000);                       // brzda proti hádání PINu
        throw new Error('Nesprávný PIN.');
      }
      return json_({ ok: true, id: String(row.id), token: String(row.token) });
    }

    if (!isAdmin && !isHost && !(isOrg && body.action === 'delete'))
      throw new Error('Toto stanoviště může upravit jen jeho hostitel – přihlaste se PINem.');

    if (body.action === 'update') {
      const s = clean_(body.station || {}, public_(row));
      if (rowLoc && km_(s, { lat: Number(rowLoc.lat), lng: Number(rowLoc.lng) }) > RADIUS_KM) throw new Error('Dům je moc daleko od středu lokality.');
      writeRow_(sh, row._row, Object.assign({}, row, s, { loc: String(row.loc || DEFAULT_LOC), updated: now }));
      return json_({ ok: true });
    }
    if (body.action === 'delete') {
      trashPhotos_(row.id);
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

// Spusťte jednou ručně: založí listy a vyžádá oprávnění k Google Disku (fotky).
function setup() {
  sheet_(); locs_(); aux_(SHEET_RATE, RATE_COLS); aux_(SHEET_PHOTO, PHOTO_COLS);
  return folder_().getName();
}
