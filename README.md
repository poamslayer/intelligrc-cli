# intelligrc-cli

A read-only command-line interface (CLI) for the IntelliGRC API. The CLI maps every one
of the 50 documented `GET` operations to one stable command. It never sends a `POST`,
`PUT`, or `DELETE` request, so it cannot change tenant data.

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
  and documented permission against the archived OpenAPI document on every test run.
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
