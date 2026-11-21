#!/bin/bash
# clips.sh <takes-dir> : turn every recorded take under <takes-dir> (each a dir with list.txt, as
# written by director.mjs Recorder) into <takes-dir>/<take>.mp4 at exactly 30 fps.
#
# Screencast frames arrive only when the page repaints, so they are irregular. This resamples them
# by receipt time onto a 30 fps grid (symlinks, no re-encode of the source) and encodes once. Don't
# feed list.txt to ffmpeg's concat demuxer instead: it stretches the last frame's duration and
# drifts the timing.
set -euo pipefail
DIR=${1:?usage: clips.sh <takes-dir>}
for d in "$DIR"/*/; do
  [ -f "$d/list.txt" ] || continue
  n=$(basename "$d")
  # Refuse non-native frames instead of stretching them (e.g. a headed browser squeezed into a
  # smaller screen work area records at the window's real size, not the 1920x1080 viewport).
  first=$(ls "$d/frames" | sed -n 1p)  # not head -1: it closes the pipe early, and pipefail turns that SIGPIPE into exit 141
  dims=$(ffprobe -v error -show_entries stream=width,height -of csv=p=0:s=x "$d/frames/$first")
  [ "$dims" = 1920x1080 ] || { echo "$n: frames are $dims, not 1920x1080; record headless or on a screen larger than the viewport" >&2; exit 1; }
  python3 - "$d" <<'PY'
import sys, os
d = sys.argv[1]
files, durs = [], []
for line in open(os.path.join(d, 'list.txt')).read().split('\n'):
    if line.startswith("file '"): files.append(line[6:-1])
    elif line.startswith('duration'): durs.append(float(line.split()[1]))
files = files[:len(durs)]
total = sum(durs)
cfr = os.path.join(d, 'cfr'); os.makedirs(cfr, exist_ok=True)
for f in os.listdir(cfr): os.remove(os.path.join(cfr, f))
t, i, acc, k = 0.0, 0, durs[0], 0
while t < total:
    while t >= acc and i + 1 < len(files): i += 1; acc += durs[i]
    os.symlink(files[i], os.path.join(cfr, f'{k:06d}.jpg')); k += 1; t = k / 30
PY
  ffmpeg -v error -y -framerate 30 -i "$d/cfr/%06d.jpg" -vf "scale=1920:1080:flags=lanczos,format=yuv420p" \
    -c:v libx264 -preset slow -crf 16 "$DIR/$n.mp4"
  echo "$n $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$DIR/$n.mp4")s"
done
