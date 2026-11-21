#!/bin/bash
# selftest.sh : record, cut and assemble a tiny two-sided video with every kit piece. Run it after
# changing the kit. Needs the kit's Playwright (../setup-playwright.sh) and ffmpeg.
set -euo pipefail
cd "$(dirname "$0")"
rm -rf out
node selftest.mjs
../clips.sh out/before; ../clips.sh out/after
cat > out/edl.txt <<'EDL'
cards/title.png 2
cards/ch1.png 1.5
cards/sideBefore.png 1
before/s1.mp4 clip
cards/sideAfter.png 1
after/s1.mp4 clip
cards/cmp1.png 2
cards/summary.png 2
EDL
../assemble.sh out/edl.txt out/selftest.mp4
../tsheet.sh out/selftest.mp4 out/tsheet.jpg 1 6 12 17.6
../sheet.sh out/after/s1 out/sheet-after.jpg
echo "selftest ok: $(pwd)/out/selftest.mp4 (look at out/tsheet.jpg and out/sheet-after.jpg)"
