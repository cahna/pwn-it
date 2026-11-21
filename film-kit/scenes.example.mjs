// Template for a run's scene file. Copy to runs/<RUN_ID>/film/scenes.mjs and write the story.
// Usage: node scenes.mjs before|after   (uses the kit's Playwright; see setup-playwright.sh)
//
// Shape: reset the data, open one page per actor, then for each chapter of the edit plan record
// one or more takes. Captions that differ by side are chosen from what actually happened (facts),
// never from the side name alone, and writeFacts fails the run if the facts don't match the plan.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';

// The kit lives in the skill directory, not next to this file. When copying, replace the
// placeholder with the absolute path of $SKILL/film-kit (or export PWN_IT_FILM_KIT).
const KIT = process.env.PWN_IT_FILM_KIT || '<SKILL_DIR>/film-kit';
if (KIT.startsWith('<')) throw new Error('set KIT in scenes.mjs (or PWN_IT_FILM_KIT) to $SKILL/film-kit');
const { loadChromium, newPage, Film, Recorder, requestLog, writeFacts, sleep } = await import(pathToFileURL(path.join(KIT, 'director.mjs')).href);

const SIDE = process.argv[2];
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out', SIDE);
const APP = 'http://localhost:<port>';

// Expected facts per side, copied from state.md → Demo plan (the edit plan).
const EXPECTED = {
  before: { browserSendsSecondRequest: true },
  after: { browserSendsSecondRequest: false },
};

(async () => {
  // 1. Same starting data on both sides: restore the snapshot taken before BASELINE.
  // execSync('<run>/restore-baseline.sh');

  const browser = await loadChromium().launch();
  const page = await newPage(browser, {
    // setup: (p) => p.addLocatorHandler(<random modal>, async () => { ... }),
  });
  // Log in and navigate BEFORE recording; nothing loading is ever on camera.
  await page.goto(`${APP}/some/screen`);
  await page.waitForLoadState('networkidle');

  const film = new Film(page, SIDE);
  const log = requestLog(page,
    (r, url) => r.method() === 'POST' && url.pathname.startsWith('/api/'),
    (r, url) => url.pathname.startsWith('/api/notification/')
      ? { bad: true, note: 'sent by the browser after the save' }
      : { note: 'saves the record' });

  // ---- Chapter 1, take 1
  const rec = new Recorder(page, path.join(OUT, 's1-example'));
  await rec.start();
  await film.say(1, 'The user opens record <b>#42</b>.', { hl: [{ sel: '#assignee', label: 'Assigned user' }] });
  await sleep(3500); // hold each key moment 2.5-4 s; longer when the caption is long
  await film.say(2, 'They click <b>Save</b>. The panel lists what the browser sends.', {
    hl: [{ sel: '#save', spot: false }], panel: { title: 'Requests sent by the browser', rows: log.rows() },
  });
  const save = page.locator('#save');
  await film.moveTo(save, { click: true });
  await save.click();
  for (let i = 0; i < 12; i++) { await film.set({ panel: { title: 'Requests sent by the browser', rows: log.rows() } }); await sleep(250); }
  const second = log.any((r) => r.bad);
  await film.say(3, second ? 'The save finishes, <b>then the browser sends a second request</b>.'
                           : '<b>Only the save is sent.</b> The server does the rest.', {
    hl: [{ sel: '#__film .panel', spot: false }],
    panel: { title: 'Requests sent by the browser', rows: log.rows(), empty: second ? undefined : 'No second request.' },
  });
  await sleep(6000);
  await rec.stop();

  // A reload or navigation ends the take: clear, reload, wait, then start take 2 (s1b-...).

  writeFacts(OUT, SIDE, { browserSendsSecondRequest: second }, EXPECTED);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
