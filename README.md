# intelligrc-cli

A command-line interface (CLI) for the IntelliGRC API. The CLI maps every one of the 50
documented `GET` read operations to one stable command. It has also begun to write data:
`data-type create`, `data-type update`, and `data-type delete` send the documented
`POST /v1/DataTypes`, `PUT /v1/DataTypes/{id}`, and `DELETE /v1/DataTypes/{id}` requests.
The remaining documented write operations are being added incrementally, each repeating
the data-type pattern.

The CLI serves an IntelliGRC administrator or security engineer who supervises an AI
agent on the same workstation. The agent discovers commands through the offline catalog
and retrieves compliance data without constructing raw HTTP requests.

## Requirements

- Node.js 24 or later.
- A protected secret store: Windows Credential Manager, macOS Keychain, Linux Secret
  Service, or the Linux kernel keyring.
- One IntelliGRC API credential (client ID and client secret).

## Installation

Always install a pinned version. Do not use `@latest`: an agent that installs an
unpinned version can silently change behavior between runs.

The package is not published to npm yet, and the npm scope decision is pending. After
publication under the chosen scope, install one of two ways (replace `@SCOPE` with the
published scope):

```sh
# Run one pinned command without a permanent installation.
npx --yes @SCOPE/intelligrc-cli@0.1.0 version

# Or install the pinned version globally.
npm install --global @SCOPE/intelligrc-cli@0.1.0
intelligrc version
```

Until publication, install from a packed tarball built out of this repository:

```sh
npm ci
npm pack
npm install --global ./intelligrc-cli-0.1.0.tgz
intelligrc version
```

## First compliance workflow

1. Create a profile. Login validates the credential against the documented tenant-list
   operation and saves the tenant when the credential returns exactly one tenant. The
   client secret goes to the operating-system secret store, never to a file.

   ```sh
   intelligrc auth login --profile prod --client-id YOUR_CLIENT_ID
   ```

2. Diagnose the profile. `doctor` checks the saved settings and the connection without
   printing credential or tenant values.

   ```sh
   intelligrc doctor --profile prod
   ```

3. Retrieve compliance data. Every API command requires `--profile` and prints the
   upstream response on standard output with the documented field names preserved.

   ```sh
   intelligrc evaluation current --profile prod
   intelligrc assessment-objective list --profile prod --evaluation-id 42
   intelligrc control list --profile prod
   ```

4. Let an agent discover the surface. The catalog describes every command, argument,
   flag, and documented permission. It runs locally: no profile, no network.

   ```sh
   intelligrc commands
   ```

## Writing data types

The CLI can create, update, and delete data types. Each write command requires
`--profile` and prints the record the API returned.

```sh
# Create a data type. The three level identifiers come from the matching
# `lookup data-type ...` command. The command prints the created record.
intelligrc data-type create --profile prod --name "Controlled Unclassified Information" \
  --confidentiality-id 3 --integrity-id 2 --availability-id 1

# Update a data type by its integer identifier. The command prints the updated record.
intelligrc data-type update 42 --profile prod --name "CUI" \
  --confidentiality-id 3 --integrity-id 2 --availability-id 1

# Delete a data type by its integer identifier. The command pauses for a
# confirmation that defaults to "no"; add --yes to delete without pausing.
intelligrc data-type delete 42 --profile prod
```

Three safety rules protect a write:

- A `create` is never retried after a network failure it cannot confirm. Instead it stops
  and reports that you should check IntelliGRC before running it again, so a broken
  connection never produces a duplicate record.
- An `update` and a `delete` retry after a temporary failure, because repeating them lands
  on the same result.
- A `delete` pauses and asks for confirmation. A bare Enter declines. When no terminal is
  attached and `--yes` is absent, the command declines rather than deleting.

## Writing interconnections

`interconnection create` and `interconnection update` send the documented
`POST /v1/Interconnections` and `PUT /v1/Interconnections/{id}` requests and print the
record the API returned. `create` requires `--name`, `--authorizing-official-id`, and at
least one `--authorization-type`. `update` requires only `--name`; every other flag is
optional, and an omitted flag leaves that field unchanged.

An interconnection carries a list of authorization types, so `--authorization-type` is the
CLI convention for supplying a list of structured objects: repeat the flag once per object
and write each object as comma-separated `key=value` pairs.

```sh
# Create an interconnection with two authorization types. The id values come from
# `lookup interconnection authorization-types`. The command prints the created record.
intelligrc interconnection create --profile prod \
  --name "Vendor VPN" --authorizing-official-id 12 \
  --authorization-type id=5 \
  --authorization-type id=7,other="Site-to-site VPN"

# Rename an interconnection. Omitting --authorization-type leaves its authorization
# types unchanged. The command prints the updated record.
intelligrc interconnection update 42 --profile prod --name "Vendor VPN (retired)"
```

The `--authorization-type` keys are `id` (required, the integer
`interconnectionAuthorizationTypeId`) and `other` (optional free text for the `otherValue`
field). A missing `id`, an unknown key, or a non-integer `id` stops the command before any
network access. Providing `--authorization-type` on an update replaces every existing
authorization type on that interconnection.

## Creating an evaluation

`evaluation create` sends the documented `POST /v1/Evaluations` request and prints the
created record. It requires `--name`, `--reason`, `--boundary-id`, `--start-date`,
`--end-date`, `--icl-version-id`, and at least one `--framework-id`. `--total-budget`,
`--target-type`, and `--previous-evaluation-id` are optional and are omitted from the body
when not given.

```sh
# Create an evaluation. The boundary, ICL version, and framework identifiers come from
# `boundary list`, `lookup icl-version list`, and `lookup icl-version frameworks`.
# The command prints the created record.
intelligrc evaluation create --profile prod \
  --name "CMMC L2 Assessment" --reason "Annual assessment" \
  --boundary-id 5 \
  --start-date 2026-07-24 --end-date 2026-12-31 \
  --icl-version-id 3fa85f64-5717-4562-b3fc-2c963f66afa6 \
  --framework-id 11111111-2222-3333-4444-555555555555 \
  --framework-id aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee
```

`--start-date` and `--end-date` take a calendar date in `YYYY-MM-DD` form. The CLI checks
that it is a real calendar day and sends it as the documented date-time field at midnight
UTC, so `2026-07-24` becomes `2026-07-24T00:00:00Z`. `--total-budget` accepts a number
such as `50000` or `50000.50`. `--target-type` is an integer, not free text. A missing
required flag, or an invalid integer, number, UUID, or date, stops the command before any
network access.

## Output and exit codes

`--output json` is the default. `--output jsonl` prints one array element per line.
`--output table` renders scalar fields as columns. Requested data goes to standard
output only; failures and retry diagnostics go to standard error as one JSON object.

| Exit code | Meaning |
|-----------|---------|
| 0 | Success |
| 1 | Unexpected local failure |
| 2 | Invalid input |
| 3 | Missing or invalid local configuration |
| 4 | Authentication or authorization failure |
| 5 | Network or TLS failure |
| 6 | Rate limiting |
| 7 | Not found |
| 8 | Another API failure |

## Verified facts and assumptions

Keep these two categories separate when relying on this CLI.

Verified against the archived OpenAPI document (`official-docs/swagger/v1/swagger.json`
in the source repository):

- The archived OpenAPI document defines exactly 50 `GET` operations, and the CLI maps
  each one to one command. An automated contract suite compares every path, parameter,
  documented permission, and write request-body field against the archived OpenAPI
  document on every test run.
- Tenant-scoped operations document the `x-client-id`, `x-client-secret`, and
  `x-tenant-id` headers. The tenant-list operation documents no `x-tenant-id` header.
- The archived OpenAPI document defines no pagination, rate-limit, or complete error
  behavior. The CLI returns each response as one payload and does not synthesize pages.

Assumed, not verified:

- The API base URL. The CLI uses `https://api.intelligrc.app` as the default because a
  credential-free probe of that host returned a well-formed API error, but no
  authenticated call has confirmed it. Each profile saves its own base URL, so support
  confirmation or live evidence can replace the assumption per profile without a new
  release (`auth login --base-url`).

## Security properties

- The client secret lives only in the operating-system secret store and is never
  printed. Diagnostics redact client IDs, tenant IDs, and credential headers.
- Requests use HTTPS with normal certificate validation and no bypass. Plain HTTP is
  permitted only for loopback hosts when `INTELLIGRC_ALLOW_HTTP_LOCALHOST=1` is set,
  which exists for automated tests.
- The CLI follows same-host redirects only and never sends credential headers to a
  different host.
- Normal commands make no automatic update check. The CLI installs no update plugin
  and contacts only the IntelliGRC API host the profile names.

## Releasing

The release workflow (`.github/workflows/release.yml`) publishes one fixed version to
the chosen private npm scope. It runs only from a manual dispatch inside the protected
`release` environment, publishes the package exactly as committed, verifies pinned
`npx` execution and global installation from the registry, and stores credential-free
release evidence. The workflow header documents the operator prerequisites: commit the
chosen scope onto `package.json`, let the cross-platform workflow pass on that commit,
and create the `release` environment with a scoped `NPM_TOKEN`.
