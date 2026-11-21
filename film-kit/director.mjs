// film-kit director: the Node side of a recording. A run's scene file imports these and writes
// only its own story. See README.md for the whole workflow.
//
//   import { loadChromium, newPage, Film, Recorder, requestLog, writeFacts, sleep } from '$SKILL/film-kit/director.mjs';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT = path.dirname(fileURLToPath(import.meta.url));

/**
 * 1920x1080 viewport at 150% page zoom: the app lays out as if it were 1280x720 (large, readable
 * UI) and the screencast still delivers native 1080p frames. Do not use deviceScaleFactor for
 * this: Page.startScreencast ignores it and returns 1280x720 frames.
 */
export const VIEWPORT = { width: 1920, height: 1080 };
export const ZOOM = 1.5;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const SIDES = {
  before: { text: 'BEFORE', sub: 'current release', color: '#fbbf24' },
  after: { text: 'AFTER', sub: 'with this PR', color: '#34d399' },
};

/** The kit's own Playwright, installed by setup-playwright.sh. */
export const KIT_PLAYWRIGHT = process.env.PWN_IT_PLAYWRIGHT || path.join(os.homedir(), '.local/share/pwn-it/playwright');

/**
 * Uses the kit's own Playwright (KIT_PLAYWRIGHT, from setup-playwright.sh). FILM_PLAYWRIGHT_FROM
 * overrides it with any package.json (or its dir) whose node_modules has Playwright.
 *
 * FILM_CHROMIUM=<path> makes every launch() use that browser binary instead of Playwright's own
 * download (e.g. ~/.local/share/flatpak/exports/bin/org.chromium.Chromium). Flatpak Chromium can't
 * render headless, so a flatpak path launches headed (real windows on $DISPLAY) unless
 * FILM_HEADLESS=1; FILM_HEADLESS=0 forces headed for any binary.
 */
export function loadChromium(from = process.env.FILM_PLAYWRIGHT_FROM || KIT_PLAYWRIGHT, exe = process.env.FILM_CHROMIUM) {
  if (!fs.existsSync(from)) throw new Error(`no Playwright at ${from}: run ${path.join(KIT, 'setup-playwright.sh')}`);
  const req = createRequire(from.endsWith('.json') ? from : path.join(from, 'package.json'));
  let chromium;
  for (const name of ['@playwright/test', 'playwright', 'playwright-core']) {
    try { chromium = req(name).chromium; break; } catch { /* try the next one */ }
  }
  if (!chromium) throw new Error(`no playwright under ${from}: run ${path.join(KIT, 'setup-playwright.sh')}`);
  if (!exe) return chromium;
  if (!fs.existsSync(exe)) throw new Error(`FILM_CHROMIUM does not exist: ${exe}`);
  const env = process.env.FILM_HEADLESS;
  const headless = env ? env !== '0' : !exe.includes('flatpak');
  return new Proxy(chromium, {
    get(t, k) {
      if (k === 'launch') return (opts = {}) => t.launch({ executablePath: exe, headless, ...opts });
      const v = Reflect.get(t, k);
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
}

/**
 * A page with the overlay and zoom installed before any app script runs, so they survive reloads
 * and navigations. `setup(page)` is the place for addLocatorHandler (modals that pop up at random).
 */
export async function newPage(browser, { zoom = ZOOM, viewport = VIEWPORT, setup } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await ctx.addInitScript({ path: path.join(KIT, 'overlay.js') });
  await ctx.addInitScript((z) => {
    const set = () => { document.documentElement.style.zoom = String(z); };
    if (document.documentElement) set();
    document.addEventListener('DOMContentLoaded', set);
  }, zoom);
  const page = await ctx.newPage();
  page.__filmZoom = zoom;
  if (setup) await setup(page);
  return page;
}

/** Drives the overlay on one page. State persists between calls; `set` merges a patch. */
export class Film {
  constructor(page, side, { badge = true } = {}) {
    if (!SIDES[side]) throw new Error(`side must be before|after, got ${side}`);
    this.page = page;
    this.zoom = page.__filmZoom ?? ZOOM;
    this.s = { badge: badge ? SIDES[side] : undefined, cursor: { x: 640, y: 420 } };
  }

  async render() {
    // Renders race navigations; those errors are expected. Anything else (an unserializable
    // value in the state, a bug in the overlay) must surface, or the frame silently loses content.
    await this.page.evaluate((s) => window.__filmRender && window.__filmRender(s), this.s)
      .catch((e) => { if (!/navigat|destroyed|closed/i.test(String(e))) throw e; });
  }

  async set(patch) { Object.assign(this.s, patch); await this.render(); }

  /** Clears captions, highlights, panels and terminal; keeps the badge and cursor. */
  async clear() { await this.set({ cap: undefined, hl: [], panel: undefined, term: undefined }); }

  /** Numbered caption. `html` may use <b> for emphasis. */
  async say(n, html, patch = {}) { await this.set({ cap: { n, html }, ...patch }); }

  /** Glides the cursor to a locator (about 0.9 s) and optionally shows a click ripple. Then do the real click. */
  async moveTo(locator, { click = false } = {}) {
    const b = await locator.boundingBox();
    if (!b) throw new Error('moveTo: target has no bounding box (hidden or detached)');
    const x = (b.x + Math.min(b.width / 2, 60)) / this.zoom;
    const y = (b.y + b.height / 2) / this.zoom;
    await this.set({ cursor: { x, y } });
    await sleep(900);
    if (click) { await this.set({ cursor: { x, y, click: true } }); await sleep(150); }
    return { x, y };
  }

  hideCursor() { return this.set({ cursor: undefined }); }
}

/**
 * Records one take with CDP Page.startScreencast. Writes <dir>/frames/*.jpg, <dir>/list.txt
 * (each frame with how long it was on screen) and <dir>/last.txt (the final frame, for
 * comparison cards). clips.sh turns that into a constant-30 fps clip.
 *
 * One take = one continuous moment. Stop before a reload or navigation and start a new take
 * after the page is ready, so no blank or half-loaded frame is ever recorded.
 */
export class Recorder {
  constructor(page, dir) { this.page = page; this.dir = dir; this.frames = []; }

  async start() {
    fs.rmSync(this.dir, { recursive: true, force: true });
    fs.mkdirSync(path.join(this.dir, 'frames'), { recursive: true });
    this.cdp = await this.page.context().newCDPSession(this.page);
    this.cdp.on('Page.screencastFrame', async (f) => {
      const file = path.join(this.dir, 'frames', `${String(this.frames.length).padStart(6, '0')}.jpg`);
      fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
      this.frames.push({ file, t: Date.now() / 1000 });
      await this.cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    });
    // The screencast only sends a frame when the page repaints, so a static page gives a few late
    // frames and overlay changes show up seconds after they're drawn. An invisible pixel with an
    // endless background animation damages every compositor frame: frames flow at about 60/s.
    await this.page.evaluate(() => {
      if (document.getElementById('__film_keepalive')) return;
      const k = document.createElement('div');
      k.id = '__film_keepalive';
      k.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:.02;pointer-events:none;z-index:2147483647;animation:__film_ka 1s linear infinite alternate';
      const st = document.createElement('style');
      st.textContent = '@keyframes __film_ka{from{background-color:#000}to{background-color:#fff}}';
      document.documentElement.append(st, k);
    });
    await this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
    await sleep(300);
  }

  async stop() {
    const end = Date.now() / 1000;
    await this.cdp.send('Page.stopScreencast').catch(() => {});
    await this.cdp.detach().catch(() => {});
    if (!this.frames.length) throw new Error(`${this.dir}: no frames captured`);
    const lines = [];
    this.frames.forEach((f, i) => {
      const next = i + 1 < this.frames.length ? this.frames[i + 1].t : end;
      lines.push(`file '${f.file}'`, `duration ${Math.max(0.001, next - f.t).toFixed(3)}`);
    });
    fs.writeFileSync(path.join(this.dir, 'list.txt'), lines.join('\n') + '\n');
    fs.writeFileSync(path.join(this.dir, 'last.txt'), this.frames.at(-1).file);
    console.log(`${path.basename(this.dir)}: ${this.frames.length} frames, ${(end - this.frames[0].t).toFixed(1)}s`);
  }
}

/**
 * Collects matching browser requests for the overlay's request panel.
 *   const log = requestLog(page, (r, url) => r.method() === 'POST' && url.pathname.startsWith('/api/'),
 *                          (r, url) => ({ bad: url.pathname.includes('/notification/'), note: '...' }));
 *   await film.set({ panel: { title: 'Requests sent by the browser', rows: log.rows() } });
 * Rows are plain objects; the Playwright Request never reaches page.evaluate (it can't be serialized).
 */
export function requestLog(page, match, describe = () => ({})) {
  const entries = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (match(r, url)) entries.push({ req: r, row: { m: r.method(), p: url.pathname, st: undefined, ...describe(r, url) } });
  });
  page.on('response', (res) => {
    const e = entries.find((x) => x.req === res.request());
    if (e) e.row.st = res.status();
  });
  return {
    rows: () => entries.map((e) => ({ ...e.row })),
    any: (pred) => entries.some((e) => pred(e.row)),
    clear: () => { entries.length = 0; },
  };
}

/**
 * Writes <outDir>/facts.json and checks it against the edit plan's expectations for this side.
 * Throws on any mismatch, so a caption can never claim something the recording didn't show.
 *   writeFacts(OUT, side, { browserNotificationRequest: true, saveStatus: 200 },
 *              { before: { browserNotificationRequest: true }, after: { browserNotificationRequest: false } });
 */
export function writeFacts(outDir, side, facts, expected = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'facts.json'), JSON.stringify({ side, ...facts }, null, 2) + '\n');
  const want = expected[side] || {};
  const bad = Object.entries(want).filter(([k, v]) => JSON.stringify(facts[k]) !== JSON.stringify(v));
  if (bad.length) {
    throw new Error(`${side} facts differ from the edit plan: ` +
      bad.map(([k, v]) => `${k} expected ${JSON.stringify(v)} got ${JSON.stringify(facts[k])}`).join('; '));
  }
}
