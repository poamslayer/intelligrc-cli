---
name: intelligrc-cli
description: Query and edit IntelliGRC governance, risk, and compliance data (evaluations, assessment objectives, controls, evidence, action plans, boundaries, facilities, personnel, interconnections, data types, lookups) from the command line using the intelligrc CLI. Use whenever the user asks to pull, check, list, count, or export anything from IntelliGRC, or to create, update, delete, or associate any of those records, mentions `intelligrc`, or needs GRC or compliance data from their IntelliGRC tenant — even if they do not name the CLI. The CLI reads every documented GET operation and writes every documented write operation except multipart file upload: it creates evaluations, boundaries, data types, facilities, interconnections, personnel, evidence, evidence folders, and action-plan projects, tasks, and subtasks; updates assessment objectives, controls, data types, facilities, interconnections, and personnel; deletes data types and personnel; and sets data-type and assessment-objective associations. Skip for uploading an evidence file (`POST /v1/Evidence/Upload`, multipart, not implemented) and for conceptual questions about the IntelliGRC web app.
---

# IntelliGRC CLI

Use the `intelligrc` CLI to read and edit data in the IntelliGRC API. The CLI maps all 50 documented GET operations to one read command each, and 22 of the 23 documented write operations to one write command each. The only unimplemented write is `POST /v1/Evidence/Upload`, the multipart evidence-file upload: for that one, direct the user to the IntelliGRC web app.

## Command reference

Run `intelligrc commands` for the full command catalog as JSON. This works offline, needs no profile, and is always up to date. Run `intelligrc <command> --help` for per-command flags.

The catalog (`catalogVersion: 2`) carries four things:

- `commands[]` — each with `id`, `summary`, `kind`, `permission`, `args`, `flags`, plus:
  - `writes`: `"remote"` changes tenant data in IntelliGRC, `"local"` changes local state on this machine, `null` changes nothing. **Check this before running a command on someone's behalf.**
  - `operation`: the documented `method` and `path` the command sends, or `null`. Use the path to find the response shape in the IntelliGRC OpenAPI document.
- `exitCodes[]` — every exit code with its meaning.
- `errors` — `codes[]` (exact failure codes with their exit code and meaning), `families[]` (the `invalid-` prefix, whose remainder names the input that failed), and `diagnostics[]` (written to stderr while the command still succeeds).

Useful queries:

```bash
intelligrc commands | jq -r '.commands[] | select(.writes=="remote") | .id'   # the 22 write commands
intelligrc commands | jq -r '.commands[] | select(.writes==null) | .id'       # read-only commands
intelligrc commands | jq '.errors.codes[] | select(.code=="create-unconfirmed")'
```

Retryability is not in the catalog, because it is not a property of the code: an `api-failure` is retryable for HTTP 502 and not for HTTP 400. Read the `retryable` field on the failure object itself.

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
- `--json` is accepted everywhere `--output` is, and means `--output json`. It states the default rather than changing it. Passing `--json` with `--output jsonl` or `--output table` exits 2.
- `get`, `data-types get`, `data-types set`, `update`, and `delete` commands take a positional `ID` (for example `intelligrc facility get 3`, `intelligrc personnel update 12 ...`). It is an integer for data types, facilities, interconnections, and personnel, and a UUID for assessment objectives, controls, and evidence.
- ID flags and arguments are validated before any network call or keychain read: `--evaluation-id` is an int32; `--framework-id`, `--assessment-objective-id`, `--parent-id`, and `--icl-version-id` are UUIDs. An invalid value exits 2 and sends nothing.

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

## Writing data

Every write command requires `--profile` and prints the record the API returned. Run
`intelligrc <command> --help` for the exact flags: each flag summary names the body field it
supplies and says whether the field is required.

| Resource | Create | Update | Delete | Associate |
|---|---|---|---|---|
| Data type | `data-type create` | `data-type update <id>` | `data-type delete <id>` | — |
| Personnel | `personnel create` | `personnel update <id>` | `personnel delete <id>` | — |
| Facility | `facility create` | `facility update <id>` | — | `facility data-types set <id>` |
| Interconnection | `interconnection create` | `interconnection update <id>` | — | `interconnection data-types set <id>` |
| Evidence | `evidence create` | — | — | `evidence assessment-objectives set <id>` |
| Evidence folder | `evidence-folder create` | — | — | — |
| Evaluation | `evaluation create` | — | — | — |
| Boundary | `boundary create` | — | — | — |
| Action plan | `action-plan-project create`, `action-plan-task create`, `action-plan-subtask create` | — | — | — |
| Assessment objective | — | `assessment-objective update <id>` | — | — |
| Control | — | `control update <id>` | — | — |

```bash
intelligrc data-type create --profile prod --name "CUI" \
  --confidentiality-id 3 --integrity-id 2 --availability-id 1
intelligrc personnel create --profile prod --first-name Ada --last-name Lovelace
intelligrc personnel delete 12 --profile prod --force    # --force skips the confirmation pause
intelligrc evidence-folder create --profile prod --name "Policies"
intelligrc facility data-types set 3 --profile prod --data-type-id 1 --data-type-id 2
```

The two `data-types set` commands spell their flag the same way but take identifiers from
different documented sources. `facility data-types set` takes them from
`lookup facility data-types`. `interconnection data-types set` takes them from
`data-type list`. Fetch the matching source before you set either association, and do not
reuse one command's identifiers on the other.

Four rules govern a write. State them to the user before running one on their behalf:

- A `create` is **never retried** after a network failure whose result cannot be confirmed. It
  stops and reports that the user should check IntelliGRC before retrying, so a broken
  connection never produces a duplicate record.
- An `update`, a `delete`, and an association `set` retry after a temporary failure, because
  repeating them lands on the same result.
- A `delete` pauses for a confirmation that defaults to "no". `--force` skips the pause. With no
  terminal attached and no `--force`, the command declines rather than deleting — so a scripted
  delete needs `--force` explicitly.
- An association `set` **replaces** the whole association list, so send every identifier the
  record should keep. The two `data-types set` commands take an optional repeatable
  `--data-type-id`; omitting it entirely sends an empty list, which clears every association.
  `evidence assessment-objectives set` requires at least one `--assessment-objective-id`, so it
  cannot clear a list, and its `--preserve-existing true` adds to the existing mappings instead
  of replacing them.

The archived API document does not state how an `update` treats a body field the request
leaves out, and the CLI omits any field whose flag is absent. Send every field the record
should keep, then read the printed record to confirm what the API stored.

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
