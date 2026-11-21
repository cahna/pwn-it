#!/usr/bin/env bash
# Create (or reuse) an isolated worktree for one repo of a pwn-it run.
#
# Usage:
#   setup-worktree.sh <repo-root> <RUN_ID> <slug> [--base <branch>] [--dry-run]
#
# Does:
#   1. Fetches origin and creates  <wt-root>/<repo>/<RUN_ID>  on branch
#      <prefix>/<RUN_ID>/<slug>  from  origin/<base>. Reuses both if they already exist, but only
#      if that worktree belongs to this repo and has exactly that branch checked out.
#      <prefix> = $PWN_IT_BRANCH_PREFIX, else $USER.
#   2. Copies gitignored local/dev config files from the repo root into the worktree (never
#      build output, dependencies, data, or logs). Any path with a word naming a shared
#      environment (prod, production, staging, uat, live, release, ...) anywhere in it is
#      refused on every route, including inside directories listed in .copy-ignored. Nothing is
#      copied through a symlink or from outside the repo (a link could point at production
#      config or write through to shared files). Extra paths (files or dirs) can be listed one
#      per line in $PWN_IT_HOME/repos/<repo>.copy-ignored ($PWN_IT_HOME defaults to
#      ~/.claude/pwn-it).
#   3. Allocates a port slot (1..49) unique across all live worktrees, recorded in
#      <wt-root>/.pwn-it-ports, and prints the values the agent must apply.
#
#   <wt-root> = $PWN_IT_WT_ROOT, else <parent of repo-root>/wt (a sibling of the repo).
#
# Output: KEY=VALUE lines for the agent to record in the run state file: WORKTREE, BRANCH, BASE,
# PORT_SLOT, PORT_OFFSET, COMPOSE_PROJECT_NAME, plus per path COPIED, KEPT (already in the
# worktree), REFUSED (production-like or a symlink), SKIPPED_FILE, SKIPPED_DIR, and NOTE. Never pushes.
set -euo pipefail

usage() { sed -n '2,27p' "$0"; exit 2; }
[ $# -ge 3 ] || usage
root="$(cd "$1" && git rev-parse --show-toplevel)"; ticket="$2"; slug="$3"; shift 3
base=""; dry=0
while [ $# -gt 0 ]; do
  case "$1" in
    --base) base="$2"; shift 2 ;;
    --dry-run) dry=1; shift ;;
    *) usage ;;
  esac
done

pwn_home="${PWN_IT_HOME:-$HOME/.claude/pwn-it}"
repo="$(basename "$root")"
wt_root="${PWN_IT_WT_ROOT:-$(dirname "$root")/wt}"
wt="$wt_root/$repo/$ticket"
prefix="${PWN_IT_BRANCH_PREFIX:-$USER}"
branch="$prefix/$ticket/$slug"
run() { if [ "$dry" = 1 ]; then echo "DRY: $*"; else "$@"; fi; }

# --- base branch ---------------------------------------------------------------------------
if [ -z "$base" ]; then
  base="$(git -C "$root" symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##' || true)"
  if [ -z "$base" ]; then
    for b in main master develop; do
      git -C "$root" show-ref --verify --quiet "refs/remotes/origin/$b" && { base="$b"; break; }
    done
  fi
fi
[ -n "$base" ] || { echo "could not determine base branch; pass --base" >&2; exit 1; }

# --- worktree ------------------------------------------------------------------------------
run git -C "$root" fetch --quiet origin "$base"
common() { (cd "$1" && cd "$(git rev-parse --git-common-dir)" && pwd -P) 2>/dev/null; }
if [ -e "$wt" ]; then
  # Reuse only our own worktree on our own branch; anything else would put work on another run's branch.
  [ "$(common "$wt")" = "$(common "$root")" ] || { echo "$wt exists but is not a worktree of $root" >&2; exit 1; }
  have="$(git -C "$wt" symbolic-ref --short -q HEAD || true)"
  [ "$have" = "$branch" ] || { echo "$wt has '${have:-detached HEAD}' checked out, not $branch; a fresh run needs its own RUN_ID (e.g. <key>-2)" >&2; exit 1; }
  echo "NOTE=reusing existing worktree"
elif git -C "$root" show-ref --verify --quiet "refs/heads/$branch"; then
  run mkdir -p "$(dirname "$wt")"
  run git -C "$root" worktree add "$wt" "$branch"
else
  run mkdir -p "$(dirname "$wt")"
  run git -C "$root" worktree add --no-track -b "$branch" "$wt" "origin/$base"
fi

# --- gitignored config copy ----------------------------------------------------------------
# A path is production-like if any word in it (split on / . - _ etc., trailing digits dropped)
# names a shared environment. Whole words, so products/ or livestock/ are not caught.
is_prodlike() {
  local w
  for w in $(printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9' ' '); do
    case "${w%%[0-9]*}" in prod|prd|production|preprod|stag|stage|staging|stg|uat|live|release) return 0 ;; esac
  done
  return 1
}
# Allow-list of local/dev config names; anything else that is ignored is reported, not copied.
is_config() {
  local name; name="$(printf '%s' "${1##*/}" | tr '[:upper:]' '[:lower:]')"
  case "$name" in
    .env|.env.local|.env.dev|.env.dev.local|.env.development|.env.development.local|.env.test|.env.test.local) return 0 ;;
    local.env|dev.env|development.env|test.env|.envrc) return 0 ;;
    settings.local.json|.mcp.json|secrets.properties|local.properties) return 0 ;;
    application-local.*|application-dev.*|*.local.yml|*.local.yaml|*.local.json|*.local.properties) return 0 ;;
    .npmrc|.tool-versions|.nvmrc|.sdkmanrc) return 0 ;;
  esac
  case "$1" in .claude/settings.json|.vscode/settings.json) return 0 ;; esac
  return 1
}
copy_one() {  # copy_one <relative path>; every copy route goes through here
  local rel="$1" f p="" part parts
  case "/$rel/" in //*|*/../*) echo "REFUSED=$rel (outside the repo)"; return 0 ;; esac
  # A symlink anywhere in the path (not just the last part) could route the copy elsewhere.
  IFS=/ read -ra parts <<<"$rel"
  for part in "${parts[@]}"; do
    p="${p:+$p/}$part"
    if [ -L "$root/$p" ]; then echo "REFUSED=$rel (symlink at $p; copy the real file by hand if it is local config)"; return 0; fi
  done
  [ -e "$root/$rel" ] || return 0
  if is_prodlike "$rel"; then echo "REFUSED=$rel"; return 0; fi
  if [ -d "$root/$rel" ]; then
    # File by file, so production-like files inside the directory are refused too.
    while IFS= read -r -d '' f; do copy_one "${f#"$root/"}"; done \
      < <(find "$root/$rel" \( -type f -o -type l \) -print0)
    return 0
  fi
  [ -e "$wt/$rel" ] && { echo "KEPT=$rel"; return 0; }   # never clobber worktree-local edits
  run mkdir -p "$(dirname "$wt/$rel")"
  run cp -p "$root/$rel" "$wt/$rel"
  echo "COPIED=$rel"
}

while IFS= read -r rel; do
  case "$rel" in
    */) echo "SKIPPED_DIR=$rel" ;;
    *) if is_config "$rel"; then copy_one "$rel"; else echo "SKIPPED_FILE=$rel"; fi ;;
  esac
done < <(git -C "$root" ls-files --others --ignored --exclude-standard --directory \
          | grep -vE '(^|/)(node_modules|target|dist|build|out|coverage|\.angular|\.gradle|\.nx|\.cache|__pycache__|bower_components|\.DS_Store)(/|$)')

extra="$pwn_home/repos/$repo.copy-ignored"
if [ -f "$extra" ]; then
  while IFS= read -r rel; do
    case "$rel" in ''|'#'*) continue ;; esac
    copy_one "${rel%/}"
  done < "$extra"
fi

# --- port slot -----------------------------------------------------------------------------
reg="$wt_root/.pwn-it-ports"
slot=""
if [ "$dry" = 0 ]; then
  mkdir -p "$wt_root"; touch "$reg"
  # Serialize concurrent runs. shortcut: a SIGKILLed run leaves the lock dir behind; remove it by hand.
  lock="$reg.lock"; tries=0
  until mkdir "$lock" 2>/dev/null; do
    tries=$((tries + 1)); [ "$tries" -lt 300 ] || { echo "port registry locked: remove $lock if no run is active" >&2; exit 1; }
    sleep 0.1
  done
  trap 'rmdir "$lock"' EXIT
  # prune slots whose worktree no longer exists
  tmp="$(mktemp)"; while read -r s p; do [ -d "$p" ] && echo "$s $p"; done < "$reg" > "$tmp"; mv "$tmp" "$reg"
  # Each line is "<slot> <path>"; the path may contain spaces, so compare everything after the first one.
  slot="$(P="$wt" awk 'substr($0, index($0, " ") + 1) == ENVIRON["P"] {print $1}' "$reg")"
  if [ -z "$slot" ]; then
    for s in $(seq 1 49); do
      awk -v s="$s" '$1==s{f=1} END{exit !f}' "$reg" || { slot="$s"; break; }
    done
    [ -n "$slot" ] || { echo "no free port slot" >&2; exit 1; }
    echo "$slot $wt" >> "$reg"
  fi
else
  slot="(dry-run)"
fi

compose="$(printf '%s-%s' "$repo" "$ticket" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9_\n-' '-')"
echo "WORKTREE=$wt"
echo "BRANCH=$branch"
echo "BASE=$base"
echo "PORT_SLOT=$slot"
[ "$dry" = 0 ] && echo "PORT_OFFSET=$((slot * 100))"
echo "COMPOSE_PROJECT_NAME=$compose"
