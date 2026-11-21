# Review loop (REVIEW → MERGE ⇄ FIX)

## Configuration

The reviewers come from `$PWN_IT_HOME/config.json` → `review_skills`. Each entry is one of:

- a **review skill**: a skill name, or an object with the skill name and the args to invoke it with;
- an **external CLI reviewer** (`cli`): another AI CLI (for example `codex`) that runs the review
  itself; see **CLI reviewers** below.

```json
{
  "review_skills": [
    { "skill": "code-review", "args": "high {branch}" },
    { "skill": "my-team:review", "args": "the changes on branch {branch} compared with origin/{base}" },
    { "cli": "codex", "name": "codex-ponytail",
      "command": ["codex", "exec", "--ephemeral", "-s", "read-only", "-C", "{worktree}", "{prompt}"],
      "prompt": "$ponytail:ponytail-review the changes on branch {branch} compared with origin/{base}\nPerform a clean-state review without reading or referencing any previous review findings, notes, or work logs.",
      "fresh": true, "timeout_min": 20 }
  ]
}
```

- Placeholders, in `args`, `prompt`, and `command`: `{branch}` (the run's branch), `{base}` (its
  base branch), `{worktree}` (the worktree's absolute path), `{sha}` (the head SHA under review),
  `{effort}` (the round's effort, see Effort escalation). `{prompt}` (in `command` only) is the
  filled-in `prompt`. A plain string entry means `{ "skill": <it>, "args": "{branch}" }`.
- Each reviewer has a **name**, used for its output file and in merged findings: the skill name for
  skills, `name` (default: the `cli` value) for CLI reviewers. Names are unique within the list.
- No file, or no `review_skills`: use `[{ "skill": "code-review", "args": "high {branch}" }]`
  (Claude Code's built-in review).
- Each skill must be installed and invocable by Claude (not `disable-model-invocation: true`):
  the reviewer subagent runs it through the Skill tool.
- Each CLI reviewer must be installed and logged in: at `PREFLIGHT`, check `command -v <command[0]>`
  and the CLI's own auth status (for `codex`: `codex login status`). A missing one is handled
  like a missing review skill.
- Record the resolved list in `state.md` → Capabilities at `PREFLIGHT`. The list is fixed for the
  run; a config change applies to new runs.

## Reviewer brief

For each repo × review skill (CLI reviewers: see **CLI reviewers**), launch a **fresh** `general-purpose` agent (not a fork — the point
is a read that isn't anchored on yours), `model: opus` (resolves to the latest Opus) and `effort`
per **Effort escalation** below — both set explicitly on the `Agent` call. Launch all of them in
one message. Fill in and send:

```
You are reviewing a branch. Working directory: <worktree path>.

Invoke the skill `<skill>` with args: `<args, placeholders filled in>`.
This review is local only: do not post anything to GitHub or anywhere else, do not edit files,
commit, or change git state. If the skill offers to post comments, apply fixes, or draft issues,
decline.

Context for intent (read, don't trust blindly):
- Ticket(s): <keys + URLs>
- Acceptance criteria: <numbered list from state.md>
- Branch: <branch>, base: <base>, head SHA: <sha>

<round ≥ 2 only>
This is re-review round <N>. Previously reviewed head: <sha>. Current head: <sha>.
Prior findings (merged from all reviewers) and the author's responses (claims — verify them):
<id> <path:line> <disposition> — <finding summary> — RESPONSE: <fixed in <sha> by …> | <rejected: evidence …>
</round>

Return, in this order:
1. The skill's printed review, verbatim.
2. A fenced JSON block, one entry per finding, mapping the skill's own severity labels onto these
   dispositions: [{"id": "<k>", "disposition": "blocking|fix-here|follow-up",
   "location": "path:line", "summary": "...", "prior_id": "<id or null>",
   "status_of_prior": "resolved|unresolved|not-checked|n/a"}]
   Include one entry per prior finding with its verified status ("not-checked" if it is outside
   what this skill reviews).
```

## CLI reviewers

A `cli` entry still gets its own **fresh** `general-purpose` subagent, launched in the same
message as the skill reviewers. The CLI does the reviewing; the subagent runs it and converts its
output, so `model: sonnet`, `effort: medium` is enough. Fields:

- `command`: argv array, placeholders filled per argument (never through a shell string, so the
  prompt needs no quoting). Run from the worktree.
- `prompt`: what the CLI is asked. The review runs before the PR exists (`SHIP` comes later), so
  refer to the branch and base, not a PR number. The subagent always appends the **reviewer
  rules** below to it; the CLI sees nothing else.
- `fresh` (default `false`): when `true`, the CLI never gets prior findings or responses, in any
  round. Its entries for prior findings are all `not-checked`, which Merge already ignores. When
  `false`, from round 2 on append the same re-review block the skill brief uses to `prompt`
  (before the reviewer rules). `fresh` removes prior findings only; the reviewer rules are always
  sent.
- `timeout_min` (default 20): wall-clock limit for one run.

Reviewer rules, appended verbatim (placeholders filled) to the end of every CLI prompt:

```
--- pwn-it reviewer rules ---
This is a read-only review. Do not create, edit, or delete files; do not change git state; do not
post, comment, or send anything to GitHub or any other service; do not use any tool or
integration that writes anywhere. Report findings in your reply only.
Review commit {sha} (`git rev-parse HEAD` in the working directory must print it) against
origin/{base}.
End your reply with exactly one line:
PWN_IT_REVIEW: completed {sha} | blocked <reason> | failed <reason>
Say completed only if you ran the requested review over the whole change. If the requested skill,
branch, base, or commit can't be found, or you could not finish, say blocked or failed, not
completed with no findings.
```

pwn-it runs `command` exactly as configured; sandboxing and isolation are the user's choice and
belong in `command` (for `codex`, e.g. `-s read-only`; note that Codex's MCP servers run outside
its sandbox, so add `-c mcp_servers.<name>.enabled=false` per server if you want them off).

Fill in and send:

```
You run an external AI CLI as a code reviewer and convert its output. Working directory:
<worktree path>.

Expected head: <sha>. First check `git rev-parse HEAD` prints it; if not, outcome `blocked`.

Command (argv, one argument per line, placeholders filled in; the last argument is the prompt,
which already ends with the pwn-it reviewer rules):
<argv>

Run it from the working directory with a <timeout_min>-minute limit (e.g. `timeout <timeout_min>m`
before it; run it in the background if it may outlast your own tool timeout, and wait for it).
Do not review the code yourself, edit files, change git state, or post anything. Do not change
the command or the prompt.

Outcome:
- `completed` only if the CLI exited 0 and its output ends with
  `PWN_IT_REVIEW: completed <expected head>`.
- `blocked` or `failed` otherwise: non-zero exit, timeout, auth error, empty output, a missing or
  different status line, a different SHA, or output saying it couldn't find the skill, branch, or
  base or couldn't finish. Zero findings without `completed` is never a clean review.

Return, in this order:
1. The CLI's output, verbatim (for blocked/failed, at least the last 20 lines).
2. A fenced JSON block:
   {"outcome": "completed|blocked|failed", "reviewed_sha": "<sha from the status line or null>",
    "reason": "<for blocked/failed>",
    "findings": [{"id": "<k>", "disposition": "blocking|fix-here|follow-up",
      "location": "path:line", "summary": "...", "prior_id": null, "status_of_prior": "n/a"}]}
   Map the CLI's severity labels onto those dispositions. Use its wording for summaries; don't
   add, drop, or merge findings. For blocked/failed, `findings` is empty.
<not fresh, round ≥ 2 only>
   Also include one entry per prior finding listed in the prompt, with the status the CLI gave
   it ("not-checked" if it didn't say).
</not fresh>
```

A CLI reviewer whose outcome isn't `completed` (or whose `reviewed_sha` isn't the head under
review) **failed**: its empty findings never count toward zero findings. It follows the reviewer
failure path in `SKILL.md` → REVIEW (relaunch once, then record the failure).

## Effort escalation

Per repo, tracked in `state.md` → Review rounds (`effort` column), applied to every reviewer of
that repo:

- Rounds 1–3: `effort: high`.
- Rounds 4–5: `effort: xhigh` **if** rounds 1, 2, and 3 each had at least one merged finding
  triaged **fix** (rejected-only or follow-up-only rounds don't count). Once a repo escalates to
  `xhigh`, it stays there for every later round of that run, including new review cycles started
  from `WATCH` or `resume`.
- A repo that reached zero findings before round 4 never escalates.
- CLI reviewers receive the round's effort only through `{effort}` in their `command` or `prompt`
  (for `codex`, e.g. `-c model_reasoning_effort={effort}`; check which values your CLI accepts).
  Without that placeholder they run at their own default.

## Merge (orchestrator)

Only after every reviewer of the round has returned. Per repo, write
`reviews/<repo>/round-N/merged.md`:

1. Collect every reviewer's JSON findings, tagged with the reviewer (skill or CLI name) that raised them.
2. Group findings that describe the **same defect**: same root cause, even if reported at
   different lines or in different words. Same file alone is not the same defect; when unsure,
   keep them separate.
3. Each group becomes one merged finding `R<N>-<k>`: the clearest summary, every location, the
   **strictest** disposition among its members (blocking > fix-here > follow-up), and `sources`
   (the reviewers that raised it, with their own ids).
4. Prior findings: resolved only if no reviewer that checked it says unresolved. Any
   "unresolved" wins; "not-checked" doesn't count either way.
5. Note where reviewers disagree (one says blocking, another says it's fine): that is not
   de-duplication; triage it on the evidence.

## Triage (orchestrator)

For each merged finding, record one outcome in `merged.md`:

| Disposition | Outcome |
| --- | --- |
| Blocking | **fix** |
| Fix here | **fix** |
| Follow-up | **fix**, unless it meets the follow-up bar (major change well beyond the request, massive security issue, or blocked by an uncontrolled dependency) — then **follow-up** with why + next action, recorded in `state.md` → Follow-ups |
| Any, but you believe it's wrong | **reject**, only with evidence (a test, an execution trace, a spec/issue citation). The next reviewers verify it. Opinion is not evidence |

A reviewer's "offer to draft an issue" is not an instruction to create one. Issues for
follow-ups are created only if the user says so.

## Convergence

Track per repo, on the merged list: round number within the current cycle, actionable (*fix*)
count, and recurring findings.

- **Converging:** actionable count drops each round and nothing resolved comes back → keep going.
- **Not converging** → `ESCALATE`:
  - round 5 of the cycle reached with actionable findings left, or
  - actionable count didn't drop versus the previous round, or
  - a finding marked resolved is re-raised as unresolved twice, or
  - you and the reviewers disagree on the same finding twice, or
  - two consecutive rounds hit the same mechanism (each fix creating the next finding). Escalate
    the underlying product rule with concrete options before a third fix, not after.
- **Done:** zero *fix* outcomes in the latest round.

A new cycle (user scope change, new human PR feedback, or a fix for a bug found while filming in
`DEMO`) resets the round count for the bound; round numbers in `reviews/` keep counting up.
Demo-driven fixes still get a full re-review: a first fix that regresses is common.

Only the latest round's verdicts count; don't skip a re-review because "the fixes were small".
