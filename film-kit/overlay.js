// film-kit overlay: injected into every page before its scripts run (see director.mjs newPage).
// Defines window.__filmRender(state). Everything it draws sits in #__film, a fixed, click-through
// layer above the app, so the app itself is never modified.
//
// state = {
//   badge:  { text, sub, color, top }            persistent BEFORE/AFTER chip, top left; top in px
//                                                (default 58, to clear a typical app header)
//   cap:    { n, html }                          numbered caption bar, bottom center; <b> renders amber
//   hl:     [{ sel, has, nth, pad, label, color, below, right, spot }]
//           highlight boxes, re-measured every 120 ms so they follow scrolling and re-layout.
//           sel = CSS selector; has = required text; nth = index among visible matches;
//           spot:false = no dimming of the rest of the page. sel '#__film .panel' highlights the
//           request panel itself (it appears one tick after the panel is first drawn).
//   panel:  { title, rows: [{ m, p, st, bad, note }], empty }   request list, bottom right
//   term:   { title, lines: [html] }             terminal card, center; spans .c .ok .err .req
//   cursor: { x, y, click }                      fake cursor in zoomed CSS px; click = ripple
// }
// Rects are divided by the page zoom, because getBoundingClientRect reports device px while the
// overlay is laid out in zoomed CSS px.
window.__filmRender = (s) => {
  let root = document.getElementById('__film');
  if (!root) {
    root = document.createElement('div');
    root.id = '__film';
    document.documentElement.appendChild(root);
    const st = document.createElement('style');
    st.textContent = `
    #__film{position:fixed;inset:0;pointer-events:none;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,"Fira Sans",Ubuntu,"Noto Sans",sans-serif}
    #__film .badge{position:absolute;top:58px;left:14px;padding:8px 16px 8px 14px;border-radius:10px;font-weight:800;font-size:20px;letter-spacing:.06em;color:#111;box-shadow:0 6px 20px rgba(0,0,0,.35)}
    #__film .badge small{display:block;font-weight:600;font-size:12.5px;letter-spacing:.02em;opacity:.8}
    #__film .cap{position:absolute;left:50%;bottom:26px;transform:translateX(-50%);max-width:1120px;width:max-content;background:rgba(15,23,42,.94);color:#fff;padding:16px 24px;border-radius:14px;font-size:20px;line-height:1.38;box-shadow:0 12px 40px rgba(0,0,0,.45);display:flex;gap:14px;align-items:flex-start}
    #__film .cap .n{flex:none;background:#fbbf24;color:#111;font-weight:800;border-radius:999px;min-width:34px;height:34px;display:grid;place-items:center;font-size:18px;margin-top:1px}
    #__film .cap b{color:#fcd34d}
    #__film .hl{position:absolute;border:4px solid #fbbf24;border-radius:10px;box-shadow:0 0 0 9999px rgba(15,23,42,.42),0 0 24px rgba(251,191,36,.9);transition:all .45s ease}
    #__film .hl.nospot{box-shadow:0 0 24px rgba(251,191,36,.9)}
    #__film .hl .tag{position:absolute;left:-4px;top:-38px;background:#fbbf24;color:#111;font-weight:800;font-size:16px;padding:5px 11px;border-radius:8px;white-space:nowrap}
    #__film .hl .tag.below{top:auto;bottom:-40px} #__film .hl .tag.right{left:auto;right:-4px}
    #__film .panel{position:absolute;right:18px;bottom:104px;width:540px;background:#0b1220;color:#e5e7eb;border-radius:14px;box-shadow:0 16px 50px rgba(0,0,0,.55);overflow:hidden;border:1px solid #1f2937}
    #__film .panel h4{margin:0;padding:12px 16px;font-size:16px;font-weight:700;background:#111827;color:#9ca3af;letter-spacing:.03em;text-transform:uppercase}
    #__film .panel .row{display:flex;gap:10px;align-items:baseline;padding:11px 16px;border-top:1px solid #1f2937;font:600 15px/1.35 ui-monospace,Menlo,"Fira Mono","Noto Sans Mono","DejaVu Sans Mono",monospace}
    #__film .panel .row .m{color:#93c5fd;flex:none;width:54px}
    #__film .panel .row .p{color:#e5e7eb;flex:1}
    #__film .panel .row .s{flex:none;font-weight:800}
    #__film .panel .note{font:500 14px/1.35 -apple-system,"Fira Sans",Ubuntu,"Noto Sans",sans-serif;color:#9ca3af;padding:0 16px 11px 80px;margin-top:-6px}
    #__film .panel .row.bad{background:rgba(239,68,68,.16)} #__film .panel .row.bad .p{color:#fecaca}
    #__film .panel .note.bad{background:rgba(239,68,68,.16);color:#fca5a5}
    #__film .panel .empty{padding:14px 16px;font:600 17px/1.4 -apple-system,"Fira Sans",Ubuntu,"Noto Sans",sans-serif;color:#6ee7b7;border-top:1px solid #1f2937;background:rgba(16,185,129,.12)}
    #__film .term{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);width:860px;background:#0b1220;border-radius:14px;box-shadow:0 0 0 9999px rgba(15,23,42,.55),0 20px 60px rgba(0,0,0,.6);overflow:hidden;border:1px solid #1f2937}
    #__film .term .bar{background:#111827;padding:11px 16px;color:#9ca3af;font:700 15px -apple-system,"Fira Sans",Ubuntu,"Noto Sans",sans-serif;letter-spacing:.03em}
    #__film .term pre{background:#0b1220!important;border:0!important;border-radius:0!important;margin:0;padding:18px 22px;font:600 17px/1.6 ui-monospace,Menlo,"Fira Mono","Noto Sans Mono","DejaVu Sans Mono",monospace;color:#e5e7eb;white-space:pre-wrap}
    #__film .term .c{color:#6b7280} #__film .term .ok{color:#34d399} #__film .term .err{color:#f87171} #__film .term .req{color:#93c5fd}
    #__film .cursor{position:absolute;width:30px;height:30px;transition:left .8s cubic-bezier(.4,0,.2,1),top .8s cubic-bezier(.4,0,.2,1);filter:drop-shadow(0 2px 4px rgba(0,0,0,.6))}
    #__film .cursor.click::after{content:"";position:absolute;left:-14px;top:-14px;width:30px;height:30px;border-radius:50%;border:4px solid #fbbf24;animation:__ping .5s ease-out forwards}
    @keyframes __ping{from{transform:scale(.3);opacity:1}to{transform:scale(1.6);opacity:0}}`;
    document.head.appendChild(st);
  }
  const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const visible = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; };
  const rectOf = (h) => {
    let els = [...document.querySelectorAll(h.sel)].map((e) => (!visible(e) && e.nextElementSibling && visible(e.nextElementSibling) ? e.nextElementSibling : e)).filter(visible);
    if (h.has) els = els.filter((e) => (e.textContent || '').includes(h.has));
    const el = els[h.nth || 0];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const z = parseFloat(document.documentElement.style.zoom) || 1; // rects are in device px; overlay is in zoomed CSS px
    const pad = h.pad ?? 6;
    return { x: r.left / z - pad, y: r.top / z - pad, w: r.width / z + pad * 2, h: r.height / z + pad * 2, cx: (r.left + r.width / 2) / innerWidth };
  };
  window.__filmRect = rectOf;
  let html = '';
  if (s.badge) html += `<div class="badge" style="background:${s.badge.color};top:${s.badge.top ?? 58}px">${esc(s.badge.text)}<small>${esc(s.badge.sub)}</small></div>`;
  (s.hl || []).forEach((h, i) => {
    // Always emit the box; it stays hidden until its target exists, and the tracker below moves it.
    const r = rectOf(h) || { x: 0, y: 0, w: 0, h: 0, cx: 0, missing: true };
    html += `<div class="hl ${h.spot === false ? 'nospot' : ''}" data-i="${i}" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;border-color:${h.color || '#fbbf24'};${r.missing ? 'display:none' : ''}">${h.label ? `<div class="tag ${h.below ? 'below' : ''} ${h.right ?? r.cx > 0.6 ? 'right' : ''}" style="background:${h.color || '#fbbf24'}">${esc(h.label)}</div>` : ''}</div>`;
  });
  if (s.panel) {
    html += `<div class="panel"><h4>${esc(s.panel.title)}</h4>`;
    for (const r of s.panel.rows) {
      html += `<div class="row ${r.bad ? 'bad' : ''}"><span class="m">${esc(r.m)}</span><span class="p">${esc(r.p)}</span><span class="s" style="color:${r.st < 300 ? '#34d399' : '#f87171'}">${r.st ?? '…'}</span></div>`;
      if (r.note) html += `<div class="note ${r.bad ? 'bad' : ''}">${esc(r.note)}</div>`;
    }
    if (s.panel.empty) html += `<div class="empty">${esc(s.panel.empty)}</div>`;
    html += `</div>`;
  }
  if (s.term) html += `<div class="term"><div class="bar">${esc(s.term.title)}</div><pre>${s.term.lines.join('\n')}</pre></div>`;
  if (s.cap) html += `<div class="cap">${s.cap.n ? `<span class="n">${esc(s.cap.n)}</span>` : ''}<span>${s.cap.html}</span></div>`;
  let layer = root.querySelector('.layer');
  if (!layer) { layer = document.createElement('div'); layer.className = 'layer'; root.appendChild(layer); }
  layer.innerHTML = html;
  let cur = root.querySelector('.cursor');
  if (!cur) {
    cur = document.createElement('div'); cur.className = 'cursor';
    cur.innerHTML = '<svg viewBox="0 0 24 24" width="30" height="30"><path d="M3 2l7.5 19 2.6-7.9L21 10.5z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    root.appendChild(cur);
  }
  if (s.cursor) {
    cur.style.display = ''; cur.style.left = s.cursor.x + 'px'; cur.style.top = s.cursor.y + 'px';
    cur.classList.remove('click'); if (s.cursor.click) { void cur.offsetWidth; cur.classList.add('click'); }
  } else cur.style.display = 'none';
  window.__filmState = s;
  if (!window.__filmTrack) window.__filmTrack = setInterval(() => {
    const st = window.__filmState; if (!st || !st.hl) return;
    document.querySelectorAll('#__film .hl[data-i]').forEach((d) => {
      const r = window.__filmRect(st.hl[+d.dataset.i]);
      if (!r) { d.style.display = 'none'; return; }
      d.style.display = ''; d.style.left = r.x + 'px'; d.style.top = r.y + 'px'; d.style.width = r.w + 'px'; d.style.height = r.h + 'px';
    });
  }, 120);
};
