# pwn-it run: <RUN_ID>

node: PREFLIGHT        <!-- current node; update on every transition -->
status: active         <!-- active | waiting-on-user | shipped | abandoned -->
waiting_on:            <!-- when waiting-on-user: the question and the node to return to -->
started: <ISO-8601>
args: <verbatim invocation arguments>
run_dir: $PWN_IT_HOME/runs/<RUN_ID>/
summary_file:          <!-- <run_dir>/summary.md, set in REPORT -->

## Transition log

- <ISO> START → PREFLIGHT: new run

## Capabilities (PREFLIGHT)

| capability | status | note |
| --- | --- | --- |
| Repo (`$REPO`) | | path, `owner/repo`: |
| GitHub `gh` | | account, scopes: |
| Issue status mechanism | | project board / labels / none: |
| Claude in Chrome | | |
| Chrome DevTools MCP | | |
| ffmpeg / docker | | |
| Reviewers | | resolved list from config (skills + CLIs); missing or logged-out ones: |

## Request

- Primary issue: #<n> (key `<repo>-<n>`)
- Issues (all, in argument order): #<n> — <title> — <url> — state at intake: <state / board status / labels>
- Request docs:
- Supporting docs / links followed:
- Prior context (related issues/PRs, earlier runs):

Restatement: <one paragraph>

Acceptance criteria:
1. [<source: #n or doc>] <criterion> <!-- mark inferred ones "(inferred)" -->

## Assumptions

<!-- made instead of asking; each must appear in the PR and the summary -->

## Questions & answers

## Decisions

<!-- what · why · alternatives rejected -->

## Repos

| repo | why it changes | order | worktree | branch | base | slot / offset | compose project | services → ports |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

Verify commands:
- <repo>: build `…` · lint `…` · types `…` · tests `…`

## Plan

- Size: <XS|S|M|L>
- Workstreams:
  - W1 — <repo> — owns <paths> — depends on <—> — <model/effort or "orchestrator">
- Test plan:
- Demo plan (edit plan): surface <ui|api|cli|none>

  | # | Claim | Shown by | Region to highlight | Expected fact BEFORE | Expected fact AFTER |
  | --- | --- | --- | --- | --- | --- |

  Steps per claim (URL/command, action, what is visible, caption):
  1.
- Re-shoot setup: DB snapshot <path>; BEFORE build <base worktree path @ sha>; switch <command>

## Verify

| criterion | evidence | result |
| --- | --- | --- |

Last run: <ISO> <commands> → <pass/fail summary>

## Review rounds

<!-- counts are of merged findings; cycle resets on scope change / new human feedback / demo-found bug -->
| repo | cycle | round | effort | reviewed SHA | reviewers (ok/failed) | blocking | fix-here | follow-up | fixed | rejected | merged file |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

## Artifacts

- before:
- after:
- video:
- PR stills:

## Ship

- PRs:
- Issue status updates / comments:
- Services stopped:

## Follow-ups

<!-- only: major change beyond scope · massive security issue · blocked by uncontrolled dependency.
     each: what · why not in this change · next action -->
