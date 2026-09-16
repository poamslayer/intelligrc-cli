# intelligrc-cli

A command-line interface (CLI) for the IntelliGRC governance, risk, and compliance API.
The CLI reads every documented `GET` operation and performs 22 of the 23 documented
write operations. The one write it does not perform is the multipart evidence file
upload, `POST /v1/Evidence/Upload`, so upload an evidence file in the IntelliGRC web app.
The CLI is built so that an AI agent can discover every command offline and a person can
supervise what the agent does.

The CLI is for an IntelliGRC administrator or security engineer, or for the person who
sets up an AI agent for one.

## Install

You need two things before you install:

- Node.js 24 or later.
- One IntelliGRC API credential, which is a client ID and a client secret.

The package is published on npm as `@poamslayer/intelligrc-cli`. Always install a pinned
version, because an agent that installs an unpinned version can change behavior between
runs without anyone noticing.

Run one pinned command without a permanent installation:

```sh
npx --yes @poamslayer/intelligrc-cli@0.1.1 version
```

Or install the pinned version globally:

```sh
npm install --global @poamslayer/intelligrc-cli@0.1.1
intelligrc version
```

If you are setting up an AI agent to run the CLI, also install the agent skill. See
[Use with an AI agent](#use-with-an-ai-agent).

## Quick start

1. Create a profile. A profile is one named, saved credential set for one tenant. Login
   reads the client secret from a masked prompt, checks the credential against the
   documented tenant-list operation, and saves the profile when the credential returns
   exactly one tenant. The secret goes to `secrets.json` in the CLI config directory
   with mode 0600.

   ```sh
   intelligrc auth login --profile prod --client-id YOUR_CLIENT_ID
   ```

2. Confirm which identity the CLI will use. The command runs locally and never prints
   the secret.

   ```sh
   intelligrc auth status --profile prod
   ```

3. Read the current evaluation. The CLI prints the API response on standard output with
   the documented field names unchanged.

   ```sh
   intelligrc evaluation current --profile prod
   ```

4. Read a list as a table.

   ```sh
   intelligrc facility list --profile prod --output table
   ```

Run `intelligrc commands` to see every command, and `intelligrc <command> --help` for the
flags of one command.

## Authentication

Every API command takes its identity from exactly one identity source. The three sources
are a profile, a credentials file, and the environment.

A profile is named with `--profile`. `auth login` saves the settings that are not secret
in `profiles.json` and the client secret in `secrets.json`. Both files are in the CLI
config directory, which is `~/.config/intelligrc` on Linux and macOS and
`%LOCALAPPDATA%\intelligrc` on Windows. `secrets.json` has mode 0600.

```sh
intelligrc facility list --profile prod
```

A credentials file is a JSON file that holds one complete identity. Name the file with
`INTELLIGRC_CREDENTIALS_FILE`. The CLI only reads the file, and on Linux and macOS it
refuses the file unless its mode is 0600. `tenantName` and `baseUrl` are optional fields.

```sh
cat > /run/secrets/intelligrc.json <<'EOF'
{
  "credentialsVersion": 1,
  "clientId": "YOUR_CLIENT_ID",
  "clientSecret": "YOUR_CLIENT_SECRET",
  "tenantId": "YOUR_TENANT_ID"
}
EOF
chmod 600 /run/secrets/intelligrc.json
INTELLIGRC_CREDENTIALS_FILE=/run/secrets/intelligrc.json intelligrc facility list
```

The environment identity needs `INTELLIGRC_CLIENT_ID`, `INTELLIGRC_CLIENT_SECRET`, and
`INTELLIGRC_TENANT_ID` all set, with no `--profile`. When one of the three is missing,
the command exits 2 with `identity-required`.

```sh
export INTELLIGRC_CLIENT_ID=YOUR_CLIENT_ID
export INTELLIGRC_CLIENT_SECRET=YOUR_CLIENT_SECRET
export INTELLIGRC_TENANT_ID=YOUR_TENANT_ID
intelligrc facility list
```

Use a credentials file or the environment identity in a container, a continuous
integration (CI) runner, or an agent sandbox, because none of those has a saved profile.
`--profile` is optional when either of those sources is present. When no source is
present, the command exits 2 with `identity-required`. When you pass `--profile` and
`INTELLIGRC_CREDENTIALS_FILE` together, the command exits 2 with
`identity-source-conflict`.

`INTELLIGRC_BASE_URL` sets the API base URL for any source. On top of a profile or a
credentials file, each `INTELLIGRC_*` identity variable that is set replaces the matching
field. `auth status` prints the source in use, the resolved fields, and the replaced
fields under `overrides`, and it never prints the secret.

A profile created before 2026-09-09 holds its secret in the operating system keychain,
which the CLI no longer reads. A command that uses such a profile exits 3 with
`client-secret-missing`. Fix each profile once with `--replace`:

```sh
intelligrc auth login --profile prod --client-id YOUR_CLIENT_ID --replace
```

## Commands

A command is one topic followed by one verb, such as `facility list`. Most commands use
one of six verbs: `get` reads one record, `list` reads a collection, `create` adds one
record, `update` changes fields on one record, `delete` removes one record, and `set`
replaces the whole association list on one record. A few commands name what they read
instead, such as `evaluation current`, `assessment-objective history`, and every `lookup`
command.

Two commands describe the rest. `intelligrc commands` prints the catalog, which is the
JSON description of every command with its flags, permission, and documented operations.
The catalog runs locally with no profile and no network. `intelligrc <command> --help`
prints the flags of one command.

| Topic | What it covers |
|---|---|
| `auth` | Create, list, remove, and inspect profiles. |
| `doctor` | Check one saved profile and its connection without printing secret values. |
| `tenant` | List the tenants the credential can reach. |
| `evaluation` | Read the current evaluation, list evaluations, or create one. |
| `assessment-objective` | List assessment objectives and their history, or update one. |
| `control` | List controls or update one. |
| `evidence` | List evidence, create evidence from a file name and URL, or set its assessment objectives. |
| `evidence-folder` | List evidence folders or create one. |
| `action-plan-project` | List action plan projects or create one. |
| `action-plan-task` | List action plan tasks or create one. |
| `action-plan-subtask` | List action plan subtasks or create one. |
| `boundary` | List boundaries or create one. |
| `facility` | Read, create, and update facilities, and read or set their data types. |
| `interconnection` | Read, create, and update interconnections, and read or set their data types. |
| `personnel` | Read, create, update, and delete personnel. |
| `data-type` | Read, create, update, and delete data types. |
| `lookup` | Read the reference tables that fill resource fields, such as facility types. |

JSON is the default output format. `--output jsonl` prints one array element per line.
`--output table` prints scalar fields as columns. `--json` names the default and cannot
be combined with the other two formats.

## Writing data

Four rules apply to every write command:

- A `create` is never retried after a network failure the CLI cannot confirm. The command
  stops and tells you to check IntelliGRC before you run it again, so a broken connection
  never makes a duplicate record.
- An `update`, a `delete`, and a `set` retry after a temporary failure, because running
  one again lands on the same result.
- A `delete` pauses and asks for confirmation. An empty answer declines. Add `--force` to
  delete without the pause. With no terminal attached and no `--force`, the command
  declines.
- A `set` replaces the whole association list. Send every identifier the record should
  keep, not only the ones you are adding.

This example replaces the data types of facility 7 with data types 1 and 2:

```sh
intelligrc facility data-types set 7 --profile prod --data-type-id 1 --data-type-id 2
```

Worked examples for every write command are in [docs/writing-data.md](docs/writing-data.md).

## Output and exit codes

Requested data goes to standard output only. A failure goes to standard error as one JSON
object. The catalog prints the exit codes as `exitCodes` and the failure codes as
`errors`, so the table below is a convenience, not the only copy.

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

TLS is Transport Layer Security, the encryption under HTTPS.

## Use with an AI agent

An agent learns the CLI from the catalog, so it needs neither this file nor the source.
Three catalog fields are the ones to read:

- `writes` on each command is `"remote"` when the command changes tenant data, `"local"`
  when it changes only this machine, and `null` when it only reads.
- `operations` on each command lists the documented method and path the command sends.
  When a command chooses between operations, `selectedBy` names the flags that select
  each one.
- `errors` at the top level is the failure vocabulary. Each code has an exit code and a
  meaning, so the agent can decide whether to retry.

This prints the id and operations of every command that changes tenant data:

```sh
intelligrc commands | jq '.commands[] | select(.writes == "remote") | {id, operations}'
```

An agent skill for the CLI is at
[.claude/skills/intelligrc-cli/SKILL.md](.claude/skills/intelligrc-cli/SKILL.md). Claude
Code loads the skill automatically from a clone of this repository. To install it into
another project or agent, use the `skills` command-line tool:

```sh
# Install into the current project for every agent the tool supports.
npx skills add poamslayer/intelligrc-cli --skill intelligrc-cli

# Install for one agent only, or for your user account instead of one project.
npx skills add poamslayer/intelligrc-cli --skill intelligrc-cli -a claude-code
npx skills add poamslayer/intelligrc-cli --skill intelligrc-cli -g
```

Without that tool, copy the one file into the agent's skills directory.

## Use as a library

An agent that cannot run a shell reaches IntelliGRC through the IntelliGRC MCP server
instead. That server does not reimplement this CLI: it consumes the transport, the
command catalog, and identity resolution from the `core` export subpath, so the two
surfaces cannot disagree about how a request is sent or what the API offers.

```js
import {apiRequest, buildCatalog, resolveIdentity} from '@poamslayer/intelligrc-cli/core'
```

The subpath is a supported API with semver obligations, and it is the only supported
import: a deep import into the package is refused. Nothing behind it prompts on a
terminal, exits the process, reads the working directory, or writes to a process stream.
See [docs/core-export.md](docs/core-export.md) for the full surface, the version policy,
and what happens to a consumer when the catalog changes.

## Security properties

- The client secret is stored only in `secrets.json` in the CLI config directory with
  mode 0600, or supplied through `INTELLIGRC_CREDENTIALS_FILE` or
  `INTELLIGRC_CLIENT_SECRET`. The CLI refuses a secrets or credentials file that is
  readable by group or others. The secret is never printed. Diagnostics redact client
  IDs, tenant IDs, and credential headers.
- Requests use HTTPS with normal certificate validation and no bypass. Plain HTTP is
  permitted only for loopback hosts when `INTELLIGRC_ALLOW_HTTP_LOCALHOST=1` is set,
  which exists for automated tests.
- The CLI follows same-host redirects only and never sends credential headers to a
  different host.
- Normal commands make no automatic update check. The CLI installs no update plugin
  and contacts only the IntelliGRC API host the profile names.

## Verified facts and assumptions

Keep the two categories separate when you rely on this CLI.

These facts are verified against the contract, which is IntelliGRC's OpenAPI document.
That document is IntelliGRC's property and is not distributed with this repository. The
maintainer runs the contract test suite against a local copy; see `official-docs/README.md`:

- The contract defines exactly 50 `GET` operations, and the 49 read commands cover all
  50. `evidence list` sends one of two operations depending on its flags. An automated
  test suite compares every path, parameter, documented permission, and write body field
  against the contract on every test run.
- The contract defines exactly 23 operations that are not `GET`, and the CLI maps 22 of
  them to one command each. The one it does not implement is `POST /v1/Evidence/Upload`.
- The contract defines no pagination, rate limit, or complete error behavior. The CLI
  returns each response as one payload and does not build pages.

These are assumptions, not verified:

- The API base URL. The CLI uses `https://api.intelligrc.app` as the default because a
  probe of that host with no credential returned a well-formed API error, but no
  authenticated call has confirmed it. Each profile saves its own base URL, so you can
  replace the default per profile with `auth login --base-url` and no new release.
- The credential is a long-lived client secret. The contract defines no token exchange,
  so no short-lived credential exists.

## Development and releasing

Clone the repository and run the tests on Node.js 24:

```sh
git clone https://github.com/poamslayer/intelligrc-cli.git
cd intelligrc-cli
npm ci
npm test
```

The release workflow in `.github/workflows/release.yml` publishes one fixed version of
`@poamslayer/intelligrc-cli` as a public npm package. It runs only from a manual dispatch
inside the protected `release` environment. It publishes the package exactly as
committed, verifies pinned `npx` execution and global installation from the registry, and
stores release evidence that holds no credential. No npm token is stored anywhere. The
workflow authenticates through npm trusted publishing, which accepts GitHub's short-lived
identity token for this workflow file and the `release` environment. The workflow header
documents the operator prerequisites and the one-time `npm trust` command that registered
the trusted publisher.

## License

MIT. See [LICENSE](LICENSE). Copyright Arnold De La Vega.
