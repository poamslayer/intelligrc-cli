# Issue Tracker: GitHub

Issues and product requirements for this repository live as GitHub Issues. Use the `gh`
CLI for all operations.

## Repository safety

This directory is its own Git clone. The `origin` remote is
`https://github.com/arnoldadlv/intelligrc-cli.git`. GitHub resolves that address to
`poamslayer/intelligrc-cli`, so `gh` reports the latter name.

Before reading or changing GitHub Issues:

1. Run `git rev-parse --show-toplevel`.
2. Confirm the result is `/Users/arnoldd/intelligrc`.
3. Run `gh repo view --json nameWithOwner -q .nameWithOwner`.
4. Confirm the result is `poamslayer/intelligrc-cli`.
5. Stop and ask the user if either check fails.

Never create, edit, label, comment on, or close issues in any other repository for
IntelliGRC work. The home directory once carried an unrelated `arnoldadlv/crm` clone;
the checks above guard against that class of mistake.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for a
  multiline body.
- **Read an issue**: `gh issue view <number> --comments`. Fetch labels and filter comments
  with `jq` when structured output is required.
- **List issues**:
  `gh issue list --state open --json number,title,body,labels,comments` with the applicable
  `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`.
- **Add a label**: `gh issue edit <number> --add-label "..."`.
- **Remove a label**: `gh issue edit <number> --remove-label "..."`.
- **Close an issue**: `gh issue close <number> --comment "..."`.

`gh` infers the repository from the `origin` remote when run inside this directory.

## Pull requests as a triage surface

**PRs as a request surface: no.**

A user can change this flag to `yes` later if external pull requests should enter the
triage queue.

## Skill terminology

- "Publish to the issue tracker" means create a GitHub Issue.
- Fetch the relevant ticket with `gh issue view <number> --comments`.

## Wayfinding operations

The `/wayfinder` skill uses one map issue and a set of child issues.

- **Map**: Create one issue labelled `wayfinder:map`. Store the notes, decisions, and
  unresolved questions in its body.
- **Child ticket**: Create a GitHub sub-issue and apply a `wayfinder:<type>` label. Valid
  types are `research`, `prototype`, `grilling`, and `task`.
- **Blocking**: Use GitHub's native issue dependencies when available. Add a
  `Blocked by: #<number>` line to the child issue when native dependencies are unavailable.
- **Frontier**: Select the first open child that has no open blocker and no assignee.
- **Claim**: Run `gh issue edit <number> --add-assignee @me` before starting work.
- **Resolve**: Comment with the answer, close the child issue, and update the map's
  decisions section with a link to the result.

GitHub shares one number sequence between issues and pull requests. Resolve an ambiguous
reference such as `#42` with `gh pr view 42`, then fall back to `gh issue view 42`.
