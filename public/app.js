// Family Hub frontend — plain JS, no build step. Each tab is a render function.
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const api = async (path, opts = {}) => {
  const r = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  if (r.status === 401) { location.href = '/login?next=' + encodeURIComponent(location.pathname + location.hash); throw new Error('Not signed in'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
};
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mondayOf = d => addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -((d.getDay() + 6) % 7));
const WD = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WD_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const fmtDay = d => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const isExample = t => /^EXAMPLE:/i.test(t || '');

let S = null;                // state from server
let tab = location.hash.slice(1) || 'home';
let weekStart = mondayOf(new Date());
let schoolWeek = mondayOf(new Date());
let schoolKid = null;
let mealWeek = mondayOf(new Date());

const member = id => S.members.find(m => m.id === id);
const memberName = id => id === 'family' ? 'Everyone' : (member(id)?.name || id);
const memberOptions = (sel, withFamily = true) => (withFamily ? `<option value="family" ${sel === 'family' ? 'selected' : ''}>Everyone</option>` : '') + S.members.map(m => `<option value="${m.id}" ${m.id === sel ? 'selected' : ''}>${esc(m.name)}</option>`).join('');

async function load() { S = await api('/api/state'); }
async function render() {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const v = $('#view');
  try { await ({ home, week, school, meals, calendars, settings }[tab] || home)(v); }
  catch (e) { v.innerHTML = `<div class="card">Something went wrong: ${esc(e.message)}</div>`; console.error(e); }
}
$('#tabs').addEventListener('click', e => { const t = e.target.dataset.tab; if (!t) return; tab = t; location.hash = t; render(); });

function eventRow(e) {
  const time = e.allDay || !e.start ? 'All day' : `${e.start}${e.end ? '–' + e.end : ''}`;
  const src = e.source === 'school' ? '<span class="tag">school</span>' : e.source === 'ics' ? `<span class="tag">${esc(e.calendar)}</span>` : '';
  const ex = e.example || isExample(e.title) ? '<span class="tag example">example</span>' : '';
  const del = e.source === 'manual' ? `<button class="btn sm danger" data-del-event="${e.id}" title="Delete">✕</button>` : '';
  const m = member(e.memberId);
  return `<div class="event ${m?.away ? 'away' : ''}"><div class="bar" style="background:${e.color}"></div><div class="time">${time}</div>
    <div style="flex:1"><div class="title">${esc(e.title.replace(/^EXAMPLE:\s*/i, ''))}${src}${ex}</div>
    <div class="small muted">${esc(memberName(e.memberId))}${m?.away ? ' (away)' : ''}${e.location ? ' · ' + esc(e.location) : ''}</div></div>${del}</div>`;
}
function bindEventDeletes(root) {
  root.querySelectorAll('[data-del-event]').forEach(b => b.onclick = async () => { if (!confirm('Delete this event?')) return; await api('/api/events/' + b.dataset.delEvent, { method: 'DELETE' }); render(); });
}
function addEventForm(defaultDate) {
  return `<div class="card"><h2>➕ Add an event</h2><form id="addEvent" class="row">
    <input type="date" name="date" value="${defaultDate}" required>
    <input type="time" name="start"> <span class="muted">to</span> <input type="time" name="end">
    <input name="title" placeholder="What? e.g. Flight to London" required style="flex:1;min-width:180px">
    <input name="location" placeholder="Where? (optional)">
    <select name="memberId">${memberOptions('family')}</select>
    <button class="btn primary">Add</button></form>
    <p class="small muted">Tip: words like "flight", "airport" or a country/city (e.g. England, London) trigger a passport reminder.</p></div>`;
}
function bindAddEvent(root) {
  const f = $('#addEvent', root); if (!f) return;
  f.onsubmit = async e => { e.preventDefault(); await api('/api/events', { method: 'POST', body: Object.fromEntries(new FormData(f)) }); render(); };
}
function weatherCard(w) {
  if (!w || w.error) return `<div class="card"><h2>🌦️ Weather</h2><p class="muted">Weather unavailable${w?.error ? ': ' + esc(w.error) : ''}</p></div>`;
  const d = w.days[0];
  const kid = member(S.settings.tipsForMemberId);
  return `<div class="card"><h2>🌦️ Weather in ${esc(w.location.name)} — now ${w.current.icon} ${w.current.temp}°</h2>
  ${w.location.isDefault ? '<p class="small muted">Using Oslo as default — set your town in Settings.</p>' : ''}
  <div class="weather-parts">${d.parts.map(p => `<div class="wpart"><div class="muted small">${p.label}</div><div class="big">${p.icon} ${p.tempMin === p.tempMax ? p.tempMax : p.tempMin + '–' + p.tempMax}°</div>
  <div class="small muted">${esc(p.summary)} · rain ${p.precipProb}% · wind ${p.windMax} m/s</div>
  <ul class="small">${p.tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>`).join('')}</div>
  ${kid ? `<p class="small muted">Clothing tips are written for ${esc(kid.name)} (change in Settings).</p>` : ''}</div>`;
}
function remindersHtml(list) {
  if (!list.length) return '<p class="muted">Nothing to remember right now 🎉</p>';
  return list.map(r => `<div class="reminder ${r.type}"><span>${r.icon}</span><span>${esc(r.text)}</span></div>`).join('');
}
function birthdaysHtml(list) {
  if (!list.length) return '<p class="muted">No birthdays in the next couple of months. Add birthdays in Settings.</p>';
  return list.map(b => `<div class="event"><div class="bar" style="background:${b.color}"></div><div class="time">${fmtDay(parseYmd(b.date))}</div>
   <div><div class="title">🎂 ${esc(b.name)}${b.turns ? ' turns ' + b.turns : ''}</div><div class="small muted">${b.inDays === 0 ? 'Today!' : b.inDays === 1 ? 'Tomorrow' : 'in ' + b.inDays + ' days'}</div></div></div>`).join('');
}
function awayToggles() {
  return `<div class="row">${S.members.map(m => `<button class="btn sm" data-away="${m.id}" title="Toggle home/away" style="border-color:${m.color}">
   <span class="dot" style="background:${m.color}"></span> ${esc(m.name)}${m.ageNow != null ? ` (${m.ageNow})` : ''} · ${m.away ? '🚪 Away' : '🏠 Home'}</button>`).join('')}</div>
   <p class="small muted">Tap a name to mark them away/home. Away people are ${S.settings.hideAwayOnKitchen ? 'hidden on' : 'greyed out on'} the kitchen screen.</p>`;
}
function bindAway(root) {
  root.querySelectorAll('[data-away]').forEach(b => b.onclick = async () => { await api(`/api/members/${b.dataset.away}/away`, { method: 'POST', body: {} }); await load(); render(); });
}

// ---------- Home ----------
async function home(v) {
  const today = S.today;
  const [events, reminders, weather, bdays] = await Promise.all([
    api(`/api/events?start=${today}&days=2`), api('/api/reminders'), api('/api/weather').catch(e => ({ error: e.message })), api('/api/birthdays'),
  ]);
  const tdy = events.filter(e => e.date === today), tmr = events.filter(e => e.date !== today);
  const meal = S.meals[today];
  v.innerHTML = `
  ${S.settings.location.isDefault ? `<div class="banner">📍 Weather is showing <b>Oslo</b> by default. <a href="#settings" onclick="tab='settings';render()">Set your town in Settings</a>.</div>` : ''}
  <div class="card"><h2>👨‍👩‍👧‍👦 Who's home</h2>${awayToggles()}</div>
  <div class="grid">
    <div>
      <div class="card"><h2>📅 Today — ${fmtDay(parseYmd(today))}</h2>${tdy.map(eventRow).join('') || '<p class="muted">Nothing planned today.</p>'}</div>
      <div class="card"><h2>Tomorrow</h2>${tmr.map(eventRow).join('') || '<p class="muted">Nothing planned tomorrow.</p>'}</div>
    </div>
    <div>
      <div class="card"><h2>🔔 Reminders</h2>${remindersHtml(reminders)}</div>
      <div class="card"><h2>🍽️ Dinner tonight</h2>${meal ? `<div class="row"><b style="font-size:18px">${esc(meal.dinner.replace(/^EXAMPLE:\s*/i, ''))}</b>${meal.example ? '<span class="tag example">example</span>' : ''}
        <span style="margin-left:auto">Food bought?</span> ${boughtToggle(today, meal.bought)}</div>` : '<p class="muted">No dinner planned — add one under Meals.</p>'}</div>
      <div class="card"><h2>🎂 Upcoming birthdays</h2>${birthdaysHtml(bdays)}</div>
    </div>
  </div>
  ${weatherCard(weather)}
  ${addEventForm(today)}`;
  bindEventDeletes(v); bindAddEvent(v); bindAway(v); bindBought(v);
}
function boughtToggle(date, bought) {
  return `<span class="toggle" data-meal="${date}"><button class="${bought ? 'on yes' : ''}" data-b="1">Yes</button><button class="${!bought ? 'on no' : ''}" data-b="0">No</button></span>`;
}
function bindBought(root) {
  root.querySelectorAll('[data-meal]').forEach(t => t.querySelectorAll('button').forEach(b => b.onclick = async () => {
    await api('/api/meals/' + t.dataset.meal, { method: 'PUT', body: { bought: b.dataset.b === '1' } }); await load(); render();
  }));
}

// ---------- Week ----------
async function week(v) {
  const events = await api(`/api/events?start=${ymd(weekStart)}&days=7`);
  const days = [...Array(7)].map((_, i) => addDays(weekStart, i));
  v.innerHTML = `<div class="card row"><button class="btn" id="prev">◀</button><b>Week of ${fmtDay(weekStart)}</b><button class="btn" id="next">▶</button><button class="btn" id="thisw">This week</button>
    <span class="row" style="margin-left:auto">${S.members.map(m => `<span class="chip" style="background:${m.color}">${esc(m.name)}</span>`).join('')}<span class="chip" style="background:#8a94a6">Everyone</span></span></div>
  <div class="week">${days.map(d => {
    const ds = ymd(d), ev = events.filter(e => e.date === ds), meal = S.meals[ds];
    return `<div class="day ${ds === S.today ? 'today' : ''}"><h3>${fmtDay(d)}</h3>
      ${ev.map(e => `<div class="ev" style="border-color:${e.color}" title="${esc(memberName(e.memberId))}">${e.start ? `<b>${e.start}</b> ` : ''}${esc(e.title.replace(/^EXAMPLE:\s*/i, ''))}<div class="small muted">${esc(memberName(e.memberId))}</div></div>`).join('') || '<div class="small muted">—</div>'}
      ${meal ? `<div class="small" style="margin-top:6px">🍽️ ${esc(meal.dinner.replace(/^EXAMPLE:\s*/i, ''))} ${meal.bought ? '✅' : '🛒'}</div>` : ''}</div>`;
  }).join('')}</div>
  ${Object.entries(S.schoolNotes?.[ymd(weekStart)] || {}).map(([mid, t]) => `<div class="card" style="margin-top:16px"><h2>📝 ${esc(memberName(mid))} — school notes & homework</h2><div style="white-space:pre-wrap">${esc(t)}</div></div>`).join('')}
  <div class="card" style="margin-top:16px"><h2>Manual events this week</h2>${events.filter(e => e.source === 'manual').map(eventRow).join('') || '<p class="muted">None.</p>'}</div>
  ${addEventForm(S.today)}`;
  $('#prev').onclick = () => { weekStart = addDays(weekStart, -7); render(); };
  $('#next').onclick = () => { weekStart = addDays(weekStart, 7); render(); };
  $('#thisw').onclick = () => { weekStart = mondayOf(new Date()); render(); };
  bindEventDeletes(v); bindAddEvent(v);
}

// ---------- School ----------
async function school(v) {
  const kids = S.members.filter(m => !/dad|mum|mom/i.test(m.role));
  if (!schoolKid) schoolKid = (kids.find(k => k.id === S.settings.tipsForMemberId) || kids[0] || S.members[0]).id;
  const wk = ymd(schoolWeek);
  const data = JSON.parse(JSON.stringify(S.school[wk] || {}));
  const kidData = data[schoolKid] || {};
  v.innerHTML = `<div class="card"><h2>🏫 Weekly school calendar</h2>
    <div class="row"><button class="btn" id="prev">◀</button><b>Week of ${fmtDay(schoolWeek)}</b><button class="btn" id="next">▶</button>
    <button class="btn" id="copy">📋 Copy last week</button><button class="btn danger" id="clear">Clear this week</button></div>
    <div class="row" style="margin-top:12px">${S.members.map(m => `<button class="btn ${m.id === schoolKid ? 'primary' : ''}" data-kid="${m.id}">${esc(m.name)}</button>`).join('')}</div>
    <p class="small muted">Enter times and subject/activity for each day. Saved for this week only — use “Copy last week” next Monday and adjust.</p></div>
    ${await schoolImportCard(wk)}
    <div class="card"><h2>📝 Notes & homework — ${esc(memberName(schoolKid))}, week of ${fmtDay(schoolWeek)}</h2>
      <textarea id="schoolNotes" style="min-height:140px" placeholder="Homework, things to bring, messages from school…">${esc(S.schoolNotes?.[wk]?.[schoolKid] || '')}</textarea>
      <div class="row" style="margin-top:6px"><button class="btn" id="saveNotes">💾 Save notes</button><span id="notesMsg" class="muted"></span></div></div>
    ${remindersCard(schoolKid)}
    <form id="schoolForm">${WD.slice(0, 5).concat(['sat', 'sun']).map((d, i) => `
      <div class="card" data-day="${d}"><h2>${WD_LONG[i]} <span class="muted small">${fmtDay(addDays(schoolWeek, i))}</span></h2>
      <div class="lessons">${(kidData[d] || []).map(l => lessonRow(l)).join('')}</div>
      <button type="button" class="btn sm" data-add="${d}">+ Add lesson/activity</button></div>`).join('')}
    <div class="row"><button class="btn primary">💾 Save week</button><span id="saved" class="muted"></span></div></form>`;
  v.querySelectorAll('[data-kid]').forEach(b => b.onclick = () => { schoolKid = b.dataset.kid; render(); });
  v.querySelectorAll('[data-add]').forEach(b => b.onclick = () => { b.previousElementSibling.insertAdjacentHTML('beforeend', lessonRow({})); bindLessonDel(v); });
  bindLessonDel(v);
  $('#prev').onclick = () => { schoolWeek = addDays(schoolWeek, -7); render(); };
  $('#next').onclick = () => { schoolWeek = addDays(schoolWeek, 7); render(); };
  $('#copy').onclick = async () => {
    if (S.school[wk] && !confirm('Replace this week (all kids) with a copy of last week?')) return;
    try { await api(`/api/school/${wk}/copy-last-week`, { method: 'POST' }); await load(); render(); } catch (e) { alert(e.message); }
  };
  $('#clear').onclick = async () => { if (!confirm(`Clear ${memberName(schoolKid)}'s schedule for this week?`)) return; delete data[schoolKid]; await api(`/api/school/${wk}`, { method: 'PUT', body: data }); await load(); render(); };
  $('#saveNotes').onclick = async () => { await api(`/api/school-notes/${wk}/${schoolKid}`, { method: 'PUT', body: { text: $('#schoolNotes').value } }); await load(); $('#notesMsg').textContent = '✓ Saved'; };
  const ap = $('#applyImport'); if (ap) ap.onclick = async () => {
    const body = { file: $('#impFile').value, memberId: schoolKid, classId: $('#impClass').value || null, group: $('#impGroup').value || null };
    if (!confirm(`Replace ${memberName(schoolKid)}'s school schedule for that week with the imported plan${body.classId ? ' (class ' + body.classId + ')' : ' (common info only)'}?`)) return;
    try { const r = await api('/api/school-import/apply', { method: 'POST', body }); schoolWeek = parseYmd(r.week); await load(); render(); } catch (e) { alert(e.message); }
  };
  bindNoteDeletes(v);
  $('#schoolForm').onsubmit = async e => {
    e.preventDefault();
    const byDay = {};
    v.querySelectorAll('[data-day]').forEach(card => {
      const rows = [...card.querySelectorAll('.lesson')].map(r => ({ start: r.querySelector('[name=start]').value, end: r.querySelector('[name=end]').value, title: r.querySelector('[name=title]').value.trim() })).filter(l => l.title);
      if (rows.length) byDay[card.dataset.day] = rows;
    });
    data[schoolKid] = byDay;
    await api(`/api/school/${wk}`, { method: 'PUT', body: data }); await load();
    $('#saved').textContent = '✓ Saved';
  };
}
async function schoolImportCard(wk) {
  const plans = await api('/api/school-import');
  if (!plans.length) return '';
  const meta = S.schoolMeta?.[wk]?.[schoolKid];
  const cur = plans.find(p => p.weekStart === wk) || plans[plans.length - 1];
  return `<div class="card"><h2>📥 Import from school weekly plan</h2>
    ${meta ? `<p class="small">This week was imported from <b>${esc(meta.file)}</b> — class <b>${esc(meta.classId || 'not set')}</b>, group <b>${esc(meta.group || 'not set')}</b>.</p>` : ''}
    <div class="row"><select id="impFile">${plans.map(p => `<option value="${esc(p.file)}" ${p === cur ? 'selected' : ''}>${esc(p.title)} (week of ${esc(p.weekStart)})</option>`).join('')}</select>
    <select id="impClass"><option value="">Class: not known (common info only)</option>${cur.classes.map(c => `<option ${(meta ? meta.classId : member(schoolKid)?.schoolClass) === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
    <select id="impGroup"><option value="">Gym group: not known</option>${cur.groups.map(g => `<option value="${esc(g)}" ${(meta ? meta.group : member(schoolKid)?.schoolGroup) === g ? 'selected' : ''}>Group ${esc(g)}</option>`).join('')}</select>
    <button class="btn primary" id="applyImport">Apply to ${esc(memberName(schoolKid))}</button></div>
    <p class="small muted">Applies the timetable, homework notes, events and reminders from the plan. Re-applying (e.g. once you know the class) replaces it — no duplicates.</p></div>`;
}
function remindersCard(memberId) {
  const list = (S.reminders || []).filter(r => r.memberId === memberId).sort((a, b) => a.date.localeCompare(b.date));
  return `<div class="card"><h2>📌 Reminders for ${esc(memberName(memberId))}</h2>
    ${list.map(r => `<div class="event"><div class="time">${fmtDay(parseYmd(r.date))}${r.until ? '–' + fmtDay(parseYmd(r.until)) : ''}</div><div style="flex:1">${esc(r.text)}<div class="small muted">shown from ${r.daysBefore} day(s) before</div></div><button class="btn sm danger" data-del-note="${r.id}">✕</button></div>`).join('') || '<p class="muted">None.</p>'}
    <form id="addNote" class="row" style="margin-top:8px"><input type="date" name="date" required><input name="text" placeholder="e.g. Bring gym clothes" required style="flex:1;min-width:180px">
    <label class="small">show <input type="number" name="daysBefore" value="1" min="0" style="width:60px"> days before</label><button class="btn">Add</button></form></div>`;
}
function bindNoteDeletes(v) {
  v.querySelectorAll('[data-del-note]').forEach(b => b.onclick = async () => { await api('/api/notes/' + b.dataset.delNote, { method: 'DELETE' }); await load(); render(); });
  const f = $('#addNote', v); if (f) f.onsubmit = async e => { e.preventDefault(); await api('/api/notes', { method: 'POST', body: { ...Object.fromEntries(new FormData(f)), memberId: schoolKid } }); await load(); render(); };
}
const lessonRow = l => `<div class="lesson"><input type="time" name="start" value="${esc(l.start || '')}"><input type="time" name="end" value="${esc(l.end || '')}">
  <input name="title" placeholder="Subject / activity (e.g. PE — bring gym clothes)" value="${esc(l.title || '')}"><button type="button" class="btn sm danger" data-rm>✕</button></div>`;
function bindLessonDel(v) { v.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => b.parentElement.remove()); }

// ---------- Meals ----------
async function meals(v) {
  const days = [...Array(7)].map((_, i) => addDays(mealWeek, i));
  v.innerHTML = `<div class="card"><h2>🍽️ Meal plan</h2><div class="row"><button class="btn" id="prev">◀</button><b>Week of ${fmtDay(mealWeek)}</b><button class="btn" id="next">▶</button></div>
  <p class="small muted">Type a dinner and press Enter or click away to save. Unbought meals in the next 7 days show up as reminders.</p>
  <table class="meals">${days.map(d => { const ds = ymd(d), m = S.meals[ds]; return `<tr class="${ds === S.today ? 'today' : ''}"><th style="width:130px">${fmtDay(d)}${ds === S.today ? ' <span class="tag">today</span>' : ''}</th>
    <td><input data-dinner="${ds}" value="${esc(m?.dinner || '')}" placeholder="e.g. Tacos" style="width:100%"></td>
    <td style="width:190px">${m?.dinner ? `<span class="small muted">Bought?</span> ${boughtToggle(ds, m.bought)}` : ''}</td></tr>`; }).join('')}</table></div>`;
  v.querySelectorAll('[data-dinner]').forEach(i => i.onchange = async () => { await api('/api/meals/' + i.dataset.dinner, { method: 'PUT', body: { dinner: i.value.trim() } }); await load(); render(); });
  $('#prev').onclick = () => { mealWeek = addDays(mealWeek, -7); render(); };
  $('#next').onclick = () => { mealWeek = addDays(mealWeek, 7); render(); };
  bindBought(v);
}

// ---------- Calendars ----------
async function calendars(v) {
  const st = S.calendarStatus || {};
  v.innerHTML = `<div class="card"><h2>🔗 Linked calendars</h2>
  ${S.calendars.length ? `<table>${S.calendars.map(c => `<tr><td><span class="dot" style="background:${c.color || member(c.memberId)?.color || '#8a94a6'}"></span> <b>${esc(c.name)}</b><div class="small muted">${esc(c.urlHint || '')}</div>
    ${st[c.id]?.error ? `<div class="small" style="color:var(--bad)">⚠ ${esc(st[c.id].error)}</div>` : st[c.id] ? `<div class="small muted">${st[c.id].count} events loaded</div>` : ''}</td>
    <td><select data-cal-member="${c.id}">${memberOptions(c.memberId)}</select></td>
    <td><input type="color" data-cal-color="${c.id}" value="${c.color || member(c.memberId)?.color || '#8a94a6'}"></td>
    <td><button class="btn sm danger" data-cal-del="${c.id}">Remove</button></td></tr>`).join('')}</table>
    <button class="btn" id="refresh" style="margin-top:8px">↻ Refresh all now</button>` : '<p class="muted">No calendars linked yet.</p>'}</div>
  <div class="card"><h2>➕ Add a calendar (ICS / iCal link)</h2><form id="addCal" class="row">
    <input name="name" placeholder="Name, e.g. Mum's work" required>
    <input name="url" placeholder="https://… or webcal://… .ics link" required style="flex:1;min-width:260px">
    <select name="memberId">${memberOptions('family')}</select>
    <button class="btn primary">Add</button></form><p id="calMsg" class="small"></p>
    <details><summary>Where do I find the link?</summary><ul class="small">
      <li><b>Google Calendar</b> (on a computer): Settings ⚙ → click the calendar under “Settings for my calendars” → “Integrate calendar” → copy <b>Secret address in iCal format</b>.</li>
      <li><b>iCloud</b>: Calendar app on iPhone → Calendars → ⓘ next to the calendar → turn on <b>Public Calendar</b> → Share Link (webcal://… works).</li>
      <li><b>Outlook.com / Microsoft 365</b>: Settings → Calendar → Shared calendars → <b>Publish a calendar</b> → choose calendar, “Can view all details” → copy the <b>ICS</b> link.</li>
      <li>School/club calendars (Spond, Vigilo etc.) often have an “export/subscribe” .ics link too.</li></ul>
      <p class="small muted">Calendars refresh automatically every 15 minutes. Changes in Google/iCloud can take a while to appear in their ICS feed.</p></details></div>`;
  $('#addCal').onsubmit = async e => {
    e.preventDefault(); const f = e.target; $('#calMsg').textContent = 'Loading calendar…';
    try { const c = await api('/api/calendars', { method: 'POST', body: Object.fromEntries(new FormData(f)) }); $('#calMsg').textContent = `✓ Added — ${c.count} events found`; await load(); setTimeout(render, 900); }
    catch (err) { $('#calMsg').textContent = '⚠ ' + err.message; }
  };
  v.querySelectorAll('[data-cal-del]').forEach(b => b.onclick = async () => { if (!confirm('Remove this calendar?')) return; await api('/api/calendars/' + b.dataset.calDel, { method: 'DELETE' }); await load(); render(); });
  v.querySelectorAll('[data-cal-member]').forEach(s => s.onchange = async () => { await api('/api/calendars/' + s.dataset.calMember, { method: 'PUT', body: { memberId: s.value } }); await load(); render(); });
  v.querySelectorAll('[data-cal-color]').forEach(s => s.onchange = async () => { await api('/api/calendars/' + s.dataset.calColor, { method: 'PUT', body: { color: s.value } }); await load(); });
  const r = $('#refresh'); if (r) r.onclick = async () => { r.textContent = 'Refreshing…'; await api('/api/calendars/refresh', { method: 'POST' }); await load(); render(); };
}

// ---------- Settings ----------
async function settings(v) {
  const travel = await api('/api/travel-config');
  const loc = S.settings.location;
  v.innerHTML = `
  <div class="card"><h2>📍 Weather location</h2>
   ${loc.isDefault ? `<div class="banner">👉 <b>Set your town</b> — weather is currently showing the default (Oslo). Type your town below and pick it from the list.</div>` : ''}
   <p>Current: <b>${esc(loc.name)}</b>${loc.country ? ', ' + esc(loc.country) : ''} <span class="small muted">(${loc.latitude.toFixed(3)}, ${loc.longitude.toFixed(3)})</span></p>
   <form id="geo" class="row"><input name="q" placeholder="Town, e.g. Bærum, Drammen, Bergen" required><button class="btn primary">Search</button></form><div id="geoRes"></div></div>

  <div class="card"><h2>👨‍👩‍👧‍👦 Family</h2>
   <p class="small muted">Ages are calculated from birthdays. Birthday reminders appear ${S.settings.birthdayReminderDays} days ahead.</p>
   <form id="fam">${S.members.map(m => `<div class="member-row" data-id="${m.id}">
     <input type="color" name="color" value="${m.color}"><input name="name" value="${esc(m.name)}" placeholder="Name"><input name="role" value="${esc(m.role)}" placeholder="Role">
     <input type="date" name="birthday" value="${esc(m.birthday)}" title="Birthday"><span class="small muted">${m.ageNow != null ? 'age ' + m.ageNow : ''}</span>
     <label class="small"><input type="checkbox" name="away" ${m.away ? 'checked' : ''}> Away</label></div>`).join('')}
   <div class="row" style="margin-top:8px"><label>Clothing tips for <select name="tipsFor">${memberOptions(S.settings.tipsForMemberId, false)}</select></label>
     <label><input type="checkbox" name="hideAway" ${S.settings.hideAwayOnKitchen ? 'checked' : ''}> Hide away people completely on the kitchen screen</label>
     <label>Birthday reminder <input type="number" name="bdays" min="0" max="60" value="${S.settings.birthdayReminderDays}" style="width:70px"> days ahead</label></div>
   <div class="row" style="margin-top:8px"><button class="btn primary">💾 Save family</button><span id="famMsg" class="muted"></span></div></form></div>

  <div class="card"><h2>✈️ Travel reminders</h2><p class="small muted">Events whose title or location contain these words trigger a packing reminder. Comma-separated. Also stored in <code>config/travel.json</code>.</p>
   <form id="trav"><label>Flight words<textarea name="flightKeywords">${esc(travel.flightKeywords.join(', '))}</textarea></label>
   <label>Trip words<textarea name="travelKeywords">${esc(travel.travelKeywords.join(', '))}</textarea></label>
   <label>Destinations abroad<textarea name="destinations">${esc(travel.destinations.join(', '))}</textarea></label>
   <label>Remember to bring<textarea name="checklist" style="min-height:50px">${esc(travel.checklist.join(', '))}</textarea></label>
   <label>Extra for flights<textarea name="flightChecklist" style="min-height:50px">${esc((travel.flightChecklist || []).join(', '))}</textarea></label>
   <button class="btn primary">💾 Save travel words</button> <span id="travMsg" class="muted"></span></form></div>

  <div class="card"><h2>🧹 Example data</h2><p>Items marked <span class="tag example">example</span> were added so the app isn't empty (sample school week, meals incl. Tacos on Friday, a sample flight to England, football practice).</p>
   <button class="btn danger" id="clearEx">Remove all example data</button></div>`;

  $('#geo').onsubmit = async e => {
    e.preventDefault();
    const res = await api('/api/geocode?q=' + encodeURIComponent(new FormData(e.target).get('q')));
    $('#geoRes').innerHTML = res.length ? res.map((r, i) => `<button class="btn sm" data-i="${i}" style="margin:4px 4px 0 0">${esc(r.name)}${r.admin1 ? ', ' + esc(r.admin1) : ''}, ${esc(r.country || '')}</button>`).join('') : '<p class="muted">No places found.</p>';
    $('#geoRes').querySelectorAll('[data-i]').forEach(b => b.onclick = async () => { const r = res[b.dataset.i]; await api('/api/settings', { method: 'PUT', body: { location: { name: r.name, country: r.country, latitude: r.latitude, longitude: r.longitude, isDefault: false } } }); await load(); render(); });
  };
  $('#fam').onsubmit = async e => {
    e.preventDefault();
    const members = [...v.querySelectorAll('.member-row')].map(r => { const old = member(r.dataset.id); return { ...old, name: r.querySelector('[name=name]').value, role: r.querySelector('[name=role]').value, color: r.querySelector('[name=color]').value, birthday: r.querySelector('[name=birthday]').value, away: r.querySelector('[name=away]').checked }; });
    await api('/api/members', { method: 'PUT', body: members });
    const f = e.target;
    await api('/api/settings', { method: 'PUT', body: { tipsForMemberId: f.tipsFor.value, hideAwayOnKitchen: f.hideAway.checked, birthdayReminderDays: Number(f.bdays.value) } });
    await load(); render();
  };
  $('#trav').onsubmit = async e => {
    e.preventDefault(); const f = e.target; const list = n => f[n].value.split(',').map(s => s.trim()).filter(Boolean);
    await api('/api/travel-config', { method: 'PUT', body: { ...travel, flightKeywords: list('flightKeywords'), travelKeywords: list('travelKeywords'), destinations: list('destinations'), checklist: list('checklist'), flightChecklist: list('flightChecklist') } });
    $('#travMsg').textContent = '✓ Saved';
  };
  $('#clearEx').onclick = async () => { if (!confirm('Remove all example events, school lessons and meals?')) return; await api('/api/clear-examples', { method: 'POST' }); await load(); render(); };
}

load().then(render);
setInterval(async () => { if (tab === 'home' && !document.querySelector('input:focus')) { await load(); render(); } }, 5 * 60 * 1000);
