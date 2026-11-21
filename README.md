# pwn-it

A Claude Code skill that owns a piece of
development work end to end. Give it GitHub issues and/or docs; it plans the work, implements it
in isolated git worktrees with parallel subagents, runs a review/fix loop with one or more review
skills, records a before-vs-after demo video, then pushes, opens the PR, and updates the issues.

Runs are stateful and resumable: everything lives in a state file, so a compaction or a restart
doesn't lose the thread.

```
/pwn-it #123                      # one issue
/pwn-it #123 #124 docs/spec.md    # several inputs, one combined PR
/pwn-it resume <RUN_ID> [what changed]
```

Run it from the root of the target repo. `SKILL.md` has the full workflow graph and node
contracts; `references/` holds the detailed procedures.

## What it does on its own (and what it won't)

Invoking it authorizes: marking the run's issues in progress / ready for review, commenting on
them, pushing the run's own branches, opening PRs, and uploading demo media to them.

It asks first before: merging, closing issues, pushing to a base branch, force-pushing anything
but its own branch, touching other people's PRs, or changing shared environments.

## Requirements

- Claude Code, with a GitHub repo checked out locally (`origin` on GitHub)
- [`gh`](https://cli.github.com/) logged in with the `repo` scope (`project` too if your issues
  live on a Projects board)
- `git`, `node` (18+), `npm`, `ffmpeg`, `python3` (3.8+); `docker` if your app runs in compose
- For UI demos: the Claude in Chrome extension (start Claude Code with `claude --chrome`).
  Uploading demo media to PRs needs it too: GitHub has no API for PR attachments, so pwn-it
  drives the PR page in your logged-in browser to upload them (`references/ship.md`). That is a
  workaround that depends on GitHub's page internals and may break when GitHub changes them.
- The film kit installs its own pinned Playwright and headless Chromium on first use
  (`film-kit/setup-playwright.sh`); it never uses the target repo's.

## Install

```bash
git clone <this repo> ~/.claude/skills/pwn-it
```

Any skills directory works; the skill resolves its own location at runtime.

## Configuration

pwn-it keeps its data in `~/.claude/pwn-it/` (override with `PWN_IT_HOME`), never in the skill
directory:

```
~/.claude/pwn-it/
  config.json                 # optional, see below
  runs/<RUN_ID>/              # state, artifacts, reviews, summary per run
  repos/<repo>.md             # per-repo profile pwn-it learns and reuses
  repos/<repo>.copy-ignored   # extra gitignored paths to copy into worktrees
  LEARNINGS.md                # friction with the skill, for you to fold back in
```

### Review skills

The review step runs one fresh subagent per configured review skill, in parallel, then merges
and de-duplicates their findings before fixing. Configure the list in
`~/.claude/pwn-it/config.json`:

```json
{
  "review_skills": [
    { "skill": "code-review", "args": "high {branch}" },
    { "skill": "my-team:review", "args": "the changes on branch {branch} compared with origin/{base}" }
  ]
}
```

A plain string is invoked with the branch name as its argument. Placeholders: `{branch}`,
`{base}`, `{worktree}`, `{sha}`, `{effort}`. Without a config, pwn-it uses Claude Code's built-in
`code-review` with args `high {branch}`. Any skill you list must be installed, and invocable by
Claude (not `disable-model-invocation: true`), because each one runs inside a reviewer subagent.
pwn-it checks at the start of each run.

An entry can also be another AI CLI, run as one of the parallel reviewers. pwn-it runs the command
(argv, no shell) from the worktree, and a subagent converts its output into the same findings
format so it merges with the rest. `fresh: true` never shows it earlier rounds' findings:

```json
{ "cli": "codex", "name": "codex-ponytail",
  "command": ["codex", "exec", "--ephemeral", "-s", "read-only", "-C", "{worktree}", "{prompt}"],
  "prompt": "$ponytail:ponytail-review the changes on branch {branch} compared with origin/{base}\nPerform a clean-state review without reading or referencing any previous review findings, notes, or work logs.",
  "fresh": true, "timeout_min": 20 }
```

pwn-it runs `command` as written, so put the CLI's sandbox and isolation flags there (for Codex,
`-s read-only` doesn't restrict MCP servers; add `-c mcp_servers.<name>.enabled=false` per server
if you want them off). pwn-it appends fixed rules to every CLI prompt (read-only, never post,
review this exact commit, end with a `completed`/`blocked`/`failed` status line) and treats any
run that doesn't report `completed` for the head commit as a failed reviewer, never a clean one. Reviews run before the PR exists, so refer
to the branch, not a PR number. Details in `references/review-loop.md` → CLI reviewers.
The CLI must be installed and logged in; pwn-it checks at the start of each run.

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PWN_IT_HOME` | `~/.claude/pwn-it` | Data directory |
| `PWN_IT_WT_ROOT` | `<repo parent>/wt` | Where worktrees go |
| `PWN_IT_BRANCH_PREFIX` | `$USER` | Branch names are `<prefix>/<RUN_ID>/<slug>` |
| `PWN_IT_PLAYWRIGHT` | `~/.local/share/pwn-it/playwright` | Film kit's Playwright install |
| `FILM_CHROMIUM`, `FILM_HEADLESS`, `FILM_PLAYWRIGHT_FROM` | | See `film-kit/README.md` |

## Layout

| Path | What |
| --- | --- |
| `SKILL.md` | The workflow: graph, node contracts, invariants, delegation |
| `references/` | Procedures for worktrees, demo capture, review loop, shipping, delegation |
| `templates/` | Run state, PR description, work summary, repo profile |
| `scripts/setup-worktree.sh` | Creates a worktree, copies gitignored local/dev config, allocates a port slot |
| `scripts/scan-history.py` | Pre-push scan of every file version on the branch for known private values |
| `scripts/selftest.sh` | Checks both scripts against a throwaway repo |
| `film-kit/` | Building blocks for the demo video; `film-kit/selftest/selftest.sh` exercises them (for developing the kit; it writes to the gitignored `film-kit/selftest/out/`) |

## License

MIT
