# Delegation

## Worker brief

Every implementation worker gets a brief with all of these. It knows nothing else.

```
Goal: <one or two sentences — the outcome, not the steps>
Ticket context: <key>: <the acceptance criteria this stream satisfies>
Worktree: <absolute path> (work only here; address files by absolute path)
You own: <files/dirs> — edit nothing else. If you must touch something outside, stop and report.
Contract: <interfaces/types/API shapes you must implement or consume, verbatim or by path>
Definitions: <the issue's own definitions of fields, terms, and rules this stream touches, quoted
             verbatim; never paraphrased>
Conventions: <repo CLAUDE.md rules that apply; patterns to copy, with example file paths>
Already decided: <decisions and assumptions from state.md relevant to this stream>
Ruled out: <approaches already rejected and why>
Verify with: <exact commands, e.g. the repo's unit-test command for the touched module>
Do not: commit, checkout, rebase, stash, push, or change git state; start/stop services;
        change ports or shared config; add dependencies without saying so in your report.
Report back (concise):
  - files changed, one line each on what and why
  - verification commands run and their results (paste failures verbatim, short)
  - anything you could not do, assumptions you made, risks you noticed
  - how you interpreted any term or field that could mean more than one thing
```

## Choosing parallelism

- Draw the stream dependency graph from `PLAN`. Launch every stream whose dependencies are done,
  together, in one message.
- Split by ownership boundary (module, layer, repo), not by step. "Backend service + its tests"
  is one stream; "frontend component + its tests" is another.
- Contract first: a stream that defines a shared interface runs before the streams that consume
  it. Paste the landed contract into the dependents' briefs.
- Don't parallelize below the integration cost: XS/S work is faster done directly.
- Stacked PRs: work for a dependent PR can start on the earlier PR's head while its review runs,
  when review fixes are unlikely to touch the shared contract. Rebase it once the earlier PR settles.
- One build/test run per worktree at a time when the toolchain locks shared output directories
  (Maven `target/`, Angular cache). Have workers run scoped tests; you run the full suite in
  `VERIFY`.

## After a worker returns

- Read the diff, not just the report. Reports describe intent; the diff is what happened.
- Compare the interpretations parallel workers report. If two read the same term differently,
  settle it (from the issue, or `CLARIFY`) before integrating either.
- Run its verify commands yourself before committing.
- If it failed, re-brief with the failure and what to try differently, one model/effort tier up.
- If its build or tests were killed by the harness or the OS (memory pressure, often from other
  sessions), that isn't the worker's failure: check `free -h`, then rerun only the unfinished
  tasks yourself, without relaunching the worker.
