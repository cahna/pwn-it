# film-kit

Building blocks for the pwn-it demo video. It is **not** a pipeline: it makes no editing choices.
Each run writes its own story (scenes, captions, card text, the cut) and uses these pieces for the
parts that are the same every time and were expensive to get right.

Read `references/demo-capture.md` → Produce the video first; it says what the video must be. This
file says how the pieces fit.

## Pieces

| File | What it does |
| --- | --- |
| `overlay.js` | Page-side layer: BEFORE/AFTER badge, numbered captions, highlight boxes that track their element, request panel, terminal card, fake cursor with click ripple. Click-through; never changes the app. |
| `director.mjs` | Node side: `loadChromium`, `newPage` (1920x1080 at 150% zoom, overlay installed before app scripts), `Film` (`say`, `set`, `clear`, `moveTo`), `Recorder` (CDP screencast takes), `requestLog` (browser requests for the panel), `writeFacts` (fails on a mismatch with the edit plan). |
| `cards.mjs` | `card.title / chapter / side / compare / summary` in one style, `cropLast` (crop a take's last frame for a comparison card), `renderCards`. |
| `clips.sh <takes-dir>` | Every take → `<take>.mp4` at exactly 30 fps. |
| `assemble.sh <edl.txt> <out.mp4>` | Cut list → final video, with fades, 1920x1080 30 fps H.264 `+faststart`. |
| `sheet.sh <take-dir> <out.jpg>` | 2x2 contact sheet of one take (15%, 45%, 75%, last frame). |
| `tsheet.sh <clip> <out.jpg> t1 t2 t3 t4` | 2x2 sheet of a video at chosen times. |
| `scenes.example.mjs` | Skeleton of a run's scene file. |
| `selftest/selftest.sh` | Records, cuts and assembles a tiny video with every piece. Run it after changing the kit. For kit development only: it writes to `selftest/out/` (gitignored) inside the skill directory. |

Playwright: the kit has its own, so it never depends on the target repo. `setup-playwright.sh`
installs pinned `playwright-core` into `~/.local/share/pwn-it/playwright` (override with
`PWN_IT_PLAYWRIGHT`) and Playwright's headless Chromium into `~/.cache/ms-playwright/`, then
smoke-tests a launch. It is idempotent; `PREFLIGHT` runs it. `director.mjs` uses that install by
default; `FILM_PLAYWRIGHT_FROM=<dir>` overrides it.

Browser: record **headless** with that Playwright Chromium. Other
binaries can be used via `FILM_CHROMIUM=<path>` (`FILM_HEADLESS=1|0` to force the mode), but:

- Flatpak Chromium cannot render headless (pages never load), so it only runs headed.
- Headed recording captures the real window, which the desktop shrinks to the screen's work area.
  On a 1920x1080 screen that gives about 1884x961 frames, not the 1920x1080 viewport. `clips.sh`
  refuses such takes, so headed only works on a screen larger than 1920x1080.

## Workflow in a run

```
runs/<RUN_ID>/film/
  scenes.mjs        # copied from scenes.example.mjs; one take per continuous moment
  cards.mjs         # the words: title, one chapter + compare card per claim, summary
  edl.txt           # the cut, in order
  out/<side>/<take>/{frames,list.txt,last.txt}  out/<side>/<take>.mp4  out/<side>/facts.json
  cards/*.png
```

1. Edit plan in `state.md` first (claims, region, captions, expected facts per side).
2. `node scenes.mjs after`, switch the stack to the BEFORE build, `node scenes.mjs before`. Restore
   the DB at the start of each. Both must pass `writeFacts`.
3. `clips.sh out/before && clips.sh out/after`. Check each take with `sheet.sh`.
4. Measure crops on real `last.txt` frames, then `node cards.mjs`.
5. `assemble.sh edl.txt ../artifacts/demo.mp4`. QA with a full contact sheet and `tsheet.sh` at
   every key moment.

## Bugs these pieces already fix (don't reintroduce them)

- Screencast ignores `deviceScaleFactor` and delivers 1280x720 frames → 150% page zoom on a 1920x1080 viewport.
- Overlay rects were off by the zoom factor → `getBoundingClientRect` is divided by the page zoom.
- Highlights drifted when the page re-laid out → boxes are re-measured every 120 ms.
- A box for an element that wasn't there yet never appeared → boxes are always emitted, hidden until found.
- Text search highlighted zero-size duplicates → only visible matches count; use exact selectors and `has`.
- The request panel was silently empty: a Playwright `Request` in the state can't be serialized
  and the error was swallowed → `requestLog` rows are plain data, and `Film.render` only ignores
  navigation errors.
- App CSS restyled the terminal's `<pre>` → its overlay styles use `!important`.
- Highlight labels clipped at the right edge → tags right-anchor past 60% of the width (or `right: true`).
- ffmpeg's concat demuxer stretched the last frame and drifted timing → `clips.sh` resamples to a 30 fps grid itself.
- Reloads recorded blank frames → one take per continuous moment; reload between takes.
- Static pages gave 2-3 late frames per take (screencast only sends on repaint) → `Recorder.start` adds an invisible, always-animating pixel so frames flow at about 60/s.
- `ls | head -1` under `pipefail` died with SIGPIPE on takes with many frames → `sed -n 1p`.
- `while read` loops lost lines to ffmpeg reading stdin → `-nostdin`.
- Captions claimed things the recording didn't show → captions are chosen from facts, and `writeFacts` checks them against the plan.
