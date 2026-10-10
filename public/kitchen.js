// Kitchen display: read-only, auto-refreshing. Data every 2 min, clock every second, full reload every 6 h.
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clean = t => String(t || '').replace(/^EXAMPLE:\s*/i, '');
const pad = n => String(n).padStart(2, '0');
let D = null;

function tick() {
  const n = new Date();
  $('clock').textContent = `${pad(n.getHours())}:${pad(n.getMinutes())}`;
  $('date').textContent = n.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  if (D) markPast();
}
function markPast() {
  const n = new Date(), now = `${pad(n.getHours())}:${pad(n.getMinutes())}`;
  document.querySelectorAll('.ev[data-end]').forEach(e => e.classList.toggle('past', e.dataset.end && e.dataset.end < now));
}

function render() {
  const members = D.members, byId = Object.fromEntries(members.map(m => [m.id, m]));
  const hideAway = D.settings.hideAwayOnKitchen;
  $('people').innerHTML = members.filter(m => !(hideAway && m.away)).map(m => `<span class="${m.away ? 'away' : ''}" style="background:${m.color}">${esc(m.name)}${m.away ? ' · away' : ''}</span>`).join('');
  const evs = D.events.filter(e => !(hideAway && byId[e.memberId]?.away));
  $('events').innerHTML = evs.length ? evs.map(e => {
    const m = byId[e.memberId];
    const who = m ? m.name : 'Everyone';
    const time = e.allDay || !e.start ? 'All day' : `${e.start}${e.end ? '–' + e.end : ''}`;
    return `<div class="ev ${m?.away ? 'away' : ''}" data-end="${e.end || ''}"><span class="time">${time}</span><span class="who" style="background:${e.color}">${esc(who)}</span><span class="title">${esc(clean(e.title))}</span></div>`;
  }).join('') : '<div class="muted">Nothing on the calendar today.</div>';

  const meal = D.meal;
  $('meal').innerHTML = meal ? `<span class="meal">${esc(clean(meal.dinner))}</span><span class="bought ${meal.bought ? 'yes' : 'no'}">${meal.bought ? '✓ Food bought' : '🛒 Not bought yet'}</span>`
    + (D.tomorrowMeal ? `<div class="muted" style="margin-top:.4vw">Tomorrow: ${esc(clean(D.tomorrowMeal.dinner))} ${D.tomorrowMeal.bought ? '✓' : '🛒'}</div>` : '')
    : '<span class="muted">No dinner planned yet</span>';

  const w = D.weather;
  if (w && !w.error) {
    const hour = new Date().getHours();
    const day = hour >= 20 && w.days[1] ? w.days[1] : w.days[0]; // in the evening, show tomorrow
    const kid = byId[D.settings.tipsForMemberId];
    $('wtitle').textContent = `${day === w.days[0] ? 'Weather today' : 'Weather tomorrow'} · ${w.location.name}`;
    $('now').innerHTML = `<div class="t">${w.current.icon} ${w.current.temp}°</div><div class="muted">${esc(w.current.summary)}</div>`;
    const tips = day.tips || [...new Set(day.parts.flatMap(p => p.tips))];
    $('weather').innerHTML = `<div class="parts">${day.parts.map(p => `<div class="part"><div class="lbl">${p.label}</div><div class="big">${p.icon} ${p.tempMax}°</div><div class="sum">${esc(p.summary)} · ☔ ${p.precipProb}%</div></div>`).join('')}</div>
      <ul class="tips">${kid ? `<li style="background:none;padding-left:0" class="muted">${esc(kid.name)}, today you need:</li>` : ''}${tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`;
  } else {
    $('weather').innerHTML = `<div class="muted">Weather unavailable</div>`;
  }

  const rem = [...D.reminders];
  const bdaysShown = new Set(rem.filter(r => r.type === 'birthday').map(r => r.memberId));
  for (const b of D.birthdays.slice(0, 3)) if (!bdaysShown.has(b.memberId)) {
    const d = new Date(b.date + 'T12:00');
    rem.push({ type: 'birthday', icon: '🎂', text: `${b.name}'s birthday ${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}${b.turns ? ` (turns ${b.turns})` : ''} — in ${b.inDays} days` });
  }
  $('reminders').innerHTML = rem.length ? rem.slice(0, 6).map(r => `<div class="rem ${r.type}">${r.icon} ${esc(r.text)}</div>`).join('') : '<div class="muted">Nothing to remember 🎉</div>';
  markPast();
}

async function refresh() {
  try { const r = await fetch('/api/today', { cache: 'no-store' }); if (r.status === 401) { location.href = '/login?next=/kitchen'; return; } D = await r.json(); render(); }
  catch (e) { console.error(e); }
}
tick(); setInterval(tick, 1000);
refresh(); setInterval(refresh, 2 * 60 * 1000);
setTimeout(() => location.reload(), 6 * 60 * 60 * 1000);
// Keep the screen awake where supported (Android Chrome etc.)
if ('wakeLock' in navigator) { const lock = () => navigator.wakeLock.request('screen').catch(() => {}); lock(); document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && lock()); }
// Tap anywhere to go fullscreen
document.addEventListener('click', () => document.documentElement.requestFullscreen?.().catch(() => {}));
