# #<primary> (+ <other issues>): <short description of work>

<!-- Written to <run_dir>/summary.md.
     Markdown only. No real user data, no secrets. Keep it true: update it whenever the work changes. -->

- **Issue(s):** [#<n1>](<url>) — <status> · [#<n2>](<url>) — <status> · …
- **Docs:** <input docs>
- **PR(s):** [<repo> #<n>](<url>) — <state>
- **Branch(es):** `<branch>` in `<repo>` (worktree `<worktree path>`)
- **Demo:** `<path to demo.mp4>` (also attached to the PR / issue)
- **Dates:** started <YYYY-MM-DD>, last updated <YYYY-MM-DD>

## Initial request

<What was asked, by whom, and why — paraphrased from the issue(s)/docs. Link the sources.>

## Decisions

<Each decision: what was decided, why, what was rejected. Include answers to clarifying
questions and the assumptions made without asking.>

## Work completed

<By repo: what changed and how it satisfies each acceptance criterion. How it was verified
(tests, demo). Review rounds and what they caught.>

## Risks

<What could go wrong in review, deploy, or production; blast radius; anything that needs
careful QA.>

## Dependencies

<Cross-repo merge order, config/infra/feature-flag needs, other teams or issues this relies on.>

## Follow-ups

<Only items meeting the follow-up bar, each with why it's not in this change and the next
action. "None" is a fine answer.>

## Cleanup after merge

```bash
git -C <repo path> worktree remove <worktree path>
git -C <repo path> branch -d <branch>
```

## Changelog

- <YYYY-MM-DD>: initial summary
