---
name: intelligrc-cli
description: Query IntelliGRC governance, risk, and compliance data (evaluations, assessment objectives, controls, evidence, action plans, boundaries, facilities, personnel, interconnections, data types, lookups) from the command line using the intelligrc CLI. Use whenever the user asks to pull, check, list, count, or export anything from IntelliGRC, mentions `intelligrc`, or needs GRC or compliance data from their IntelliGRC tenant — even if they do not name the CLI. The CLI is strictly read-only. Skip for any request to create, update, or delete IntelliGRC data (the CLI has no write commands), and skip for conceptual questions about the IntelliGRC web app.
---

# IntelliGRC CLI

Use the `intelligrc` CLI to read data from the IntelliGRC API. The CLI maps every documented GET operation to one command and never writes: it sends no POST, PUT, or DELETE requests, so it cannot change tenant data.

## Command reference

Run `intelligrc commands` for the full command catalog as JSON. This works offline, needs no profile, and is always up to date. Run `intelligrc <command> --help` for per-command flags.

## Prerequisites

- Node.js 24 or newer. On this machine, nvm's Node 22 shadows Homebrew's Node 24 — prefix commands with `PATH="/opt/homebrew/bin:$PATH"` or run `nvm use 24` first.
- The CLI is not yet published to npm. If `intelligrc` is not on PATH, run it from the repo at `/Users/arnoldd/intelligrc`: build once with `npm run build`, then invoke `./bin/run.js` in place of `intelligrc`.

## Authentication

API commands read credentials from a named profile. The client secret lives in the OS keychain; non-secret settings live in `~/.config/intelligrc/profiles.json`.

```bash
intelligrc auth login --profile prod --client-id <ID> --client-secret-env MY_SECRET_VAR
intelligrc auth list                 # Saved profiles (offline, no secrets shown)
intelligrc doctor --profile prod     # Five ordered health checks; stops at first failure
intelligrc auth remove --profile prod
```

- `auth login` rejects a `--client-secret VALUE` flag by design so the secret never enters shell history. Headless use requires `--client-secret-env` naming an environment variable; interactive use gets a masked prompt.
- Login validates the credential against `/v1/Tenants` and saves only when exactly one tenant returns.
- Environment overrides for API commands: `INTELLIGRC_BASE_URL`, `INTELLIGRC_CLIENT_ID`, `INTELLIGRC_CLIENT_SECRET`, `INTELLIGRC_TENANT_ID`. `doctor` ignores them.

## Syntax

```
intelligrc <topic> <subcommand> [ID] [--flags]
```

- Topics are space-separated: `intelligrc evaluation current`, `intelligrc lookup facility types`.
- Every API command requires `--profile <name>`.
- `--output json|jsonl|table` on every API command; default is `json` (pretty-printed, upstream field names preserved). `jsonl` emits one JSON line per array element.
- `get` and `data-types` commands take a positional integer `ID` (for example `intelligrc facility get 3`).
- ID flags are validated before any network call: `--evaluation-id` is an int32; `--framework-id`, `--assessment-objective-id`, `--parent-id`, and `--icl-version-id` are UUIDs.

## Common patterns

```bash
intelligrc evaluation current --profile prod                    # The active evaluation
intelligrc evaluation list --profile prod
intelligrc assessment-objective list --profile prod --evaluation-id 42 --output jsonl | jq -r '.status'
intelligrc control list --profile prod --framework-id <uuid>
intelligrc evidence for-evaluation --profile prod --evaluation-id 42
intelligrc evidence-folder list --profile prod
intelligrc action-plan-project list --profile prod --include-tasks true --include-subtasks true
intelligrc facility list --profile prod --output table
intelligrc facility get 3 --profile prod
intelligrc lookup assessment-objective statuses --profile prod  # Decode status IDs to names
intelligrc commands | jq -r '.commands[].id'                    # Discover every command
```

Lookup commands (`intelligrc lookup ...`) return the ID-to-name tables for statuses, levels, types, and categories — fetch the matching lookup when you need to present raw IDs as human-readable values.

## Output and errors

- Requested data goes to stdout only. Every failure is one redacted JSON object on stderr: `{"error":{"code","message","retryable",...}}`. Credentials and tenant IDs are always `[REDACTED]`.
- Transient failures retry automatically (up to 3 attempts, 90-second budget). A retried success notes `{"diagnostic":{"code":"request-retried",...}}` on stderr.

Exit codes:

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Unexpected local failure |
| 2 | Invalid input (bad ID, unknown flag value) |
| 3 | Missing or invalid local configuration (no such profile) |
| 4 | Authentication or authorization failed (message names the required permission) |
| 5 | Network or TLS failure |
| 6 | Rate limited (HTTP 429) |
| 7 | Not found (HTTP 404) |
| 8 | Other API failure |
