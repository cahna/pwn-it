// film-kit cards: title, chapter, side, comparison and summary cards as 1920x1080 PNGs, all in
// one style. A run's own cards file supplies the words and calls renderCards.
//
//   import { loadChromium } from '$SKILL/film-kit/director.mjs';
//   import { card, cropLast, renderCards } from '$SKILL/film-kit/cards.mjs';
//   await renderCards(loadChromium(), 'film/cards', {
//     title: card.title({ eyebrow: 'PR #12 · #1', heading: 'What changed', lead: 'One or two sentences. <b>Key phrase.</b>' }),
//     ch1: card.chapter({ n: 1, of: 2, heading: 'Claim 1', lead: '<b>Watch the panel.</b>' }),
//     sideBefore: card.side('before'), sideAfter: card.side('after'),
//     cmp1: card.compare({ title: 'Claim 1',
//       before: { img: cropLast('film/out/before/s1', '850:300:1062:604'), verdict: '<b>Bad.</b> Why.' },
//       after:  { img: cropLast('film/out/after/s1',  '850:300:1062:604'), verdict: '<b>Good.</b> Why.' } }),
//     summary: card.summary({ heading: 'What changes', rows: [['Case', 'before text', 'after text', { bad: true }]], foot: '...' }),
//   });
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CSS = `
*{box-sizing:border-box;margin:0}
body{width:1920px;height:1080px;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Inter,"Fira Sans",Ubuntu,"Noto Sans",sans-serif;color:#e5e7eb;
  background:radial-gradient(1200px 700px at 20% 10%,#1e293b 0%,#0b1220 60%,#070b14 100%);overflow:hidden}
.wrap{position:absolute;inset:0;padding:110px 140px;display:flex;flex-direction:column}
.eyebrow{font-size:26px;font-weight:600;color:#94a3b8;letter-spacing:.04em}
h1{font-size:84px;line-height:1.06;font-weight:800;color:#fff;margin-top:26px;letter-spacing:-.015em}
h2{font-size:64px;line-height:1.1;font-weight:800;color:#fff;letter-spacing:-.01em}
.lead{font-size:36px;line-height:1.45;color:#cbd5e1;margin-top:34px;max-width:1500px}
.lead b{color:#fcd34d;font-weight:700}
.badge{display:inline-flex;flex-direction:column;padding:12px 24px;border-radius:14px;font-weight:800;font-size:30px;letter-spacing:.06em;color:#111}
.badge small{font-size:17px;font-weight:600;letter-spacing:.02em;opacity:.8}
.amber{background:#fbbf24}.green{background:#34d399}
.legend{display:flex;gap:28px;align-items:center;margin-top:auto;font-size:26px;color:#94a3b8}
.hlsample{width:120px;height:56px;border:5px solid #fbbf24;border-radius:12px;box-shadow:0 0 22px rgba(251,191,36,.8)}
.chapter{font-size:30px;font-weight:800;color:#fbbf24;letter-spacing:.1em;text-transform:uppercase}
.cmp{position:absolute;inset:0;padding:70px 70px 60px;display:flex;flex-direction:column}
.cmp h3{font-size:44px;font-weight:800;color:#fff;margin-bottom:34px}
.cols{display:flex;gap:44px;margin:auto 0}
.col{flex:1;display:flex;flex-direction:column;gap:20px}
.col img{width:100%;max-height:620px;object-fit:contain;object-position:top left;background:#0b1220;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.6);border:3px solid #334155}
.col.b img{border-color:#fbbf24}.col.a img{border-color:#34d399}
.verdict{font-size:31px;line-height:1.38;color:#e5e7eb}
.verdict b{font-weight:800}.col.b .verdict b{color:#fcd34d}.col.a .verdict b{color:#6ee7b7}
table{border-collapse:separate;border-spacing:0;margin-top:44px;font-size:29px;width:100%}
th{text-align:left;padding:18px 26px;font-size:24px;color:#94a3b8;letter-spacing:.05em;text-transform:uppercase;font-weight:700}
td{padding:22px 26px;border-top:1px solid #1f2937;vertical-align:top;line-height:1.35}
td:first-child{color:#fff;font-weight:700;width:30%}
td.bad{color:#fca5a5}td.good{color:#6ee7b7}
.foot{margin-top:auto;font-size:25px;color:#94a3b8}
`;
const page = (body) => `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${body}</body></html>`;
const badge = (side, style = '') => side === 'before'
  ? `<span class="badge amber" style="${style}">BEFORE<small>current release</small></span>`
  : `<span class="badge green" style="${style}">AFTER<small>with this PR</small></span>`;

export const card = {
  /** Opening card: what changed and the legend (badges and the highlight color). Hold about 6-8 s. */
  title: ({ eyebrow, heading, lead, legend = true }) => `<div class="wrap">
    <div class="eyebrow">${eyebrow}</div>
    <h1>${heading}</h1>
    <div class="lead">${lead}</div>
    ${legend ? `<div class="legend">${badge('before')} ${badge('after')}
      <span style="margin-left:40px" class="hlsample"></span><span>Yellow boxes show where to look</span></div>` : ''}
  </div>`,

  /** One per claim: what the chapter proves and what to watch. Hold about 4 s. */
  chapter: ({ n, of, heading, lead }) => `<div class="wrap" style="justify-content:center">
    <div class="chapter">Part ${n} of ${of}</div>
    <h2 style="margin-top:22px">${heading}</h2>
    <div class="lead">${lead}</div></div>`,

  /** Big BEFORE/AFTER slate between the two takes of a chapter. Hold about 1.4 s. */
  side: (side) => `<div class="wrap" style="justify-content:center;align-items:center">${badge(side, 'font-size:54px;padding:22px 44px')}</div>`
    .replace('<small>', '<small style="font-size:26px">'),

  /** Side-by-side final frames with a one-line verdict each. Hold about 6-7 s. */
  compare: ({ title, before, after }) => `<div class="cmp"><h3>${title}</h3><div class="cols">
    <div class="col b">${badge('before', 'align-self:flex-start;font-size:24px')}<img src="${before.img}"><div class="verdict">${before.verdict}</div></div>
    <div class="col a">${badge('after', 'align-self:flex-start;font-size:24px')}<img src="${after.img}"><div class="verdict">${after.verdict}</div></div>
    </div></div>`,

  /** Closing table. rows: [label, beforeText, afterText, { bad, good }] — bad tints the before cell red,
   *  good (default true) tints the after cell green. Hold about 10 s. */
  summary: ({ heading = 'What changes', rows, foot = '' }) => `<div class="wrap" style="padding-top:90px">
    <h2>${heading}</h2>
    <table><tr><th></th><th>Before</th><th>After</th></tr>
    ${rows.map(([label, b, a, o = {}]) => `<tr><td>${label}</td><td${o.bad ? ' class="bad"' : ''}>${b}</td><td${o.good === false ? '' : ' class="good"'}>${a}</td></tr>`).join('\n    ')}
    </table>
    ${foot ? `<div class="foot">${foot}</div>` : ''}</div>`,
};

/**
 * The last frame of a recorded take, cropped to the region that proves the point, as a data URL.
 * crop = ffmpeg "w:h:x:y" in 1920x1080 frame pixels. Measure it on a real frame (open
 * <sceneDir>/last.txt's file), never guess.
 */
export function cropLast(sceneDir, crop) {
  const src = fs.readFileSync(path.join(sceneDir, 'last.txt'), 'utf8').trim();
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'film-crop-')), 'crop.png');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vf', `crop=${crop},scale=1600:-1:flags=lanczos`, out]);
  return 'data:image/png;base64,' + fs.readFileSync(out).toString('base64');
}

/** Renders { name: html } to <outDir>/<name>.png at 1920x1080. */
export async function renderCards(chromium, outDir, cards) {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const p = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  for (const [name, body] of Object.entries(cards)) {
    await p.setContent(page(body), { waitUntil: 'load' });
    await p.screenshot({ path: path.join(outDir, `${name}.png`) });
  }
  await browser.close();
  console.log('cards:', Object.keys(cards).join(' '));
}
