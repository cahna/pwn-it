#!/bin/bash
# sheet.sh <take-dir> <out.jpg> : 2x2 contact sheet of one recorded take, at 15%, 45%, 75% and the
# last frame. Look at it before cutting: it catches blank frames and misplaced highlights early.
set -euo pipefail
D=${1:?usage: sheet.sh <take-dir> <out.jpg>}/frames; OUT=${2:?}
n=$(ls "$D" | wc -l | tr -d ' ')
pick() { ls "$D" | sed -n "$(python3 -c "print(max(1,int($n*$1)))")p"; }
ffmpeg -v error -y -i "$D/$(pick 0.15)" -i "$D/$(pick 0.45)" -i "$D/$(pick 0.75)" -i "$D/$(ls "$D" | tail -1)" \
  -filter_complex "[0][1][2][3]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0,scale=1920:-1" -q:v 3 "$OUT"
