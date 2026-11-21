# Ship (SHIP) — branches, PRs, issues

## Auth

Verified in `PREFLIGHT`; re-check here if anything returns 401/403.

- `gh auth status` must show a logged-in account with `repo` scope. Owner and repo come from
  `gh repo view --json nameWithOwner` (or `git remote get-url origin`).
- If auth fails or scopes are missing, `ESCALATE`: ask the user to run `! gh auth login` (or
  `! gh auth refresh -s repo,project`).

## Before pushing

1. Before the **first** push (not after): `git fetch origin <base>` and
   `git log --oneline HEAD..origin/<base>`. Any output means the base moved: rebase onto it now,
   so the push never needs a force. Resolve conflicts; if code changed, go back to `VERIFY`.
2. Confirm: commits follow invariant 4, nothing unintended is committed
   (`git diff --stat origin/<base>...HEAD`), no ignored config was force-added.
3. Private-data scan over **every file version** on the branch, not just `HEAD`: a fixture
   sanitized late still leaves the earlier blobs in history, and `git log -p` skips binaries.
   Put any real values seen during the run (names, emails, IDs, hostnames) one per line in a
   file in the run directory (never in the repo), then run
   `python3 -I $SKILL/scripts/scan-history.py <worktree> origin/<base> <file>`. It prints object
   IDs and paths with any value replaced by `[value#n]`, never the values; don't grep for the
   values yourself, which would print them. It also unpacks archives recursively and reports a
   value in a file or directory name (`in-path`) as a hit.
   - `HIT=`: rewrite this branch's unpushed history before the first push (for example
     `git reset --soft origin/<base>`, then recommit in logical commits) and scan again. If it was
     already pushed, `ESCALATE`.
   - `UNSCANNED=` (images, video, PDFs, other compression, encrypted or oversized archive
     members, including inside archives): open each one and look, as for demo stills.
4. `git push -u origin <branch>` (or `--force-with-lease` after a rebase of an already-pushed
   branch — this run's branch only).

## Open the PR

One per repo. Body from `$SKILL/templates/pr-description.md`. Title:
`<type>(<scope>): <summary> (#<n1>, #<n2>, …)` — every issue of the run, primary first. If the
title gets unwieldy (more than about four issues), keep the primary in the title; the description
lists every issue anyway.

- `gh pr create --base <base> --head <branch> --title … --body-file <file>`.
- Link issues in the description: `Closes #N` for each issue this PR fully addresses, `Refs #N`
  for partial ones (use `owner/repo#N` for issues in another repo). GitHub then links each issue to
  the PR. Closing only happens when a human merges.
- Don't add reviewers unless the repo profile says who (or the repo has CODEOWNERS / default
  reviewers configured).
- Images and video: GitHub's API has no PR-attachment upload, and its editors no longer expose
  an `<input type=file>` to automate. Upload through the browser (Claude in Chrome, the user's
  logged-in session) so GitHub hosts the files as `user-attachments` URLs:
  1. Keep videos under 10 MB: re-encode if needed
     (`ffmpeg -i demo.mp4 -c:v libx264 -crf 30 -preset slow -pix_fmt yuv420p -movflags +faststart -an demo-small.mp4`).
  2. Open the PR page. With `javascript_tool`, inject a temporary hidden `<input type=file multiple>`
     into the page.
  3. `file_upload` the stills and video into that input (from the run's artifacts).
  4. With `javascript_tool`, build a `DataTransfer` from the input's files and dispatch a `paste`
     `ClipboardEvent` with it on the comment textarea (if paste is ignored, dispatch `dragenter`,
     `dragover`, `drop` with the same `DataTransfer`).
  5. Wait until the textarea holds a `user-attachments` URL for every file. GitHub inserts images
     as `<img alt="…" src="…">` (not Markdown), so map file name → URL by parsing each tag's
     `alt` and `src` pairs, and save that mapping to a file in the run directory **before**
     clearing anything. Then clear the textarea (native `value` setter + an `input` event) and
     remove the injected input. **Never submit the comment.**
  6. Put the URLs in the PR body with `gh pr edit <n> --body-file <file>`.
  If that fails, do the same on the issue's comment box and link from the PR. Then open the PR
  page and confirm the images actually render.

Multi-repo: every PR's "Related PRs" lists the others with merge order (producer/contract first)
and what breaks if merged out of order. Update earlier PRs once later ones exist.

## Issues

GitHub issues have no built-in workflow status. Mark progress with the first of these that the
repo actually uses (check once in `INTAKE`, record which in `state.md`):

1. **Projects board:** if the issue is on a GitHub Project with a `Status` field
   (`gh issue view <n> --json projectItems`), set it with `gh project item-edit` to the option
   most like the goal. Needs the `project` scope.
   - in progress: "In Progress", "In Development", "Doing", "Started"
   - ready for review: "In Review", "Code Review", "Ready for Review", "Review", "PR Open"
2. **Labels:** if the repo has labels with those meanings (`gh label list`), add the matching
   one and remove the previous status label (`gh issue edit <n> --add-label … --remove-label …`).
   Don't create new labels.
3. **Neither:** skip status changes; the comment and the PR link are enough.

Never move an item to Done, close an issue, change assignees, or edit other fields without
asking.

Comment (`gh issue comment <n> --body-file <file>`) on **each** issue of the run (they share one
PR — say which part of the PR addresses this issue): PR link(s), one-paragraph summary, demo
video (attached or linked), assumptions made, and follow-ups if any. No real user data.
