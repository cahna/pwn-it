#!/bin/bash
# tsheet.sh <clip.mp4> <out.jpg> <t1> <t2> <t3> <t4> : 2x2 sheet of a clip's frames at those
# times (seconds). Use it on the final video at each key moment, to check captions and highlights
# landed where the edit plan says.
set -euo pipefail
clip=${1:?usage: tsheet.sh <clip.mp4> <out.jpg> t1 t2 t3 t4}; out=${2:?}; shift 2
[ $# -eq 4 ] || { echo "need exactly 4 times" >&2; exit 1; }
args=(); for t in "$@"; do args+=(-ss "$t" -i "$clip"); done
ffmpeg -v error -y "${args[@]}" -filter_complex "[0][1][2][3]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0,scale=1920:-1" \
  -frames:v 1 -q:v 3 "$out"
