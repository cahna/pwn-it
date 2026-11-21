# Worktree isolation (SETUP)

Goal: every repo touched by the run gets its own worktree whose processes cannot collide with the
repo root checkout, with other worktrees, or with other runs — ports, container names, volumes,
databases, caches, or browser sessions.

## 1. Create the worktree

```bash
$SKILL/scripts/setup-worktree.sh "$REPO" <RUN_ID> <short-slug> [--base <branch>]
```

- Run with `--dry-run` first if anything about the repo is unusual.
- Path: `<repo-parent>/wt/<repo>/<RUN_ID>` (a sibling of the repo, so it never sits inside the
  checkout), or `$PWN_IT_WT_ROOT/<repo>/<RUN_ID>` when that is set. Use the `WORKTREE=` value the
  script prints rather than reconstructing it. Branch: `<prefix>/<RUN_ID>/<slug>` from `origin/<base>`,
  where `<prefix>` is `$PWN_IT_BRANCH_PREFIX`, else `$USER`.
  The base defaults to `origin/HEAD` (else `main`, `master`, `develop`). Use `--base` when the
  ticket targets a release or feature branch.
- Re-running is safe: it reuses the worktree and branch, keeps worktree-local config edits, and
  returns the same port slot. It refuses to reuse a path that isn't this repo's worktree or has a
  different branch checked out; never work around that by reusing another run's worktree.
- Record every `KEY=VALUE` the script prints in `state.md` → Repos.

## 2. Gitignored config

The script copies ignored files that are clearly local/dev config (`.env`, `.env.local`,
`.env.{dev,development,test}[.local]`, `{local,dev,development,test}.env`, `.envrc`,
`settings.local.json`, `.claude/settings.json`, `.mcp.json`, `.vscode/settings.json`,
`secrets.properties`, `local.properties`, `application-{local,dev}.*`,
`*.local.{yml,yaml,json,properties}`, `.npmrc`, version-manager files). A path with any word
naming a shared environment (`prod`, `prd`, `production`, `preprod`, `stag`, `stage`, `staging`,
`stg`, `uat`, `live`, `release`) anywhere in it, directories included, is never copied by any
route, `.copy-ignored` too, and is reported as `REFUSED=`. Nothing is copied through a symlink,
at any level of the path, or from outside the repo (`REFUSED=… (symlink at …)`): a link can
point at production config or write through to the root checkout's files. If the target is
local config, copy the file itself by hand. The rest is reported as `SKIPPED_FILE=` /
`SKIPPED_DIR=`. Read the skipped list:

- Build output, dependencies, logs, test reports, local DB data → correct to skip.
- Production, staging, or shared-environment config → correct to skip; never copy it by hand.
- Anything the app needs to boot locally (auth fixtures, local-dev config dirs, generated static
  assets the build doesn't regenerate) → copy it, and add the path to
  `$PWN_IT_HOME/repos/<repo>.copy-ignored` so future runs get it automatically.
- If `.envrc` was copied, run `direnv allow` in the worktree.

## 3. Ports, containers, and data

Find everything that binds a port or owns shared state: `docker-compose*.yml` / `*.tpl`, `.env`
keys ending in `PORT`/`_URL`, `application*.yml|properties` (`server.port`, datasource URLs),
dev-server configs (`angular.json` serve port, `vite.config`, `package.json` scripts), debug
ports, and anything else the repo profile lists.

Apply the slot from the script (`PORT_OFFSET = slot × 100`):

- New port = default port + `PORT_OFFSET` (e.g. MySQL 3306 → 3406 for slot 1). If a result
  collides with a known well-known port, skip to the next slot.
- Set `COMPOSE_PROJECT_NAME` (from the script) in the worktree's `.env` or pass `-p` on every
  compose command, so container names, networks, and volumes are namespaced.
- Remove or rename fixed `container_name:` values via a worktree-local override file
  (`docker-compose.override.yml` or `-f` an extra file kept out of git), never by editing the
  tracked compose file.
- Point the app's URLs/datasources at the new ports (worktree `.env` / local profile). Keep these
  edits in ignored files only.
- Separate database per worktree (its own container/volume via the compose project, or its own
  schema). Never point a worktree at the root checkout's database.
- Before starting, check nothing is listening: `lsof -nP -iTCP:<port> -sTCP:LISTEN`.
- Record the final port map in `state.md` → Repos (service → port) and in the repo profile if it
  was non-obvious.

## 4. Dependencies and services

- Install dependencies with the repo's normal command. Sharing a package manager cache is fine;
  copying `node_modules`/`target` from another checkout is not (stale artifacts from a different
  branch cause phantom failures).
- Start only what the tests and demo need. Run long-lived processes in the background and record
  how to stop them.
- Smoke-check: health endpoint or login page responds on the worktree's port.

## 5. Browser isolation

When demoing, use the worktree's URL (its own port), so cookies/local storage don't bleed from
the root app on the default port. Log in with local seed users from the repo profile.

## 6. Teardown

- `SHIP` stops this run's services (`docker compose -p <project> stop` or `down` *without* `-v`,
  plus background dev servers). Keep the worktree: the PR may need more changes.
- Never remove a worktree or its branch in this skill. Removal happens after merge; the summary
  tells the user the commands (`git worktree remove …`, `git branch -d …`).
