#!/bin/bash
# assemble.sh <edl.txt> <out.mp4> : cut cards and clips into the final video.
#
# The edit decision list has one piece per line: "<path> <seconds>" for a still card, or
# "<path> clip" for a recorded take. Blank lines and "#" comments are ignored; relative paths are
# relative to the EDL's directory. Every piece gets a short fade in and out, and the result is
# 1920x1080, 30 fps, H.264 yuv420p, +faststart.
#
#   cards/title.png 7
#   cards/ch1.png 4
#   cards/sideBefore.png 1.4
#   out/before/s1-save.mp4 clip
set -euo pipefail
EDL=${1:?usage: assemble.sh <edl.txt> <out.mp4>}; OUT=${2:?usage: assemble.sh <edl.txt> <out.mp4>}
BASE=$(cd "$(dirname "$EDL")" && pwd)
P=$(mktemp -d "${TMPDIR:-/tmp}/film-pieces.XXXXXX"); : > "$P/list.txt"; k=0
while read -r src len _; do
  [ -z "${src:-}" ] && continue; case "$src" in \#*) continue;; esac
  case "$src" in /*) ;; *) src="$BASE/$src";; esac
  [ -f "$src" ] || { echo "missing piece: $src" >&2; exit 1; }
  k=$((k+1)); o="$P/$(printf %03d $k).mp4"
  if [ "$len" = clip ]; then
    d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$src")
    ffmpeg -nostdin -v error -y -i "$src" -vf "fade=t=in:st=0:d=0.3,fade=t=out:st=$(python3 -c "print(max(0,$d-0.3))"):d=0.3,format=yuv420p" \
      -c:v libx264 -preset slow -crf 16 -r 30 "$o"
  else
    ffmpeg -nostdin -v error -y -loop 1 -framerate 30 -t "$len" -i "$src" \
      -vf "scale=1920:1080,format=yuv420p,fade=t=in:st=0:d=0.35,fade=t=out:st=$(python3 -c "print($len-0.35)"):d=0.35" \
      -c:v libx264 -preset slow -crf 16 -r 30 "$o"
  fi
  echo "file '$o'" >> "$P/list.txt"
done < "$EDL"
ffmpeg -v error -y -f concat -safe 0 -i "$P/list.txt" -c copy -movflags +faststart "$OUT"
rm -rf "$P"
ffprobe -v error -show_entries format=duration:stream=width,height,r_frame_rate -of compact "$OUT"
