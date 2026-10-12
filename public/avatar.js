// Profile pictures + discreet refresh button. Photos come from private data (member.avatar), never from the repo.
(function () {
  const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // avatarHtml(member, sizePx, fallback) — round photo; fallback 'name' (default) or 'initial'
  window.avatarHtml = function (m, size = 28, fallback = 'name') {
    if (!m) return `<span class="av-name">Everyone</span>`;
    const n = e(m.name), st = `width:${size}px;height:${size}px`;
    if (m.avatar && /^data:image\//.test(m.avatar)) return `<img class="avatar" src="${e(m.avatar)}" alt="${n}" title="${n}" style="${st};border-color:${e(m.color)}">`;
    if (fallback === 'initial') return `<span class="avatar av-initial" title="${n}" style="${st};font-size:${Math.round(size * .5)}px;background:${e(m.color)}">${e((m.name || '?')[0].toUpperCase())}</span>`;
    return `<span class="av-name" title="${n}">${n}</span>`;
  };
  // resize an image File to a 160px square JPEG data URL (centre crop)
  window.fileToAvatar = file => new Promise((res, rej) => {
    const img = new Image(); img.onload = () => {
      const s = Math.min(img.width, img.height), c = document.createElement('canvas'); c.width = c.height = 160;
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 160, 160);
      let q = .85, u = c.toDataURL('image/jpeg', q); while (u.length > 20000 && q > .3) { q -= .1; u = c.toDataURL('image/jpeg', q); }
      URL.revokeObjectURL(img.src); res(u);
    }; img.onerror = rej; img.src = URL.createObjectURL(file);
  });
  const css = document.createElement('style');
  css.textContent = `.avatar{display:inline-block;border-radius:50%;object-fit:cover;vertical-align:middle;border:2px solid transparent;box-sizing:border-box;flex:none}
.av-initial{display:inline-flex;align-items:center;justify-content:center;color:#0f1420;font-weight:700}
#softRefresh{position:fixed;right:6px;bottom:4px;font-size:13px;line-height:1;opacity:.18;color:inherit;cursor:pointer;user-select:none;-webkit-user-select:none;padding:2px;z-index:50;transition:opacity .2s}
#softRefresh.hold{opacity:.8;animation:spin 1s linear}@keyframes spin{to{transform:rotate(360deg)}}`;
  document.head.appendChild(css);
  // ↻ : press and hold ~1 s to reload (a quick tap does nothing)
  addEventListener('DOMContentLoaded', () => {
    const b = document.createElement('span'); b.id = 'softRefresh'; b.textContent = '↻'; b.title = 'Hold 1 second to refresh';
    let t; const start = ev => { ev.preventDefault(); b.classList.add('hold'); t = setTimeout(() => location.reload(), 1000); };
    const stop = () => { clearTimeout(t); b.classList.remove('hold'); };
    b.addEventListener('pointerdown', start); ['pointerup', 'pointerleave', 'pointercancel'].forEach(x => b.addEventListener(x, stop));
    b.addEventListener('contextmenu', ev => ev.preventDefault());
    document.body.appendChild(b);
  });
})();
