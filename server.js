// Family Hub server — zero-build: plain Node http + static files + JSON file storage.
process.env.TZ = process.env.TZ || 'Europe/Oslo';
const http = require('http');
const fs = require('fs');
const path = require('path');
const ical = require('node-ical');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const TRAVEL_FILE = path.join(ROOT, 'config', 'travel.json');
const PUBLIC = path.join(ROOT, 'public');
const crypto = require('crypto');
const AUTH_FILE = path.join(ROOT, 'config', 'auth.json');

// ---------- private config: env var -> Render Secret File (/etc/secrets) -> local file ----------
// Private data (family members, calendar links, password hash) is never committed.
// Env values may be raw JSON/HTML or base64 of it.
const SECRETS_DIR = process.env.SECRETS_DIR || '/etc/secrets';
function decodeMaybeB64(v) {
  const t = v.trim();
  if (/^[{[<]/.test(t)) return t;
  return Buffer.from(t, 'base64').toString('utf8');
}
function readPrivate(envName, secretName, ...localPaths) {
  if (process.env[envName]) return { src: `env ${envName}`, text: decodeMaybeB64(process.env[envName]) };
  for (const p of [secretName && path.join(SECRETS_DIR, secretName), ...localPaths].filter(Boolean)) {
    try { if (fs.statSync(p).isFile()) return { src: p, text: fs.readFileSync(p, 'utf8') }; } catch {}
  }
  return null;
}
// ---------- date helpers (local time = Europe/Oslo) ----------
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mondayOf = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const wd = (x.getDay() + 6) % 7; return addDays(x, -wd); };
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ---------- storage ----------
function defaultData() {
  const mon = mondayOf(new Date());
  const wk = ymd(mon);
  const d = i => ymd(addDays(mon, i));
  const t = i => ymd(addDays(new Date(), i)); // relative to today
  const ex = { example: true };
  const lesson = (start, end, title) => ({ start, end, title, ...ex });
  const seed = {
    version: 1,
    settings: {
      familyName: 'Our Family',
      location: { name: 'Oslo', country: 'Norway', admin1: 'Oslo', latitude: 59.91273, longitude: 10.74609, isDefault: true },
      timezone: 'Europe/Oslo',
      tipsForMemberId: 'child1',  // whose clothing tips (the youngest)
      hideAwayOnKitchen: false,   // false = show away members as "Away", true = hide them completely
      birthdayReminderDays: 7,
      birthdayListDays: 60,
    },
    members: [
      { id: 'parent1', name: 'Parent 1', role: 'Parent', color: '#4f8cff', birthday: '', age: null, away: false, notes: '' },
      { id: 'parent2', name: 'Parent 2', role: 'Parent', color: '#e85d9c', birthday: '', age: null, away: false, notes: '' },
      { id: 'child1', name: 'Child 1', role: 'Child', color: '#22c58b', birthday: '', age: null, away: false, notes: '' },
    ],
    calendars: [],
    events: [
      { id: 'ex1', date: t(4), start: '07:30', end: '09:30', title: 'EXAMPLE: Flight to England (SAS)', location: 'Oslo Airport Gardermoen', memberId: 'parent1', ...ex },
      { id: 'ex2', date: t(1), start: '17:30', end: '19:00', title: 'EXAMPLE: Football practice', location: '', memberId: 'child1', ...ex },
      { id: 'ex3', date: t(3), start: '18:00', end: '19:00', title: 'EXAMPLE: Dentist', location: '', memberId: 'parent2', ...ex },
      { id: 'ex4', date: t(5), start: '17:00', end: '18:30', title: 'EXAMPLE: Football practice', location: '', memberId: 'child1', ...ex },
      { id: 'ex5', date: t(2), start: '11:00', end: '13:00', title: 'EXAMPLE: Football match', location: '', memberId: 'child1', ...ex },
      { id: 'ex6', date: ymd(new Date()), start: '19:00', end: '20:30', title: 'EXAMPLE: Handball', location: '', memberId: 'child1', ...ex },
    ],
    school: {
      [wk]: {
        child1: {
          mon: [lesson('08:15', '09:45', 'Maths'), lesson('10:00', '11:30', 'English'), lesson('12:15', '14:00', 'PE — bring gym clothes')],
          tue: [lesson('08:15', '11:30', 'Norwegian & Science'), lesson('12:15', '14:00', 'Music')],
          wed: [lesson('08:15', '13:00', 'School')],
          thu: [lesson('08:15', '11:30', 'Maths & Social studies'), lesson('12:15', '14:00', 'PE — bring gym clothes')],
          fri: [lesson('08:15', '12:30', 'School (short day)')],
        },
      },
    },
    meals: {
      [d(0)]: { dinner: 'EXAMPLE: Fish & potatoes', bought: true, example: true },
      [d(1)]: { dinner: 'EXAMPLE: Pasta bolognese', bought: true, example: true },
      [d(2)]: { dinner: 'EXAMPLE: Chicken curry', bought: true, example: true },
      [d(3)]: { dinner: 'EXAMPLE: Soup & bread', bought: true, example: true },
      [d(4)]: { dinner: 'EXAMPLE: Tacos', bought: false, example: true },
      [d(5)]: { dinner: 'EXAMPLE: Homemade pizza', bought: false, example: true },
    },
  };
  // Example data is only seeded on a fresh install when SEED_EXAMPLES=1 is set.
  if (process.env.SEED_EXAMPLES !== '1') { seed.events = []; seed.school = {}; seed.meals = {}; return seed; }
  seed.school[ymd(addDays(mon, 7))] = JSON.parse(JSON.stringify(seed.school[wk]));
  return seed;
}

let DATA;
function loadData() {
  try { DATA = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); console.log(`Data: ${DATA_FILE}`); return; } catch {}
  // No data file yet (e.g. fresh Render instance, whose disk is wiped on every restart/redeploy):
  // seed from FAMILY_DATA_JSON env var or the family-data.json Render Secret File.
  const seed = readPrivate('FAMILY_DATA_JSON', 'family-data.json');
  if (seed) { DATA = JSON.parse(seed.text); console.log(`Data: seeded from ${seed.src}`); }
  else { DATA = defaultData(); console.log('Data: no family data found, starting with defaults'); }
  saveData();
}
// Optional school-plan imports: SCHOOL_IMPORTS_JSON / school-imports.json = { "week42-2026.json": { ...plan } }
function seedSchoolImports() {
  const src = readPrivate('SCHOOL_IMPORTS_JSON', 'school-imports.json');
  if (!src) return;
  const dir = path.join(DATA_DIR, 'school-import');
  fs.mkdirSync(dir, { recursive: true });
  for (const [f, plan] of Object.entries(JSON.parse(src.text))) {
    if (!/^[\w.-]+\.json$/.test(f)) continue;
    const fp = path.join(dir, f);
    if (!fs.existsSync(fp)) fs.writeFileSync(fp, JSON.stringify(plan, null, 2));
  }
}
function saveData() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(DATA, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}
function ensureShape() {
  DATA.schoolNotes ||= {};   // { weekMonday: { memberId: "text" } }
  DATA.schoolMeta ||= {};    // { weekMonday: { memberId: { file, classId, group } } }
  DATA.reminders ||= [];     // manual reminders: { id, date, until?, daysBefore, text, memberId }
}
function loadTravel() { return JSON.parse(fs.readFileSync(TRAVEL_FILE, 'utf8')); }
loadData(); ensureShape(); seedSchoolImports();

// ---------- ages & birthdays ----------
function ageOf(m, on = new Date()) {
  if (m.birthday && /^\d{4}-\d{2}-\d{2}$/.test(m.birthday)) {
    const b = parseYmd(m.birthday);
    let a = on.getFullYear() - b.getFullYear();
    if (on.getMonth() < b.getMonth() || (on.getMonth() === b.getMonth() && on.getDate() < b.getDate())) a--;
    return a;
  }
  return m.age ?? null;
}
function upcomingBirthdays(days) {
  const today = parseYmd(ymd(new Date()));
  const out = [];
  for (const m of DATA.members) {
    if (!m.birthday) continue;
    const mm = m.birthday.match(/^(\d{4}|--)-?(\d{2})-(\d{2})$/); // YYYY-MM-DD (or --MM-DD if year unknown)
    if (!mm) continue;
    let next = new Date(today.getFullYear(), Number(mm[2]) - 1, Number(mm[3]));
    if (next < today) next = new Date(today.getFullYear() + 1, Number(mm[2]) - 1, Number(mm[3]));
    const inDays = Math.round((next - today) / 86400000);
    if (inDays > days) continue;
    const turns = /^\d{4}$/.test(mm[1]) ? next.getFullYear() - Number(mm[1]) : null;
    out.push({ memberId: m.id, name: m.name, color: m.color, date: ymd(next), inDays, turns });
  }
  return out.sort((a, b) => a.inDays - b.inDays);
}
function publicMembers() { return DATA.members.map(m => ({ ...m, ageNow: ageOf(m) })); }

// ---------- ICS calendars ----------
const icsCache = new Map(); // id -> { fetchedAt, parsed, error }
const ICS_TTL = 15 * 60 * 1000;
async function getIcs(cal, force = false) {
  const c = icsCache.get(cal.id);
  if (!force && c && Date.now() - c.fetchedAt < ICS_TTL) return c;
  const url = cal.url.replace(/^webcal:\/\//i, 'https://');
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'FamilyHub/1.0' }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!text.includes('BEGIN:VCALENDAR')) throw new Error('Not an iCal/ICS file');
    const parsed = ical.sync.parseICS(text);
    const entry = { fetchedAt: Date.now(), parsed, error: null, count: Object.values(parsed).filter(e => e.type === 'VEVENT').length };
    icsCache.set(cal.id, entry);
    return entry;
  } catch (e) {
    const entry = { fetchedAt: Date.now(), parsed: c?.parsed || {}, error: String(e.message || e), count: c?.count || 0 };
    icsCache.set(cal.id, entry);
    return entry;
  }
}

function expandIcs(parsed, from, to) {
  // from/to: Date (local midnight), to exclusive. Returns [{start: Date, end: Date, allDay, title, location}]
  const out = [];
  for (const k in parsed) {
    const ev = parsed[k];
    if (!ev || ev.type !== 'VEVENT' || !ev.start) continue;
    if (ev.status === 'CANCELLED') continue;
    const allDay = ev.datetype === 'date' || ev.start.dateOnly === true;
    const dur = ev.end ? ev.end - ev.start : (allDay ? 86400000 : 3600000);
    const push = (s, src, eOverride, allDayOverride) => {
      const e = eOverride || new Date(s.getTime() + (src.end && src.start ? src.end - src.start : dur));
      if (e <= from || s >= to) return;
      out.push({ start: s, end: e, allDay: allDayOverride ?? allDay, title: String(src.summary?.val ?? src.summary ?? '(no title)'), location: String(src.location?.val ?? src.location ?? '') });
    };
    if (ev.rrule) {
      let dates = [];
      try { dates = ev.rrule.between(new Date(from.getTime() - dur - 86400000), new Date(to.getTime() + 86400000), true); } catch { dates = []; }
      for (const d of dates) {
        const key = d.toISOString().slice(0, 10);
        if (ev.exdate && (ev.exdate[key] || ev.exdate[d.toISOString()])) continue;
        let s;
        if (allDay) s = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
        else s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), ev.start.getHours(), ev.start.getMinutes()); // keep local wall-clock time across DST
        const override = ev.recurrences && ev.recurrences[key];
        if (override) { if (override.status !== 'CANCELLED') push(new Date(override.start), override); continue; }
        push(s, ev);
      }
    } else {
      let s = new Date(ev.start);
      if (allDay) s = new Date(s.getFullYear(), s.getMonth(), s.getDate());
      // Outlook/WeekCal "whole day" entries often arrive as timed events from ~00:00-03:00 to ~00:00-03:00
      // (midnight UTC, e.g. 02:00 -> 02:00 next day). Show those as all-day (multi-day) events instead.
      const en = ev.end ? new Date(ev.end) : null;
      if (!allDay && en && dur >= 20 * 3600000 && s.getHours() <= 3 && en.getHours() <= 3 && s.getMinutes() === 0 && en.getMinutes() === 0) {
        push(new Date(s.getFullYear(), s.getMonth(), s.getDate()), ev, new Date(en.getFullYear(), en.getMonth(), en.getDate()), true);
      } else push(s, ev);
    }
  }
  return out;
}

// ---------- merged events ----------
function memberById(id) { return DATA.members.find(m => m.id === id); }
function colorFor(memberId, fallback) { return fallback || memberById(memberId)?.color || '#8a94a6'; }

async function getEvents(startStr, days) {
  const from = parseYmd(startStr);
  const to = addDays(from, days);
  const out = [];
  // 1. manual events
  for (const e of DATA.events) {
    const last = e.endDate && e.endDate > e.date ? e.endDate : e.date;
    for (let d = parseYmd(e.date); ymd(d) <= last; d = addDays(d, 1)) {
      const ds = ymd(d);
      if (ds >= ymd(from) && ds < ymd(to)) out.push({ ...e, date: ds, allDay: e.allDay || !e.start, source: 'manual', color: colorFor(e.memberId) });
    }
  }
  // 2. school calendar
  for (let i = 0; i < days; i++) {
    const day = addDays(from, i);
    const wk = DATA.school[ymd(mondayOf(day))];
    if (!wk) continue;
    const wd = WEEKDAYS[(day.getDay() + 6) % 7];
    for (const [memberId, byDay] of Object.entries(wk)) {
      for (const [idx, l] of (byDay[wd] || []).entries()) {
        out.push({ id: `school-${ymd(day)}-${memberId}-${idx}`, date: ymd(day), start: l.start || null, end: l.end || null, title: l.title, memberId, source: 'school', example: !!l.example, color: colorFor(memberId) });
      }
    }
  }
  // 3. subscribed ICS calendars
  const results = await Promise.all(DATA.calendars.filter(c => c.enabled !== false).map(async cal => ({ cal, ics: await getIcs(cal) })));
  for (const { cal, ics } of results) {
    for (const e of expandIcs(ics.parsed, from, to)) {
      if (e.allDay) {
        for (let d = new Date(e.start); d < e.end && d < to; d = addDays(d, 1)) {
          if (d < from) continue;
          out.push({ id: `ics-${cal.id}-${ymd(d)}-${e.title}`, date: ymd(d), start: null, end: null, allDay: true, title: e.title, location: e.location, memberId: cal.memberId, source: 'ics', calendar: cal.name, color: cal.color || colorFor(cal.memberId) });
        }
      } else {
        out.push({ id: `ics-${cal.id}-${e.start.toISOString()}-${e.title}`, date: ymd(e.start), start: hm(e.start), end: hm(e.end), title: e.title, location: e.location, memberId: cal.memberId, source: 'ics', calendar: cal.name, color: cal.color || colorFor(cal.memberId) });
      }
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || (a.start || '').localeCompare(b.start || '') || a.title.localeCompare(b.title));
  return out;
}

// ---------- weather ----------
let weatherCache = null;
const PARTS = [
  { key: 'morning', label: 'Morning', from: 6, to: 12 },
  { key: 'afternoon', label: 'Afternoon', from: 12, to: 17 },
  { key: 'evening', label: 'Evening', from: 17, to: 22 },
];
const WMO = { 0: ['Clear', '☀️'], 1: ['Mostly clear', '🌤️'], 2: ['Partly cloudy', '⛅'], 3: ['Cloudy', '☁️'], 45: ['Fog', '🌫️'], 48: ['Fog', '🌫️'],
  51: ['Drizzle', '🌦️'], 53: ['Drizzle', '🌦️'], 55: ['Drizzle', '🌦️'], 56: ['Freezing drizzle', '🌧️'], 57: ['Freezing drizzle', '🌧️'],
  61: ['Light rain', '🌧️'], 63: ['Rain', '🌧️'], 65: ['Heavy rain', '🌧️'], 66: ['Freezing rain', '🌧️'], 67: ['Freezing rain', '🌧️'],
  71: ['Light snow', '🌨️'], 73: ['Snow', '🌨️'], 75: ['Heavy snow', '❄️'], 77: ['Snow grains', '🌨️'], 80: ['Showers', '🌦️'], 81: ['Showers', '🌧️'], 82: ['Heavy showers', '⛈️'],
  85: ['Snow showers', '🌨️'], 86: ['Snow showers', '❄️'], 95: ['Thunderstorm', '⛈️'], 96: ['Thunderstorm', '⛈️'], 99: ['Thunderstorm', '⛈️'] };

function tipsFor(p, partLabel) {
  const part = partLabel.toLowerCase();
  const t = [];
  const snowy = [71, 73, 75, 77, 85, 86].includes(p.code) || (p.precip > 0.2 && p.tempMax <= 1);
  const wet = p.precipProb >= 50 || p.precip >= 0.5;
  const maybeWet = !wet && p.precipProb >= 30;
  if (snowy && (wet || maybeWet)) t.push(`Snow this ${part} — winter boots, hat and gloves`);
  else if (wet) t.push(`Rain this ${part} — bring an umbrella and rain jacket`);
  else if (maybeWet) t.push(`Might rain this ${part} — pack a rain jacket`);
  const feels = p.feelsMin;
  if (p.tempMin <= 0 || feels <= -3) t.push(`Freezing ${part} — warm jacket, hat and gloves`);
  else if (feels < 8) t.push(`Cold ${part} — wear layers and a warm jacket`);
  else if (feels < 14) t.push(`Cool ${part} — a sweater or light jacket`);
  else if (p.tempMax >= 18 && !wet && !maybeWet) t.push(`Warm and dry this ${part} — shorts are fine for football`);
  else if (!wet && !maybeWet) t.push(`Mild this ${part} — T-shirt plus a light jacket`);
  if (p.windMax >= 10) t.push(`Windy ${part} — wear a windproof jacket`);
  if (p.tempMax >= 20 && [0, 1].includes(p.code)) t.push(`Sunny — sunscreen and a cap`);
  return t;
}

// Combine identical tips across parts of the day: "Cold morning", "Cold evening" -> "Cold morning and evening"
function mergeTips(parts) {
  const groups = new Map();
  for (const p of parts) for (const t of p.tips) {
    const part = p.label.toLowerCase();
    const key = t.replace(new RegExp(`\\b${part}\\b`), '{p}');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(part);
  }
  return [...groups].map(([key, ps]) => {
    if (!key.includes('{p}')) return key;
    const label = ps.length === parts.length && parts.length > 1 ? 'all day' : listJoin(ps);
    if (label === 'all day') return key.replace(/this \{p\}/, 'all day').replace(/\{p\}/, 'all day').replace(/^(\w+) all day/, '$1 all day');
    return key.replace('{p}', label);
  });
}

// Providers: MET Norway Locationforecast 2.0 (primary, server-side only, cached, respects Expires /
// If-Modified-Since, max one refresh per 30 min) -> Open-Meteo (fallback) -> last good data (stale).
const WX_UA = process.env.WEATHER_USER_AGENT || 'FamilyHub/1.0 (https://family-pope.onrender.com) simpope@gmail.com';
const WX_MIN_REFRESH = 30 * 60 * 1000;
const WX_FORCE_MIN = 5 * 60 * 1000;
const metCache = { key: null, raw: null, lastModified: null, expires: 0, at: 0 };
const omCache = { key: null, raw: null, at: 0 };
let lastGoodWeather = null; // { key, data }
// MET symbol_code (without _day/_night/_polartwilight) -> WMO-style code used by the icons/descriptions above
const MET_SYMBOL = { clearsky: 0, fair: 1, partlycloudy: 2, cloudy: 3, fog: 45,
  lightrain: 61, rain: 63, heavyrain: 65, lightrainshowers: 80, rainshowers: 81, heavyrainshowers: 82,
  lightsleet: 66, sleet: 66, heavysleet: 67, lightsleetshowers: 80, sleetshowers: 81, heavysleetshowers: 82,
  lightsnow: 71, snow: 73, heavysnow: 75, lightsnowshowers: 85, snowshowers: 85, heavysnowshowers: 86 };
function metCode(sym) {
  if (!sym) return null;
  const s = String(sym).replace(/_(day|night|polartwilight)$/, '');
  if (s.includes('thunder')) return 95;
  return MET_SYMBOL[s] ?? null;
}
function localHourStr(iso, tz) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const o = Object.fromEntries(f.formatToParts(new Date(iso)).map(p => [p.type, p.value]));
  return `${o.year}-${o.month}-${o.day}T${o.hour}:${o.minute}`;
}
// Australian BoM apparent temperature (same formula Open-Meteo uses), used if MET omits apparent_air_temperature
function apparentT(t, rh, ws) { if (t == null) return null; if (rh == null || ws == null) return t; const e = rh / 100 * 6.105 * Math.exp(17.27 * t / (237.7 + t)); return t + 0.33 * e - 0.70 * ws - 4.0; }

async function fetchMet(lat, lon, force) {
  const key = `${lat},${lon}`;
  const now = Date.now();
  if (metCache.key === key && metCache.raw) {
    const due = Math.max(metCache.expires, metCache.at + WX_MIN_REFRESH);
    if (now < due && !(force && now - metCache.at >= WX_FORCE_MIN)) return metCache.raw;
  }
  const headers = { 'User-Agent': WX_UA, Accept: 'application/json' };
  if (metCache.key === key && metCache.lastModified) headers['If-Modified-Since'] = metCache.lastModified;
  const res = await fetch(`https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${lat}&lon=${lon}`, { headers, signal: AbortSignal.timeout(15000) });
  const exp = Date.parse(res.headers.get('expires') || '') || 0;
  if (res.status === 304 && metCache.raw) { metCache.at = now; metCache.expires = exp; return metCache.raw; }
  if (!res.ok) throw new Error(`MET Norway HTTP ${res.status}`);
  const raw = await res.json();
  if (!raw?.properties?.timeseries?.length) throw new Error('MET Norway: empty forecast');
  Object.assign(metCache, { key, raw, lastModified: res.headers.get('last-modified'), expires: exp, at: now });
  console.log(`[weather] MET Norway fetched ${key} (expires ${res.headers.get('expires')})`);
  return raw;
}
function metToHourly(raw, tz) {
  const H = { time: [], temperature_2m: [], apparent_temperature: [], precipitation_probability: [], precipitation: [], weather_code: [], wind_speed_10m: [] };
  for (const s of raw.properties.timeseries) {
    const n1 = s.data.next_1_hours;
    if (!n1) continue; // hourly steps only (covers today + tomorrow)
    const d = s.data.instant?.details || {};
    H.time.push(localHourStr(s.time, tz));
    H.temperature_2m.push(d.air_temperature ?? null);
    H.apparent_temperature.push(d.apparent_air_temperature ?? apparentT(d.air_temperature, d.relative_humidity, d.wind_speed));
    H.precipitation_probability.push(n1.details?.probability_of_precipitation != null ? Math.round(n1.details.probability_of_precipitation) : (n1.details?.precipitation_amount > 0 ? 50 : 0));
    H.precipitation.push(n1.details?.precipitation_amount ?? 0);
    H.weather_code.push(metCode(n1.summary?.symbol_code));
    H.wind_speed_10m.push(d.wind_speed ?? null);
  }
  const first = raw.properties.timeseries[0];
  const cur = { temperature_2m: first.data.instant?.details?.air_temperature, weather_code: metCode((first.data.next_1_hours || first.data.next_6_hours)?.summary?.symbol_code) };
  return { hourly: H, current: cur };
}
async function fetchOpenMeteo(lat, lon, tz, force) {
  const key = `${lat},${lon}`;
  if (!force && omCache.key === key && omCache.raw && Date.now() - omCache.at < WX_MIN_REFRESH) return omCache.raw;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m` +
    `&current=temperature_2m,weather_code&wind_speed_unit=ms&timezone=${encodeURIComponent(tz)}&forecast_days=3`;
  const res = await fetch(url, { headers: { 'User-Agent': WX_UA }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const raw = await res.json();
  Object.assign(omCache, { key, raw, at: Date.now() });
  return raw;
}
function buildWeather(j, loc, provider) {
  const H = j.hourly;
  const days = [];
  const today = new Date();
  for (let i = 0; i < 2; i++) {
    const date = ymd(addDays(today, i));
    const parts = PARTS.map(P => {
      const idx = H.time.map((t, k) => [t, k]).filter(([t]) => t.startsWith(date) && +t.slice(11, 13) >= P.from && +t.slice(11, 13) < P.to).map(([, k]) => k);
      if (!idx.length) return null;
      const pick = a => idx.map(k => a[k]).filter(v => v != null);
      const codes = pick(H.weather_code);
      const code = codes.reduce((a, b) => (b > a ? b : a), 0); // most "severe" code in the window
      const p = {
        key: P.key, label: P.label,
        tempMin: Math.round(Math.min(...pick(H.temperature_2m))), tempMax: Math.round(Math.max(...pick(H.temperature_2m))),
        feelsMin: Math.round(Math.min(...pick(H.apparent_temperature))),
        precipProb: Math.max(0, ...pick(H.precipitation_probability)),
        precip: Math.round(pick(H.precipitation).reduce((a, b) => a + b, 0) * 10) / 10,
        windMax: Math.round(Math.max(...pick(H.wind_speed_10m))),
        code, summary: (WMO[code] || ['—'])[0], icon: (WMO[code] || ['', '🌡️'])[1],
      };
      p.tips = tipsFor(p, P.label);
      return p;
    }).filter(Boolean);
    days.push({ date, parts, tips: mergeTips(parts) });
  }
  return { location: loc, current: { temp: Math.round(j.current?.temperature_2m), code: j.current?.weather_code, icon: (WMO[j.current?.weather_code] || ['', '🌡️'])[1], summary: (WMO[j.current?.weather_code] || ['—'])[0] }, days, provider, fetchedAt: new Date().toISOString() };
}
async function getWeather(force = false) {
  const loc = DATA.settings.location;
  const tz = DATA.settings.timezone || 'Europe/Oslo';
  const lat = Number(loc.latitude).toFixed(4).replace(/\.?0+$/, ''), lon = Number(loc.longitude).toFixed(4).replace(/\.?0+$/, '');
  const key = `${lat},${lon}`;
  const errors = [];
  try {
    const raw = await fetchMet(lat, lon, force);
    const data = buildWeather(metToHourly(raw, tz), loc, 'MET Norway');
    data.fetchedAt = new Date(metCache.at).toISOString();
    lastGoodWeather = { key, data };
    return data;
  } catch (e) { errors.push(String(e.message || e)); console.warn('[weather] MET failed:', e.message || e); }
  try {
    const raw = await fetchOpenMeteo(lat, lon, tz, force);
    const data = buildWeather(raw, loc, 'Open-Meteo');
    data.fetchedAt = new Date(omCache.at).toISOString();
    lastGoodWeather = { key, data };
    return data;
  } catch (e) { errors.push(String(e.message || e)); console.warn('[weather] Open-Meteo failed:', e.message || e); }
  // Both down: serve last cached data rather than "unavailable" (rebuilt from cached raw if possible so dates stay current)
  if (metCache.key === key && metCache.raw) return { ...buildWeather(metToHourly(metCache.raw, tz), loc, 'MET Norway'), fetchedAt: new Date(metCache.at).toISOString(), stale: true };
  if (lastGoodWeather && lastGoodWeather.key === key) return { ...lastGoodWeather.data, stale: true };
  throw new Error(errors.join('; '));
}

// ---------- reminders (travel, meals, birthdays) ----------
function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function matchAny(text, words) {
  return words.find(w => new RegExp(`(^|[^\\p{L}\\p{N}])${escRe(w)}($|[^\\p{L}\\p{N}])`, 'iu').test(text));
}
const listJoin = a => a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];

async function getReminders() {
  const cfg = loadTravel();
  const todayStr = ymd(new Date());
  const today = parseYmd(todayStr);
  const out = [];
  // Travel
  const evs = await getEvents(todayStr, cfg.lookaheadDays || 7);
  const seenTitle = new Set(); // multi-day events: only remind on the first day
  const byKey = new Map();     // one travel reminder per person per day (flights win over generic trips)
  const homeWords = [...(cfg.homeWords || []), DATA.settings.location?.name].filter(Boolean);
  for (const e of evs) {
    if (e.source === 'school') continue;
    const text = `${e.title} ${e.location || ''}`;
    const flight = matchAny(text, cfg.flightKeywords || []);
    let dest = matchAny(text, cfg.destinations || []);
    const trip = matchAny(text, cfg.travelKeywords || []);
    if (!flight && !dest && !trip) continue;
    const tk = `${e.memberId}|${e.title.trim().toLowerCase()}`;
    if (seenTitle.has(tk)) continue; seenTitle.add(tk);
    // "Flight to X": the place after "to" is the destination; if it is home, it's a return trip
    const toMatch = e.title.match(/\bto\s+([^()\-—,|]+)/i);
    const toPlace = toMatch ? toMatch[1].trim() : '';
    const goingHome = !!(toPlace && matchAny(toPlace, homeWords));
    if (!goingHome && toPlace) dest = matchAny(toPlace, cfg.destinations || []) || dest;
    const fromPlace = goingHome ? (matchAny(text.replace(toMatch[0], ''), cfg.destinations || []) || '') : '';
    const d = parseYmd(e.date);
    const diff = Math.round((d - today) / 86400000);
    const when = diff === 0 ? 'today' : diff === 1 ? 'tomorrow' : `on ${DAY_NAMES[d.getDay()].slice(0, 3)}`;
    const who = memberById(e.memberId)?.name;
    let items, msg;
    if (goingHome) {
      items = cfg.returnChecklist || ['passport'];
      msg = `${flight ? 'Flying' : 'Travelling'} home${fromPlace ? ' from ' + fromPlace : ''} ${when}${e.start ? ' at ' + e.start : ''} — remember ${listJoin(items)}`;
    } else {
      items = [...(dest || flight ? cfg.checklist : cfg.checklist.filter(x => x !== 'passport')), ...(flight ? cfg.flightChecklist || [] : [])];
      msg = `${flight ? 'Flying' : 'Travelling'}${dest ? ' to ' + dest : ''} ${when}${e.start ? ' at ' + e.start : ''} — remember ${listJoin(items)}`;
    }
    const r = { type: 'travel', icon: flight ? '✈️' : '🧳', date: e.date, memberId: e.memberId, color: e.color, flight: !!flight, text: `${who ? who + ': ' : ''}${msg}` };
    const key = `${e.memberId}|${e.date}`;
    const prev = byKey.get(key);
    if (!prev || (r.flight && !prev.flight)) byKey.set(key, r);
  }
  out.push(...byKey.values());
  // Manual / imported reminders: shown from (date - daysBefore) until (until || date)
  for (const r of DATA.reminders) {
    const showFrom = ymd(addDays(parseYmd(r.date), -(r.daysBefore ?? 1)));
    if (todayStr < showFrom || todayStr > (r.until || r.date)) continue;
    const m = memberById(r.memberId);
    out.push({ type: 'note', icon: '📌', date: r.date, memberId: r.memberId, color: m?.color, text: `${m ? m.name + ': ' : ''}${r.text}` });
  }
  // Meals not bought (today + next 6 days)
  for (let i = 0; i < 7; i++) {
    const ds = ymd(addDays(today, i));
    const m = DATA.meals[ds];
    if (!m || !m.dinner || m.bought) continue;
    const dn = i === 0 ? 'Tonight' : i === 1 ? 'Tomorrow' : DAY_NAMES[addDays(today, i).getDay()];
    out.push({ type: 'meal', icon: '🛒', date: ds, text: `${dn} is ${m.dinner.replace(/^EXAMPLE:\s*/i, '').toLowerCase()} — have you bought the food?` });
  }
  // Birthdays
  for (const b of upcomingBirthdays(DATA.settings.birthdayReminderDays ?? 5)) {
    const when = b.inDays === 0 ? 'today' : b.inDays === 1 ? 'tomorrow' : `in ${b.inDays} days`;
    out.push({ type: 'birthday', icon: '🎂', date: b.date, memberId: b.memberId, color: b.color,
      text: b.inDays === 0 ? `Happy birthday ${b.name}${b.turns ? ` — ${b.turns} today` : ''}! 🎉` : `${b.name}'s birthday ${when}${b.turns ? ` (turns ${b.turns})` : ''} — sort out a present?` });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// ---------- school plan import (data/school-import/*.json) ----------
const IMPORT_DIR = path.join(DATA_DIR, 'school-import');
function listImports() {
  if (!fs.existsSync(IMPORT_DIR)) return [];
  return fs.readdirSync(IMPORT_DIR).filter(f => f.endsWith('.json')).map(f => {
    const j = JSON.parse(fs.readFileSync(path.join(IMPORT_DIR, f), 'utf8'));
    return { file: f, title: j.title, weekStart: j.weekStart, classes: Object.keys(j.classes || {}), groups: Object.keys(j.groups || {}) };
  });
}
function applyImport({ file, memberId, classId, group, includeBreaks }) {
  if (!/^[\w.-]+\.json$/.test(file || '')) throw new Error('bad file name');
  const plan = JSON.parse(fs.readFileSync(path.join(IMPORT_DIR, file), 'utf8'));
  const mem = memberById(memberId);
  if (!mem) throw new Error('unknown member');
  if (classId === undefined) classId = mem.schoolClass || null;   // default to the class saved in the profile
  if (group === undefined) group = mem.schoolGroup || null;
  const wk = plan.weekStart;
  let sched = JSON.parse(JSON.stringify(classId ? plan.classes?.[classId] : plan.commonSchedule));
  if (!sched) throw new Error(`class ${classId} not in plan`);
  for (const [day, lessons] of Object.entries(sched)) {
    sched[day] = lessons.filter(l => includeBreaks || !/\((Lillefri)\)/.test(l.title)).map(l => {
      if (group && plan.groups?.[group]?.[day] && /depends on group/i.test(l.title) && l.start === '09:15') return { ...l, title: `${plan.groups[group][day]} (group ${group})` };
      return l;
    });
  }
  DATA.school[wk] ||= {};
  DATA.school[wk][memberId] = sched;
  DATA.schoolMeta[wk] ||= {};
  DATA.schoolMeta[wk][memberId] = { file, classId: classId || null, group: group || null, appliedAt: new Date().toISOString() };
  if (plan.homework || plan.goals) {
    DATA.schoolNotes[wk] ||= {};
    DATA.schoolNotes[wk][memberId] = [plan.homework && `Homework (${plan.title}):\n${plan.homework}`, plan.goals && `Goals this week: ${plan.goals}`].filter(Boolean).join('\n\n');
  }
  // events & reminders are idempotent: keyed by import file + index
  for (const [i, e] of (plan.events || []).entries()) {
    const key = `${file}#e${i}#${memberId}`;
    DATA.events = DATA.events.filter(x => x.importKey !== key);
    DATA.events.push({ id: uid(), importKey: key, date: e.date, endDate: e.endDate || null, start: e.start || null, end: e.end || null, allDay: !!e.allDay, title: e.title, location: e.location || '', memberId });
  }
  DATA.reminders = DATA.reminders.filter(x => !(x.importKey || '').startsWith(`${file}#r`) || !x.importKey.endsWith(`#${memberId}`));
  for (const [i, r] of (plan.reminders || []).entries()) {
    if (group && r.groups && !r.groups.includes(String(group))) continue; // gym-group specific
    const key = `${file}#r${i}#${memberId}`;
    DATA.reminders.push({ id: uid(), importKey: key, date: r.date, until: r.until || null, daysBefore: r.daysBefore ?? 1, text: r.text, memberId });
  }
  saveData();
  return { week: wk, memberId, classId: classId || null, group: group || null, days: Object.keys(sched) };
}

// ---------- auth (one family password, signed long-lived cookie) ----------
// AUTH_JSON env / auth.json Secret File / config/auth.json, or AUTH_SALT + AUTH_HASH + SESSION_SECRET env vars.
const AUTH = (() => {
  if (process.env.AUTH_HASH && process.env.AUTH_SALT && process.env.SESSION_SECRET)
    return { salt: process.env.AUTH_SALT, hash: process.env.AUTH_HASH, sessionSecret: process.env.SESSION_SECRET, sessionDays: Number(process.env.SESSION_DAYS) || 365 };
  const a = readPrivate('AUTH_JSON', 'auth.json', AUTH_FILE);
  return a ? JSON.parse(a.text) : null;
})();
// Never run unprotected on a public host: on Render (RENDER=true) or with REQUIRE_AUTH=1, missing auth is fatal.
if (!AUTH && (process.env.RENDER || process.env.REQUIRE_AUTH === '1')) {
  console.error('FATAL: no password configured (set AUTH_JSON, or AUTH_SALT/AUTH_HASH/SESSION_SECRET, or add an auth.json Secret File). Refusing to start without a login.');
  process.exit(1);
}
const COOKIE = 'fh_session';
const sign = v => crypto.createHmac('sha256', AUTH.sessionSecret).update(v).digest('base64url');
function makeSession() { const exp = Date.now() + (AUTH.sessionDays || 365) * 86400000; const v = `v1.${exp}`; return `${v}.${sign(v)}`; }
function isAuthed(req) {
  if (!AUTH) return true; // no auth.json = auth disabled (local dev)
  const m = (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return false;
  const [ver, exp, sig] = m[1].split('.');
  if (ver !== 'v1' || !exp || !sig || Number(exp) < Date.now()) return false;
  const good = sign(`${ver}.${exp}`);
  return sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
}
function checkPassword(pw) {
  const h = crypto.scryptSync(String(pw || ''), AUTH.salt, 64);
  return crypto.timingSafeEqual(h, Buffer.from(AUTH.hash, 'hex'));
}
const failures = new Map(); // ip -> { n, until }
const clientIp = req => req.headers['cf-connecting-ip'] || (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
const isHttps = req => req.headers['x-forwarded-proto'] === 'https' || !!req.headers['cf-visitor']?.includes('https');
function cookieHeader(req, value, maxAge) { return `${COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${isHttps(req) ? '; Secure' : ''}`; }
// Files anyone may load (login page, PWA manifest, icons)
const PUBLIC_PATHS = new Set(['/login', '/login.html', '/manifest.webmanifest', '/apple-touch-icon.png', '/apple-touch-icon-precomposed.png', '/favicon.png', '/favicon.ico']);

// ---------- HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(type === 'application/json' ? JSON.stringify(body) : body); };
const readBody = req => new Promise((ok, bad) => { let b = ''; req.on('data', c => { b += c; if (b.length > 5e6) req.destroy(); }); req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { bad(e); } }); });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function publicCalendar(c) {
  let host = ''; try { host = new URL(c.url.replace(/^webcal:/i, 'https:')).host; } catch {}
  const { url, ...rest } = c; return { ...rest, urlHint: `${host} (link hidden)` };
}
async function api(req, res, url) {
  const p = url.pathname, q = url.searchParams, M = req.method;
  if (p === '/api/state' && M === 'GET') return send(res, 200, { ...DATA, calendars: DATA.calendars.map(publicCalendar), members: publicMembers(), today: ymd(new Date()), calendarStatus: Object.fromEntries([...icsCache].map(([k, v]) => [k, { error: v.error, count: v.count, fetchedAt: v.fetchedAt }])) });
  if (p === '/api/events' && M === 'GET') return send(res, 200, await getEvents(q.get('start') || ymd(new Date()), Math.min(62, Number(q.get('days')) || 7)));
  if (p === '/api/weather' && M === 'GET') {
    try { return send(res, 200, await getWeather(q.get('refresh') === '1')); } catch (e) { return send(res, 502, { error: String(e.message || e) }); }
  }
  if (p === '/api/reminders' && M === 'GET') return send(res, 200, await getReminders());
  if (p === '/api/birthdays' && M === 'GET') return send(res, 200, upcomingBirthdays(Number(q.get('days')) || DATA.settings.birthdayListDays || 60));
  if (p === '/api/today' && M === 'GET') { // everything the kitchen screen needs in one call
    const today = ymd(new Date());
    const [events, reminders] = await Promise.all([getEvents(today, 1), getReminders()]);
    let weather = null; try { weather = await getWeather(); } catch (e) { weather = { error: String(e.message || e) }; }
    return send(res, 200, { today, members: publicMembers(), settings: DATA.settings, events, reminders, weather, meal: DATA.meals[today] || null, tomorrowMeal: DATA.meals[ymd(addDays(new Date(), 1))] || null, birthdays: upcomingBirthdays(DATA.settings.birthdayListDays || 60) });
  }
  if (p === '/api/geocode' && M === 'GET') {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q.get('q') || '')}&count=8&language=en&format=json`, { signal: AbortSignal.timeout(10000) });
    const j = await r.json();
    return send(res, 200, (j.results || []).map(x => ({ name: x.name, country: x.country, admin1: x.admin1, latitude: x.latitude, longitude: x.longitude, timezone: x.timezone })));
  }
  if (M === 'GET' && p === '/api/school-import') return send(res, 200, listImports());
  if (M === 'POST' && p === '/api/school-import/apply') { try { return send(res, 200, applyImport(await readBody(req))); } catch (e) { return send(res, 400, { error: String(e.message || e) }); } }
  if (M === 'GET' && p === '/api/school-import/plan') { const f = q.get('file') || ''; if (!/^[\w.-]+\.json$/.test(f)) return send(res, 400, {}); return send(res, 200, JSON.parse(fs.readFileSync(path.join(IMPORT_DIR, f), 'utf8'))); }
  if (M === 'GET' && p === '/api/travel-config') return send(res, 200, loadTravel());
  // Full data backup (behind the login). Paste the result into FAMILY_DATA_JSON / family-data.json to keep edits after a restart.
  if (M === 'GET' && p === '/api/export') { res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="family-data-${ymd(new Date())}.json"`, 'Cache-Control': 'no-store' }); return res.end(JSON.stringify(DATA, null, 2)); }
  if (M === 'PUT' && p === '/api/travel-config') { const b = await readBody(req); fs.writeFileSync(TRAVEL_FILE, JSON.stringify(b, null, 2)); return send(res, 200, b); }

  // --- mutations ---
  if (M === 'PUT' && p === '/api/settings') { const b = await readBody(req); DATA.settings = { ...DATA.settings, ...b }; if (b.location) { weatherCache = null; metCache.key = null; omCache.key = null; lastGoodWeather = null; } saveData(); return send(res, 200, DATA.settings); }
  if (M === 'PUT' && p === '/api/members') { const b = await readBody(req); if (!Array.isArray(b)) return send(res, 400, { error: 'array expected' }); DATA.members = b.map(m => ({ ...m, ageNow: undefined, id: m.id || uid(), name: m.name || 'Name', role: m.role || '', color: m.color || '#8a94a6', birthday: m.birthday || '', age: m.age === '' || m.age == null ? null : Number(m.age), away: !!m.away, notes: m.notes || '', schoolClass: m.schoolClass || '', schoolGroup: m.schoolGroup || '' })); saveData(); return send(res, 200, publicMembers()); }
  let m;
  if (M === 'POST' && (m = p.match(/^\/api\/members\/([^/]+)\/away$/))) { const mem = memberById(m[1]); if (!mem) return send(res, 404, { error: 'no member' }); const b = await readBody(req); mem.away = b.away ?? !mem.away; saveData(); return send(res, 200, mem); }
  if (M === 'PUT' && (m = p.match(/^\/api\/school-notes\/(\d{4}-\d{2}-\d{2})\/([^/]+)$/))) { const b = await readBody(req); DATA.schoolNotes[m[1]] ||= {}; if (b.text) DATA.schoolNotes[m[1]][m[2]] = b.text; else delete DATA.schoolNotes[m[1]][m[2]]; saveData(); return send(res, 200, { ok: true }); }
  if (M === 'POST' && p === '/api/notes') { const b = await readBody(req); const r = { id: uid(), date: b.date, until: b.until || null, daysBefore: Number(b.daysBefore ?? 1), text: b.text, memberId: b.memberId || 'family' }; DATA.reminders.push(r); saveData(); return send(res, 200, r); }
  if (M === 'DELETE' && (m = p.match(/^\/api\/notes\/([^/]+)$/))) { DATA.reminders = DATA.reminders.filter(r => r.id !== m[1]); saveData(); return send(res, 200, { ok: true }); }
  if (M === 'POST' && p === '/api/events') { const b = await readBody(req); const e = { id: uid(), date: b.date, endDate: b.endDate || null, start: b.start || null, end: b.end || null, title: b.title || '(untitled)', location: b.location || '', memberId: b.memberId || 'family' }; DATA.events.push(e); saveData(); return send(res, 200, e); }
  if (M === 'DELETE' && (m = p.match(/^\/api\/events\/([^/]+)$/))) { DATA.events = DATA.events.filter(e => e.id !== m[1]); saveData(); return send(res, 200, { ok: true }); }
  if (M === 'PUT' && (m = p.match(/^\/api\/school\/(\d{4}-\d{2}-\d{2})$/))) { const b = await readBody(req); if (b && Object.keys(b).length) DATA.school[m[1]] = b; else delete DATA.school[m[1]]; saveData(); return send(res, 200, b); }
  if (M === 'POST' && (m = p.match(/^\/api\/school\/(\d{4}-\d{2}-\d{2})\/copy-last-week$/))) {
    const prev = ymd(addDays(parseYmd(m[1]), -7));
    if (!DATA.school[prev]) return send(res, 404, { error: 'No school calendar saved for last week' });
    DATA.school[m[1]] = JSON.parse(JSON.stringify(DATA.school[prev])); saveData(); return send(res, 200, DATA.school[m[1]]);
  }
  if (M === 'PUT' && (m = p.match(/^\/api\/meals\/(\d{4}-\d{2}-\d{2})$/))) {
    const b = await readBody(req);
    const cur = DATA.meals[m[1]] || { dinner: '', bought: false };
    const next = { ...cur, ...b }; if (b.dinner !== undefined && b.dinner !== cur.dinner) delete next.example;
    if (!next.dinner) delete DATA.meals[m[1]]; else DATA.meals[m[1]] = next;
    saveData(); return send(res, 200, DATA.meals[m[1]] || null);
  }
  if (M === 'POST' && p === '/api/calendars') {
    const b = await readBody(req);
    if (!/^(https?|webcal):\/\//i.test(b.url || '')) return send(res, 400, { error: 'Please paste a full https:// or webcal:// ICS link' });
    const cal = { id: uid(), name: b.name || 'Calendar', url: b.url.trim(), memberId: b.memberId || 'family', color: b.color || '', enabled: true };
    const ics = await getIcs(cal, true);
    if (ics.error) { icsCache.delete(cal.id); return send(res, 400, { error: `Could not load that calendar: ${ics.error}` }); }
    DATA.calendars.push(cal); saveData(); return send(res, 200, { ...publicCalendar(cal), count: ics.count });
  }
  if (M === 'PUT' && (m = p.match(/^\/api\/calendars\/([^/]+)$/))) { const b = await readBody(req); const c = DATA.calendars.find(c => c.id === m[1]); if (!c) return send(res, 404, {}); delete b.url; Object.assign(c, b, { id: c.id }); icsCache.delete(c.id); saveData(); return send(res, 200, publicCalendar(c)); }
  if (M === 'DELETE' && (m = p.match(/^\/api\/calendars\/([^/]+)$/))) { DATA.calendars = DATA.calendars.filter(c => c.id !== m[1]); icsCache.delete(m[1]); saveData(); return send(res, 200, { ok: true }); }
  if (M === 'POST' && p === '/api/calendars/refresh') { await Promise.all(DATA.calendars.map(c => getIcs(c, true))); return send(res, 200, Object.fromEntries([...icsCache].map(([k, v]) => [k, { error: v.error, count: v.count }]))); }
  if (M === 'POST' && p === '/api/clear-examples') {
    const isEx = x => x.example || /^EXAMPLE:/i.test(x.title || x.dinner || '');
    DATA.events = DATA.events.filter(e => !isEx(e));
    for (const [k, v] of Object.entries(DATA.meals)) if (isEx(v)) delete DATA.meals[k];
    for (const [wk, byMember] of Object.entries(DATA.school)) {
      for (const [mid, byDay] of Object.entries(byMember)) { for (const d of Object.keys(byDay)) { byDay[d] = byDay[d].filter(l => !isEx(l)); if (!byDay[d].length) delete byDay[d]; } if (!Object.keys(byDay).length) delete byMember[mid]; }
      if (!Object.keys(byMember).length) delete DATA.school[wk];
    }
    saveData(); return send(res, 200, { ok: true });
  }
  return send(res, 404, { error: 'Not found' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    const pth = url.pathname;
    if (pth === '/healthz') return send(res, 200, 'ok', 'text/plain'); // Render health check, no data
    if (pth === '/api/login' && req.method === 'POST') {
      if (!AUTH) return send(res, 200, { ok: true });
      const ip = clientIp(req), f = failures.get(ip);
      if (f && f.n >= 10 && f.until > Date.now()) return send(res, 429, { error: 'Too many attempts — try again in 15 minutes' });
      const b = await readBody(req).catch(() => ({}));
      if (!checkPassword(b.password)) { const n = (f && f.until > Date.now() ? f.n : 0) + 1; failures.set(ip, { n, until: Date.now() + 15 * 60000 }); return send(res, 401, { error: 'Wrong password' }); }
      failures.delete(ip);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': cookieHeader(req, makeSession(), (AUTH.sessionDays || 365) * 86400), 'Cache-Control': 'no-store' });
      return res.end('{"ok":true}');
    }
    if (pth === '/logout' || pth === '/api/logout') { res.writeHead(302, { Location: '/login', 'Set-Cookie': cookieHeader(req, '', 0) }); return res.end(); }
    if (!PUBLIC_PATHS.has(pth) && !pth.startsWith('/icons/') && !isAuthed(req)) {
      if (pth.startsWith('/api/')) return send(res, 401, { error: 'Not signed in' });
      if (/\.(js|css|json|png|ico|svg)$/.test(pth)) return send(res, 401, 'Not signed in', 'text/plain');
      res.writeHead(302, { Location: '/login?next=' + encodeURIComponent(pth + url.search), 'Cache-Control': 'no-store' }); return res.end();
    }
    if (pth.startsWith('/api/')) return await api(req, res, url);
    let file = pth === '/' ? '/index.html' : pth === '/kitchen' ? '/kitchen.html' : pth === '/login' ? '/login.html' : pth === '/apple-touch-icon-precomposed.png' ? '/apple-touch-icon.png' : pth === '/favicon.ico' ? '/favicon.png' : pth;
    const fp = path.normalize(path.join(PUBLIC, file));
    if (!fp.startsWith(PUBLIC)) return send(res, 403, 'Forbidden', 'text/plain');
    fs.readFile(fp, (err, buf) => {
      if (err) return send(res, 404, 'Not found', 'text/plain');
      res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(buf);
    });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: String(e.message || e) });
  }
});
server.listen(PORT, '0.0.0.0', () => console.log(`Family Hub running on http://localhost:${PORT}  (kitchen screen: http://localhost:${PORT}/kitchen)`));
