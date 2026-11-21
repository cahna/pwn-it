# Demo capture (BASELINE and DEMO)

The before-vs-after demo is *evidence*, not decoration: real captures of the real app, running the
same scripted steps at the base commit (BEFORE) and at the branch head (AFTER). The video has to
explain the change to a reviewer who has never seen the issue.

## The edit plan

Written in `PLAN`, stored in `state.md` → Plan → Demo plan. Start from the claims, not the
screens: list each thing the PR says changes (usually the rows of the PR's before/after table),
then decide how each one is shown.

| # | Claim | Shown by (screen / API / panel) | Region to highlight | Expected fact BEFORE | Expected fact AFTER |
| --- | --- | --- | --- | --- | --- |
| 1 | Saving a record no longer makes the browser send a second request | record screen + request panel | the request panel | second request sent | only the save |
| 2 | Bulk updates now notify too | bulk update API in a terminal card, then the notifications menu | newest notification / unread count | no new notification | notified |

Then the numbered steps per claim: URL or command, action, what should be visible, and the caption
text. Use the same seed data for both runs. Each claim becomes one chapter of the video.

**Make the invisible visible.** If the change happens where the viewer can't see it (a request the
browser sends or stops sending, a server-side write, an endpoint that now 404s, a path with no
UI), plan an overlay that shows it: a request panel, a terminal card with the call and its status,
or a highlighted database-backed count. A demo where BEFORE and AFTER look the same on screen
explains nothing.

## Repeatable runs

You will re-shoot. Plan for it from `BASELINE`:

- **Snapshot the DB** (for example `mysqldump`) before the first capture, and restore it at the
  start of every recording, on both sides.
- **Keep the BEFORE build runnable** after `BUILD` starts: a detached worktree at the base commit
  (`git worktree add --detach <path> <base-sha>`), with its build output mounted into the same
  stack by a compose override. A `switch-variant.sh before|after` recreates only the app service.
  Both sides then run on the same stack and the same data, and a re-shoot never needs a checkout.
  Remove the base worktree when the video is accepted.
- Each recording writes `facts.json` (what actually happened: statuses, counts, which requests were
  sent) and fails if it differs from the edit plan's expected facts.

## File layout

```
artifacts/before/01-<step>.png …     artifacts/after/01-<step>.png …      (PR stills)
artifacts/before/<step>.txt          artifacts/after/<step>.txt           (api/cli evidence)
artifacts/demo.mp4
film/                                 (the video's sources; see $SKILL/film-kit/README.md)
```

Same step number and name on both sides, so the pairs line up in the PR.

## Capture methods

Whatever you use, **confirm the file exists on disk** after each capture; a screenshot shown to
you is not a file. Record which method worked in the repo profile.

- **For the video: Playwright with `$SKILL/film-kit`.** It records with Chrome's screencast at a
  1920x1080 viewport with 150% page zoom (native 1080p frames, UI large enough to read), and draws
  the annotations inside the page. Don't use `deviceScaleFactor` for sharpness: the screencast
  ignores it and returns 1280x720 frames.
- **For stills and exploring:** the Claude in Chrome extension, or Chrome DevTools MCP
  (`take_screenshot` with a file path). Fine for the PR stills even when the video comes from
  Playwright, if they use the same URL and seed login.
- **OS screenshot tool** as a last resort: on X11 `import -window root -crop <w>x<h>+<x>+<y> file.png`
  (ImageMagick) or `scrot -a <x>,<y>,<w>,<h> file.png`; on Wayland `grim -g "<x>,<y> <w>x<h>" file.png`.
  Check `$XDG_SESSION_TYPE` to pick one.

Hide dev toolbars and overlays that differ between runs.

## Non-UI surfaces

- `api`: capture the exact request and response (status, relevant body excerpt) to
  `<step>.txt` on both sides. Redact tokens. In the video, show the call in a terminal card over
  the app (film-kit `term`), then show where its effect lands in the UI.
- `cli` / jobs: capture the command and its relevant output.
- If any UI screen reflects the change (even indirectly), prefer a UI capture of that screen too.
- `surface: none` (pure refactor, infra with no observable runtime change): no video. Record why,
  and use test output (before: failing/absent; after: passing) as the evidence.

## Produce the video

There is no end-to-end script on purpose: you are the **editor**, and every run's story is
different. `$SKILL/film-kit/` gives you the building blocks (overlay, recorder, 30 fps clips, cards,
assembly, contact sheets) so the time goes into the story, not into rebuilding tooling. Production
quality is the bar: if you wouldn't show it in a sprint demo, it isn't done.

**Structure: a chaptered explainer.** This format worked; use it unless the change is a single
trivial claim.

1. **Title card** (6–8 s): issue numbers, a one-line headline, two or three sentences on what changed
   and why it matters, and a legend: the BEFORE/AFTER badges and what the highlight boxes mean.
2. **Per claim, one chapter:**
   - Chapter card (about 4 s): "Part n of N", the claim, and **what to watch** ("Watch who sends
     the notification").
   - A BEFORE slate (about 1.4 s), then the BEFORE takes.
   - An AFTER slate, then the AFTER takes: the same steps, the same framing.
   - Comparison card (6–7 s): the two final frames side by side, cropped to the proving region,
     each with a one-line verdict ("**Two requests.** The browser sends a second one" / "**One request.**
     The server does the rest").
3. **Summary card** (about 10 s): a before/after table, one row per claim, plus what is
   deliberately unchanged.

Length follows the claims: about 45–70 s per chapter, so a three-claim change runs about three
minutes. Every second must back up a claim; cut anything that doesn't. Time cards by how much
they say (about 3 words a second, plus 1–2 s), not by a fixed number.

**Emphasis: make the viewer look at the right thing.** This matters more than anything else here.
- Each step has one region that proves the point. Highlight it with a box that tracks the element
  (film-kit `hl`), and dim the rest of the page when the page is busy (`spot`). Label the box in
  a few words ("Now: Demo UserTwo", "Still 1: no new request").
- A numbered caption on every step says what is happening and what to notice, in plain words. Bold
  the key phrase. Number the steps so the BEFORE and AFTER takes can be compared step by step.
- The BEFORE/AFTER badge stays in the same corner for the whole take, clear of app content.
- Show the cursor gliding to each target and a click ripple before the real click.
- Hold each key moment 2.5–4 s, longer for long captions. Keep navigation off camera: log in,
  navigate and wait for network idle *before* starting a take.
- When BEFORE (or AFTER) shows "nothing happens", show the same region empty, highlighted and
  labeled, so the absence is visible.
- Captions that differ by side are chosen from what actually happened (facts), not from the side
  name. A caption must never claim something the frame doesn't show.

**Craft. Failures seen in earlier runs; don't repeat them:**
- No blank, loading, or spinner frames. A reload or navigation ends a take; start the next take
  once the page is ready.
- Native 1920x1080 at 30 fps, H.264, `yuv420p`, `+faststart`. No letterboxing. Screencast frames
  arrive irregularly: resample them to a constant 30 fps (film-kit `clips.sh`), never through the
  concat demuxer's per-frame durations.
- One font and style for all overlay text and cards. Short fades between pieces; no gimmicks.
- Measure comparison-card crops on real frames; don't guess coordinates.
- Film the real app as built. Never rewrite, shim, or mock requests to make one side work (for
  example a rebased frontend against an older API): rebuild the stack for that side instead.

**QA: watch it like a reviewer would.**
- Per take, before cutting: a contact sheet (`sheet.sh`). Catch blank frames and misplaced boxes early.
- On the final video: a full contact sheet (one frame every 2 s, for example
  `ffmpeg -i demo.mp4 -vf "fps=0.5,scale=480:-1,tile=6x0" sheet.png`), and full-size frames at
  every key moment (`tsheet.sh`). Check:
  - no blank frames;
  - each highlight sits on its target and the target is readable;
  - captions are legible, accurate for that side, and agree with `facts.json`;
  - the BEFORE and AFTER takes line up step for step;
  - no real user data or secrets.
- Then ask: would someone who never read the issue know, after one viewing, what changed and why
  it matters? If not, fix the story, not the polish.

Fix and rebuild until it passes. Three passes at most, then ship the best version and log what
fell short in `LEARNINGS.md`.

Video production can be delegated to a `general-purpose` worker (`opus`, effort `high`) with the
edit plan, the artifact paths, this section, and `$SKILL/film-kit/README.md`. The brief forbids
request rewriting (see Craft) and says to report, not work around, anything that doesn't run.
The orchestrator still does the final QA itself.

Filming often finds real UI bugs that reviews and unit tests missed (overflow on a phone width,
the wrong active nav item). Treat them as findings: `FIX` → `VERIFY` → `REVIEW`, then re-shoot.

## Real-user-data and secrets check (required before anything is uploaded)

Look at every still and a frame from every clip. Reject and recapture if you see: real user
names/emails/addresses/phone numbers or other personal data, production or shared-environment
URLs, tokens, API keys, session IDs, or internal credentials. Seed/synthetic data on localhost only.
