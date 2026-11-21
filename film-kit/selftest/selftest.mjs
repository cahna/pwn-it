// Exercises every kit piece against a static page, both sides, then builds a short video.
// Usage: ./selftest.sh   (uses the kit's Playwright; see ../setup-playwright.sh)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import http from 'node:http';
import { loadChromium, newPage, Film, Recorder, requestLog, writeFacts, sleep } from '../director.mjs';
import { card, cropLast, renderCards } from '../cards.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');
const html = fs.readFileSync(path.join(HERE, 'page.html'));
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) { res.writeHead(req.url.includes('notification') ? 200 : 201); res.end('{}'); return; }
  res.writeHead(200, { 'content-type': 'text/html' }); res.end(html);
}).listen(0);
const APP = `http://localhost:${server.address().port}`;
const chromium = loadChromium();

for (const side of ['before', 'after']) {
  const browser = await chromium.launch();
  const page = await newPage(browser);
  await page.goto(`${APP}/?side=${side}`);
  await page.waitForLoadState('networkidle');
  const film = new Film(page, side);
  const log = requestLog(page, (r, u) => r.method() === 'POST' && u.pathname.startsWith('/api/'),
    (r, u) => (u.pathname.includes('notification') ? { bad: true, note: 'second request' } : {}));
  const panel = (extra = {}) => ({ title: 'Requests sent by the browser', rows: log.rows(), ...extra });
  const rec = new Recorder(page, path.join(OUT, side, 's1'));
  await rec.start();
  await film.say(1, 'Record <b>#42</b>.', { hl: [{ sel: '#assignee', label: 'Assigned user' }] });
  await sleep(1200);
  await film.say(2, 'Click <b>Save</b>.', { hl: [{ sel: '#save', spot: false }], panel: panel() });
  await film.moveTo(page.locator('#save'), { click: true });
  await page.locator('#save').click();
  await sleep(600);
  const second = log.any((r) => r.bad);
  await film.say(3, second ? 'A second request follows.' : 'Only the save.', {
    hl: [{ sel: '#__film .panel', spot: false }], panel: panel({ empty: second ? undefined : 'No second request.' }),
    term: { title: 'terminal', lines: ['<span class="req">POST /api/x</span>', `<span class="${second ? 'ok' : 'err'}">→ ${second ? 200 : 404}</span>`] },
  });
  await sleep(1500);
  // the panel highlight must have been placed by the tracker
  const hlShown = await page.evaluate(() => { const d = document.querySelector('#__film .hl'); return !!d && d.style.display !== 'none' && parseFloat(d.style.width) > 100; });
  await rec.stop();
  writeFacts(path.join(OUT, side), side, { second, hlShown }, { before: { second: true, hlShown: true }, after: { second: false, hlShown: true } });
  await browser.close();
}
server.close();

// writeFacts must refuse a mismatch
let refused = false;
try { writeFacts(path.join(OUT, 'tmp'), 'after', { second: true }, { after: { second: false } }); } catch { refused = true; }
if (!refused) throw new Error('writeFacts accepted a mismatch');

await renderCards(chromium, path.join(OUT, 'cards'), {
  title: card.title({ eyebrow: 'film-kit selftest', heading: 'Selftest', lead: 'Every piece of the kit, <b>both sides</b>.' }),
  ch1: card.chapter({ n: 1, of: 1, heading: 'Saving', lead: '<b>Watch the panel.</b>' }),
  sideBefore: card.side('before'), sideAfter: card.side('after'),
  cmp1: card.compare({ title: 'Saving',
    before: { img: cropLast(path.join(OUT, 'before', 's1'), '1100:700:820:300'), verdict: '<b>Two requests.</b>' },
    after: { img: cropLast(path.join(OUT, 'after', 's1'), '1100:700:820:300'), verdict: '<b>One request.</b>' } }),
  summary: card.summary({ rows: [['Saving', 'Two requests', 'One request', { bad: true }]], foot: 'Selftest.' }),
});
console.log('selftest scenes and cards ok');
