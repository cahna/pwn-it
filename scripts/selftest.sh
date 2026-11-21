#!/usr/bin/env bash
# selftest.sh : checks setup-worktree.sh and scan-history.py against a throwaway repo, with
# synthetic data only. Run it after changing either script.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
t="$(mktemp -d "${TMPDIR:-/tmp}/pwn-it-selftest.XXXXXX")"; trap 'rm -rf "$t"' EXIT
fail() { echo "FAIL: $*" >&2; exit 1; }
g() { git -c user.email=t@example.com -c user.name=t "$@"; }

# Repo with an origin, under a path containing a space.
mkdir -p "$t/my repos"; git init -q --bare "$t/origin.git"
g clone -q "$t/origin.git" "$t/my repos/app" 2>/dev/null; cd "$t/my repos/app"
printf '.env*\n*.properties\nconf/\n' > .gitignore; echo x > a; echo old > old.bin; g add .; g commit -qm init
g push -q origin HEAD:main; git remote set-head origin main
echo A=1 > .env; echo A=1 > .env.local; echo A=1 > .env.prod; echo A=1 > .env.production.local; echo s=1 > secrets.properties
mkdir -p deploy/production products conf/prod; echo A=1 > deploy/production/.env; echo A=1 > products/.env
echo a > conf/local.yml; echo a > conf/app.prod.yml; echo a > conf/prod/x.yml
mkdir -p svc; ln -s ../deploy/production/.env svc/.env; ln -s ../deploy/production/.env conf/link.yml
ln -s deploy/production cfg; echo A=1 > "$t/outside.env"

export PWN_IT_WT_ROOT="$t/work trees" PWN_IT_HOME="$t/home" PWN_IT_BRANCH_PREFIX=me
mkdir -p "$PWN_IT_HOME/repos"; printf '.env.prod\nconf/\ncfg/.env\n../../outside.env\n' > "$PWN_IT_HOME/repos/app.copy-ignored"
sw="$here/setup-worktree.sh"

# 1. Only local/dev config is copied, and production-like paths never are, by any route
#    (allow-list, .copy-ignored entries, files inside .copy-ignored directories).
out="$("$sw" . run-1 first)"
for f in .env .env.local secrets.properties products/.env conf/local.yml; do
  grep -qx "COPIED=$f" <<<"$out" || fail "$f not copied"
done
for f in .env.prod .env.production.local deploy/production/.env conf/app.prod.yml conf/prod/x.yml; do
  [ ! -e "$PWN_IT_WT_ROOT/app/run-1/$f" ] || fail "$f copied"
done
grep -qx "REFUSED=deploy/production/.env" <<<"$out" || fail "deploy/production/.env not refused"
grep -qx "REFUSED=.env.prod" <<<"$out" || fail ".env.prod from .copy-ignored not refused"
for f in svc/.env conf/link.yml cfg/.env; do
  grep -q "^REFUSED=$f (symlink" <<<"$out" || fail "symlink $f not refused"
  [ ! -e "$PWN_IT_WT_ROOT/app/run-1/$f" ] && [ ! -L "$PWN_IT_WT_ROOT/app/run-1/$f" ] || fail "symlink $f copied"
done

# 2. A path with spaces keeps its slot on rerun.
slot1="$(sed -n 's/^PORT_SLOT=//p' <<<"$out")"
slot2="$("$sw" . run-1 first | sed -n 's/^PORT_SLOT=//p')"
[ "$slot1" = "$slot2" ] || fail "slot changed on rerun: $slot1 -> $slot2"
[ "$(wc -l < "$PWN_IT_WT_ROOT/.pwn-it-ports")" -eq 1 ] || fail "duplicate slot reservations"

# 3. Reusing a worktree with a different branch is refused.
if "$sw" . run-1 second >/dev/null 2>&1; then fail "reused run-1 worktree for another branch"; fi
mkdir -p "$PWN_IT_WT_ROOT/app/stray"
if "$sw" . stray x >/dev/null 2>&1; then fail "reused a directory that isn't this repo's worktree"; fi
grep -q '^REFUSED=../../outside.env (outside the repo)$' <<<"$out" || fail "path outside the repo not refused"
[ ! -e "$t/work trees/outside.env" ] || fail "path outside the repo copied"
echo "setup-worktree ok"

# 4. History scan: catches a private value in a binary fixture sanitized later, inside a zip,
#    inside a gzip nested in a zip, in a later member of a multi-member gzip, in a file name, and
#    in the new name of an unchanged file renamed from the base; flags images, including ones
#    inside a zip; never prints the value.
cd "$PWN_IT_WT_ROOT/app/run-1"
marker="zz-private-$RANDOM-marker"
printf 'BIN\0\1\2%s\0end' "$marker" > "fixture data.bin"; g add -f "fixture data.bin"; g commit -qm add
printf 'BIN\0\1\2sanitized\0end' > "fixture data.bin"; g commit -qam sanitize
python3 -I - "$marker" <<'EOF'
import gzip, sys, zipfile
m = sys.argv[1].encode()
zipfile.ZipFile('f.xlsx', 'w', zipfile.ZIP_DEFLATED).writestr('s.xml', m)
with zipfile.ZipFile('nested.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('inner/data.json.gz', gzip.compress(b'{"a": "' + m + b'"}'))
with zipfile.ZipFile('pics.zip', 'w') as z:
    z.writestr('a.png', b'\x89PNG\r\n')
open(sys.argv[1] + '.txt', 'w').write('clean')
open('multi.gz', 'wb').write(gzip.compress(b'clean first member') + gzip.compress(m))
EOF
printf '\x89PNG\r\n' > shot.png; g add -f f.xlsx nested.zip pics.zip shot.png multi.gz "$marker.txt"; g commit -qm more
mkdir -p "dir-$marker"; g mv old.bin "dir-$marker/renamed.bin"; g commit -qm rename
printf 'nothing here\n%s\n' "$marker" | tr '[:lower:]' '[:upper:]' > "$t/values.txt"
set +e; out="$(python3 -I "$here/scan-history.py" . origin/main "$t/values.txt")"; rc=$?; set -e
[ "$rc" = 1 ] || fail "scan exit $rc, want 1"
grep -q '^HIT=.* fixture data.bin value#2$' <<<"$out" || fail "missed the sanitized binary fixture"
grep -q '^HIT=.* f.xlsx value#2$' <<<"$out" || fail "missed the value inside the zip"
grep -q '^HIT=.* nested.zip value#2$' <<<"$out" || fail "missed the value in a gzip inside a zip"
grep -q '^HIT=.* \[value#2\].txt value#2 in-path$' <<<"$out" || fail "missed the value in a file name"
grep -q '^HIT=.* dir-\[value#2\] value#2 in-path$' <<<"$out" || fail "missed the renamed file's new name"
grep -q '^HIT=.* multi.gz value#2$' <<<"$out" || fail "missed the value in a later gzip member"
grep -q '^UNSCANNED=.* shot.png$' <<<"$out" || fail "image not flagged"
grep -q '^UNSCANNED=.* pics.zip$' <<<"$out" || fail "image inside a zip not flagged"
[ "$(grep -c '^HIT=' <<<"$out")" = 6 ] || fail "unexpected hits"
if grep -qi "$marker" <<<"$out"; then fail "scan printed the private value"; fi
# An exhausted unpack budget must stop and flag, not decompress without a limit.
python3 -I -B - "$here/scan-history.py" <<'EOF' || fail "exhausted budget not flagged"
import gzip, importlib.util, sys
spec = importlib.util.spec_from_file_location('scan', sys.argv[1]); scan = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scan)
blob = gzip.compress(b'x' * 1000) + gzip.compress(b'y' * 1000)
for budget in (0, 1000, 1500):
    chunks, partial = scan.unpack('a.gz', blob, 0, [budget])
    assert partial, budget
    assert sum(len(c) for c in chunks) <= len(blob) + budget, budget
assert scan.unpack('a.gz', blob, 0, [2000]) == ([b'x' * 1000 + b'y' * 1000], False)
EOF
# Accented values match in any common casing; overlapping values leave no fragment in printed
# paths; a git error exits 2, never 1 (which means hits).
s2="$t/scan2"; git init -q "$s2"; cd "$s2"
echo x > a; g add .; g commit -qm base; g branch base
printf 'Customer: \xc3\x89LODIE DURAND\n' > data.txt; printf 'c\xc3\xa9line\n' > other.txt
mkdir "Jane Smith"; echo ok > "Jane Smith/f.txt"; g add .; g commit -qm add
printf 'x\n' > "SYNTHETIC-GROSS-id.txt"; g add .; g commit -qm name
printf '\xc3\x89LODIE\nSmith\nJane Smith\nC\xc3\xa9line\nSYNTHETIC-Gro\xc3\x9f\n' > "$t/values2.txt"
set +e; out="$(python3 -I -B "$here/scan-history.py" . base "$t/values2.txt")"; rc=$?; set -e
[ "$rc" = 1 ] || fail "scan2 exit $rc, want 1"
grep -q '^HIT=.* data.txt value#1$' <<<"$out" || fail "missed an accented value in the same case"
grep -q '^HIT=.* other.txt value#4$' <<<"$out" || fail "missed an accented value in another case"
grep -q '^HIT=.* \[value#2,3\] value#2 in-path$' <<<"$out" || fail "overlapping values not blanked together"
if grep -q 'Jane' <<<"$out"; then fail "printed a fragment of a longer value"; fi
grep -q '^HIT=.* \[value#5\]-id.txt value#5 in-path$' <<<"$out" || fail "missed or didn't redact a case-expanded value (ss) in a name"
if grep -qi 'SYNTHETIC-GROSS' <<<"$out"; then fail "printed a case-expanded value"; fi
set +e; python3 -I -B "$here/scan-history.py" . no-such-ref "$t/values2.txt" >/dev/null 2>&1; rc=$?; set -e
[ "$rc" = 2 ] || fail "git error exit $rc, want 2"
echo "scan-history ok"
