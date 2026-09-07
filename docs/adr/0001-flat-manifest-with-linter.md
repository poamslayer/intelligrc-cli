---
status: accepted
date: 2026-09-07
---

# Keep the flat command manifest as the source of truth and enforce conventions with a linter

The command manifest in `src/manifest.ts` is one hand-written list of 78 command
definitions, each carrying its verb, flags, permission, and the documented operation it
sends. In September 2026 a handoff proposed rebuilding it as one declarative record per
resource, after Cloudflare's rebuild of Wrangler as `cf`, so that command files, README
sections, the agent skill, an OpenAPI document, dry-run, and a local mirror could all be
generated from those records. We decided not to do that. The manifest stays flat and
per-command, and a test enforces the naming and flag conventions over that list.

## Why

- Every convention the redesign wanted to enforce (a closed verb set, summaries that
  begin with the verb, paired association reads and writes, one meaning per flag name,
  shared output flags) can be checked over the existing list, because command ids are
  already `topic verb` strings. The resource shape is not a prerequisite for the rules.
- The two outputs that matter to an agent, per-command help and the credential-free
  catalog, are already derived from the manifest. The outputs that are not derived (README
  sections, the skill's write table) drift only when a human edits the manifest, which
  happens a few times a year.
- The vendor owns the API. The archived contract is upstream of the manifest and a test
  proves equality. Cloudflare's design puts the schema upstream and generates the OpenAPI
  document from it, which only makes sense for an API you own.
- The CLI is private and has one operator. Rewriting a 3,446-line file and reproducing
  all 78 definitions through an adapter, to keep 44 test files green, buys nothing that
  operator can see.

## Considered options

- **One record per resource, generated command files, generated docs, dry-run, local
  mirror.** Rejected as a package for the reasons above. Two pieces survive as separate,
  later work with their own issues: dry-run with a declared confirmation policy for every
  write, and generating README command sections from the manifest.
- **Linter only, no renames.** Rejected. The linter would have needed permanent
  exceptions for the defects it was written to catch.

## Consequences

- Adding a command means adding one manifest entry and one short command file. The
  linter test fails the build if the entry breaks a convention.
- Two commands keep names outside the verb set, `evaluation current` and
  `assessment-objective history`, because no verb describes them honestly. The linter
  lists them as exceptions with a reason each.
- `evidence list` sends one of two documented operations depending on whether
  `--evaluation-id` is supplied, so the catalog reports a command's operations as a list.
- Reopen this decision if a second maintainer or an external audience appears, or if a
  convention turns out to be uncheckable on the flat list.
