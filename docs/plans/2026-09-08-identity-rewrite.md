# Identity rewrite: replace the keychain with a file store and add headless identity

Status: In progress
Last updated: 2026-09-08

## Outcome

An agent or a person can authenticate the CLI on macOS, Linux, Windows, a container, or a
CI runner with no operating-system keychain. Three identity sources exist: a saved profile
whose secret lives in a mode 0600 file, a credentials file named by
`INTELLIGRC_CREDENTIALS_FILE`, and the complete environment set. `auth status` reports
which source is in use. The `@napi-rs/keyring` dependency is gone.

## Context

Today the client secret is stored only in the operating-system secret store through
`@napi-rs/keyring`, and `README.md` lists "no plaintext fallback" as a security property.
That design fails on the hosts an agent actually runs on:

- On Linux without a D-Bus session and an unlocked Secret Service collection, and inside
  a container whose seccomp profile blocks the kernel keyring, `auth login` fails at the
  secret write with exit code 3 and saves no profile.
- The documented headless escape, `INTELLIGRC_CLIENT_SECRET`, does not work on its own.
  `resolveApiContext` in `src/api/resolve.ts` loads the profile before it reads any
  environment override, so with all four `INTELLIGRC_*` variables set and no profile the
  CLI still exits 3 with `profile-not-found`. Verified on 2026-09-08 against an empty
  config directory.

So the CLI has no working headless identity path on any platform. The agent-first CLI
audit of 2026-09-08 ranked this as the first thing to fix, ahead of introspection, dry
run, and `--body`.

The owner has decided the keychain is not to be used at all. This plan removes it rather
than keeping it as a default with a file fallback, because the keychain protected nothing
on the platforms that matter and because one storage path is simpler to test and to
explain.

## Scope

- Included: a file-backed secret store for saved profiles, with permission enforcement.
- Included: `INTELLIGRC_CREDENTIALS_FILE` as a headless identity source.
- Included: the complete environment set as a headless identity source with no profile.
- Included: `--profile` becomes optional on API commands, with a clear exit-2 failure when
  no identity source is present.
- Included: a new `auth status` command that reports identity and credential source.
- Included: the catalog lists every environment variable the CLI reads.
- Included: removal of `@napi-rs/keyring`, its test seams, the native-store check, and the
  keychain steps in the cross-platform workflow.
- Included: an architecture decision record, and updates to `README.md`, `CONTEXT.md`, and
  the operator skill.
- Excluded: short-lived tokens. The archived OpenAPI document defines no token exchange, so
  the credential stays a long-lived vendor client secret.
- Excluded: dry run, `--body`, `--fields`, `describe`, wire attribution, and the response
  envelope. Those are separate audit items.
- Excluded: any change to `doctor`'s five checks beyond swapping the store it reads.
- Excluded: encrypting the secrets file. File permissions are the protection, as in the
  AWS CLI and gcloud.

## Terms

- Profile: one named, saved credential set for one tenant, as defined in `CONTEXT.md`.
  Non-secret settings stay in `profiles.json`. The secret moves to the secrets file.
- Secrets file: `secrets.json` in the CLI config directory, mode 0600, holding one client
  secret per profile name. Written only by `auth login`, deleted from only by `auth remove`.
- Credentials file: a JSON file that holds one complete identity, named by
  `INTELLIGRC_CREDENTIALS_FILE`. The CLI never writes it. This is how a container or CI
  secret mount hands the CLI an identity.
- Environment identity: the identity formed when `INTELLIGRC_CLIENT_ID`,
  `INTELLIGRC_CLIENT_SECRET`, and `INTELLIGRC_TENANT_ID` are all set and no `--profile`
  is given.
- Identity source: which of profile, credentials file, or environment supplied the
  identity. Exactly one source is the base; individual environment variables may override
  fields of that base.
- Config directory: oclif's per-user config directory. On Linux and macOS this is
  `~/.config/intelligrc` (or `$XDG_CONFIG_HOME/intelligrc`); on Windows it is
  `%LOCALAPPDATA%\intelligrc`. `this.config.configDir` in a command.

## Known facts and evidence

- The keychain is touched by five source files and three test helpers:
  `src/secret-store.ts`, `src/api/resolve.ts`, `src/commands/auth/login.ts`,
  `src/commands/auth/remove.ts`, `src/commands/doctor.ts`, `test/helpers/fake-keyring.mjs`,
  `test/helpers/fake-keyring-register.mjs`, `test/helpers/run-cli.ts` (the
  `fakeKeyringEnv` helper), plus `test/native-store.check.ts` — `grep -rln
  "KeyringSecretStore\|@napi-rs/keyring" src test`.
- Nine test files reference the fake keyring: `auth-list`, `auth-login`, `auth-remove`,
  `auth-replace`, `doctor`, `live-suite`, `pack`, `tenant-list`, `test-seam` — `grep -rln
  "fakeKeyringEnv\|readKeyring\|INTELLIGRC_FAKE_KEYRING_FAIL" test`.
- `KeyringSecretStore` exposes exactly `get(profileName)`, `set(profileName, secret)`, and
  `delete(profileName)`; every caller uses only those three — `src/secret-store.ts`.
- `ProfileStore.write` already implements the atomic pattern this plan reuses: `mkdirSync`
  recursive, write a `.tmp-<pid>` file with mode 0600, `renameSync` over the target —
  `src/profile-store.ts:78-97`.
- Environment overrides on top of a profile are existing tested behavior:
  `test/tenant-list.test.ts` ("overrides") sends `INTELLIGRC_CLIENT_ID` and
  `INTELLIGRC_CLIENT_SECRET` with `--profile` and expects the overrides on the wire.
- The `profile` flag on every API command comes from one shared constant `profileFlag`
  at `src/manifest.ts:195`, with `required: true`. `auth login`, `auth remove`, and
  `doctor` define their own required `profile` flags.
- The CLI reads six environment variables, none of which appear in the catalog:
  `INTELLIGRC_BASE_URL`, `INTELLIGRC_CLIENT_ID`, `INTELLIGRC_CLIENT_SECRET`,
  `INTELLIGRC_TENANT_ID`, `INTELLIGRC_ATTEMPT_TIMEOUT_MS`,
  `INTELLIGRC_ALLOW_HTTP_LOCALHOST` — `grep -rho 'INTELLIGRC_[A-Z_]*' src | sort -u`
  against `./bin/run.js commands`.
- The catalog is version 3 with top-level keys `catalogVersion`, `commands`, `errors`,
  `exitCodes` — `buildCatalog` in `src/manifest.ts:3374`.
- The archived OpenAPI document defines no security scheme and no token operation —
  `jq '.components.securitySchemes, .security' official-docs/swagger/v1/swagger.json`
  prints `null` twice.
- No release or tag exists, so renaming or removing behavior does not yet break the
  add-never-remove rule — `gh release list` and `git tag` are empty.
- The cross-platform workflow installs `gnome-keyring` on Linux and creates a throwaway
  keychain on macOS solely for the native-store check —
  `.github/workflows/cross-platform.yml:77-105`.
- `auth list` already prints `clientId` and `tenantId` in plain text; only the client
  secret is treated as secret in output — `src/commands/auth/list.ts`.

## Decisions

- Remove `@napi-rs/keyring` entirely — the owner's instruction; one storage path is
  simpler; the keychain did not work on agent hosts. Consequence: the "no plaintext
  storage" security property in `README.md` and issue #1 is reversed and recorded in
  ADR-0002.
- Keep the `SecretStore` interface (`get`, `set`, `delete`) and swap the implementation —
  four callers change only their import and constructor. Consequence: login rollback and
  remove ordering stay as they are.
- Secrets live in a separate `secrets.json`, not inside `profiles.json` — `auth list`
  keeps reading a file that contains no secret, and the permission check applies to one
  file. Consequence: two files per config directory; `auth remove` deletes from both.
- Enforce mode 0600 on read for the secrets file and the credentials file on POSIX; skip
  the check on Windows — Windows file ACLs do not map to POSIX mode bits. Consequence: a
  world-readable secrets file exits 3 with a code that names the fix.
- The identity base is exactly one of profile, credentials file, or environment.
  `INTELLIGRC_CREDENTIALS_FILE` together with `--profile` exits 2. Individual environment
  variables still override fields of a profile or a credentials file, preserving the
  tested override behavior. Consequence: `auth status` reports the base source and the
  list of overridden fields, so the effective identity is never ambiguous.
- `--profile` becomes optional on API commands. When no source is present the runtime
  exits 2 with `identity-required` and a message naming all three ways to supply one.
  Consequence: the shared `profileFlag` constant changes; help text on 74 commands
  changes with it.
- `doctor` keeps diagnosing a saved profile only and keeps ignoring environment
  overrides. `auth status` is the command that reports the effective identity.
- Add an `env` list to the catalog and bump `catalogVersion` to 4 — the plan adds a new
  variable and the audit requires introspection to list every variable. Consequence:
  `test/catalog-completeness.test.ts` gains a test that greps `src` and compares.
- Slices are implemented by the Codex headless worker (`gpt-5.6-sol`, effort high) with
  the slice text passed verbatim. The main session runs the test suite, because the Codex
  sandbox cannot open listening sockets and the fake API needs one.

## Open questions and assumptions

- NON-BLOCKING: A credentials file holds exactly one identity. Default: the flat shape in
  the Design section. A mounted secret in Docker, Kubernetes, or GitHub Actions carries one
  identity, so a multi-profile shape is not needed. Invalidated if a deployment needs to
  switch tenants from one mounted file.
- NON-BLOCKING: The permission check reads `stat().mode & 0o077` and refuses any nonzero
  result. Default: refuse. Invalidated if a supported host mounts secrets with group-read
  bits it cannot change; then add an explicit `INTELLIGRC_ALLOW_SHARED_CREDENTIALS_FILE=1`
  switch in a later change, never a silent pass.
- NON-BLOCKING: `auth status` performs no network request. Default: report presence of the
  secret and the resolved fields only. Invalidated if the owner wants the tenant-list
  probe folded in; `doctor` already does that probe.
- NON-BLOCKING: The credential has no expiry the API exposes. Default: `auth status`
  prints `"expiry": null` and `"permissions": null` so the fields exist for agents.

## Design

### Files

- `src/secret-store.ts`: replace `KeyringSecretStore` with `FileSecretStore`. Same three
  methods. Constructor takes the config directory.
- `src/identity.ts` (new): `resolveIdentity` chooses the base source, applies overrides,
  enforces the base URL rule, and returns an `Identity`. `resolveApiContext` in
  `src/api/resolve.ts` becomes a thin wrapper that maps `Identity` to `ApiContext`.
- `src/credentials-file.ts` (new): reads and validates the credentials file, including
  the permission check. Shared by `src/identity.ts` only.
- `src/commands/auth/status.ts` (new): prints the resolved identity without secrets.
- `src/commands/auth/login.ts`, `src/commands/auth/remove.ts`, `src/commands/doctor.ts`:
  construct `FileSecretStore` with `this.config.configDir`.
- `src/api/run-get.ts`, `src/api/run-write.ts`: pass `flags.profile as string | undefined`.
- `src/manifest.ts`: `profileFlag.required` becomes `false`; new `auth status` entry; new
  `ENV_CATALOG` and `env` field in `buildCatalog`; `catalogVersion: 4`.
- `src/errors.ts`: new codes, one removed meaning updated.
- `test/helpers/auth-fixtures.ts`, `test/helpers/run-cli.ts`: drop the fake keyring; read
  `secrets.json` instead.
- Deleted: `test/helpers/fake-keyring.mjs`, `test/helpers/fake-keyring-register.mjs`,
  `test/native-store.check.ts`.
- `package.json`: remove the dependency and the `check:native-store` script.
- `.github/workflows/cross-platform.yml`: remove the three native-store steps and their
  comments; add one secrets-file permission step on POSIX.
- `docs/adr/0002-file-secret-store-no-keychain.md` (new).
- `README.md`, `CONTEXT.md`, `.claude/skills/intelligrc-cli/SKILL.md`: wording.

### Secrets file

Path: `<configDir>/secrets.json`. Mode 0600. Directory created with mode 0700.

```json
{"secretsVersion": 1, "secrets": {"prod": "<client secret>"}}
```

`FileSecretStore`:

```ts
export interface SecretStore {
  get(profileName: string): string | null
  set(profileName: string, secret: string): void
  delete(profileName: string): boolean
}

export class FileSecretStore implements SecretStore {
  readonly filePath: string
  constructor(configDir: string)
}
```

- `get`: missing file returns `null`. Unreadable or unparseable file, or wrong
  `secretsVersion`, throws `secret-store-failure` (exit 3). On POSIX, a file whose mode
  has any group or other bit set throws `secrets-file-permissions` (exit 3) before the
  file is read; the message names the path and the command `chmod 600 <path>`.
- `set`: read (or start empty when the file is missing), set the key, write atomically
  with the `ProfileStore.write` pattern (temp file with mode 0600, rename). Any write
  failure throws `secret-store-failure`.
- `delete`: returns `false` when the file or the key is missing; otherwise removes the key
  and writes. Failure throws `secret-store-failure`.

### Credentials file

Named by `INTELLIGRC_CREDENTIALS_FILE`. The CLI only reads it.

```json
{
  "credentialsVersion": 1,
  "clientId": "…",
  "clientSecret": "…",
  "tenantId": "…",
  "tenantName": "Acme",
  "baseUrl": "https://api.intelligrc.app"
}
```

`clientId`, `clientSecret`, and `tenantId` are required non-empty strings. `tenantName`
and `baseUrl` are optional. Failures, all exit 3: `credentials-file-unreadable` (cannot
open or parse), `credentials-file-invalid` (wrong version or missing required field; the
message names the field), `credentials-file-permissions` (POSIX mode has group or other
bits). The path is relative to the current working directory when not absolute.

### Identity resolution

`src/identity.ts`:

```ts
export type IdentitySource = 'profile' | 'credentials-file' | 'environment'
export type SecretSource = 'secrets-file' | 'credentials-file' | 'environment'

export interface Identity {
  source: IdentitySource
  /** Present when source is "profile". */
  profile?: string
  /** Present when source is "credentials-file". */
  credentialsFile?: string
  clientId: string
  clientSecret: string
  tenantId: string
  tenantName: string | null
  baseUrl: string
  secretSource: SecretSource
  /** Environment variables that replaced a field of the base source. */
  overrides: string[]
}

export function resolveIdentity(
  profileName: string | undefined,
  configDir: string,
  env: NodeJS.ProcessEnv,
): Identity
```

Order of evaluation:

1. If `INTELLIGRC_CREDENTIALS_FILE` is set and non-empty:
   - If `profileName` is given, throw `identity-source-conflict` (exit 2). The message
     says: pass `--profile` or set `INTELLIGRC_CREDENTIALS_FILE`, not both.
   - Load the credentials file. Base source is `credentials-file`.
2. Else if `profileName` is given: load the profile from `ProfileStore` (throw
   `profile-not-found` as today), read the secret from `FileSecretStore` unless
   `INTELLIGRC_CLIENT_SECRET` is set (throw `client-secret-missing` as today when neither
   supplies one). Base source is `profile`.
3. Else if `INTELLIGRC_CLIENT_ID`, `INTELLIGRC_CLIENT_SECRET`, and `INTELLIGRC_TENANT_ID`
   are all set and non-empty: base source is `environment`. `tenantName` is `null`.
4. Else throw `identity-required` (exit 2) with this message: "No identity was supplied.
   Pass --profile NAME, or set INTELLIGRC_CREDENTIALS_FILE, or set INTELLIGRC_CLIENT_ID,
   INTELLIGRC_CLIENT_SECRET, and INTELLIGRC_TENANT_ID together."

After the base is chosen, for sources 1 and 2, each of `INTELLIGRC_CLIENT_ID`,
`INTELLIGRC_CLIENT_SECRET`, `INTELLIGRC_TENANT_ID`, and `INTELLIGRC_BASE_URL` that is set
replaces the matching field and its name is appended to `overrides`. For source 3,
`INTELLIGRC_BASE_URL` sets the base URL and `overrides` is empty, because the environment
is the base. In every case `resolveBaseUrl` from `src/base-url.ts` validates the final
base URL; a violation throws `profile-base-url-invalid` (exit 3) as today. When the base
supplies no base URL, `DEFAULT_BASE_URL` applies.

`resolveApiContext(profileName: string | undefined, configDir, env)` calls
`resolveIdentity` and returns `{baseUrl, clientId, clientSecret, tenantId,
redactionValues: [clientId, clientSecret, tenantId]}` unchanged in shape, so `apiRequest`
and every command runner are untouched beyond the optional profile name.

### `auth status`

Manifest entry: id `auth status`, kind `profile`, summary "Print the resolved identity
and its source without printing the secret.", flags `profile` (optional), `output`,
`json`. Writes nothing. Sends nothing.

Output on stdout:

```json
{
  "identity": {
    "source": "profile",
    "profile": "prod",
    "credentialsFile": null,
    "clientId": "…",
    "tenantId": "…",
    "tenantName": "Acme",
    "baseUrl": "https://api.intelligrc.app",
    "secretSource": "secrets-file",
    "secretPresent": true,
    "overrides": [],
    "expiry": null,
    "permissions": null
  }
}
```

The command calls `resolveIdentity` and maps the result. It never prints
`clientSecret`. Every failure `resolveIdentity` can throw passes through `emitFailure`
with the same exit code an API command would get, so `auth status` is the cheapest way
for an agent to find out why an API command would fail.

### Catalog

`buildCatalog` gains a top-level `env` list and `catalogVersion` becomes 4:

```ts
export const ENV_CATALOG = [
  {name: 'INTELLIGRC_CREDENTIALS_FILE', meaning: 'Path to a credentials file that supplies the whole identity. Cannot be combined with --profile.'},
  {name: 'INTELLIGRC_CLIENT_ID', meaning: 'Client ID. Overrides the profile or credentials file; with the secret and tenant, forms the environment identity.'},
  {name: 'INTELLIGRC_CLIENT_SECRET', meaning: 'Client secret. Overrides the secrets file or credentials file; with the client ID and tenant, forms the environment identity.'},
  {name: 'INTELLIGRC_TENANT_ID', meaning: 'Tenant ID. Overrides the profile or credentials file; with the client ID and secret, forms the environment identity.'},
  {name: 'INTELLIGRC_BASE_URL', meaning: 'API base URL. Overrides the profile or credentials file. HTTPS required.'},
  {name: 'INTELLIGRC_ALLOW_HTTP_LOCALHOST', meaning: 'Set to 1 to allow plain HTTP for a loopback host. Exists for automated tests.'},
  {name: 'INTELLIGRC_ATTEMPT_TIMEOUT_MS', meaning: 'Per-attempt request timeout in milliseconds.'},
] as const
```

### Error catalog changes in `src/errors.ts`

Added:

| Code | Exit | Meaning |
|---|---|---|
| `identity-required` | 2 | No `--profile`, no `INTELLIGRC_CREDENTIALS_FILE`, and no complete environment identity. |
| `identity-source-conflict` | 2 | `--profile` and `INTELLIGRC_CREDENTIALS_FILE` were both supplied. |
| `secrets-file-permissions` | 3 | The secrets file is readable by group or others. Run `chmod 600` on it. |
| `credentials-file-unreadable` | 3 | The credentials file cannot be opened or parsed. |
| `credentials-file-invalid` | 3 | The credentials file has the wrong version or lacks a required field. |
| `credentials-file-permissions` | 3 | The credentials file is readable by group or others. |

Changed: `secret-store-failure` meaning becomes "The secrets file could not be read,
parsed, or written." `client-secret-missing` meaning becomes "The profile exists but the
secrets file holds no secret for it."

Unchanged: `profile-not-found`, `profile-incomplete`, `profile-base-url-invalid`,
`rollback-failed`, and the rest.

### Failure behavior

- Every failure above exits before any network request and before any request header is
  built, matching the existing guarantee that input and configuration failures send
  nothing.
- A secrets file write failure during `auth login --replace` restores the prior secret
  through `restoreSecret` in `src/secret-store.ts`, which calls `FileSecretStore.set` or
  `FileSecretStore.delete` and reports `rollback-failed` when that also fails.
- `auth remove` deletes the secret first and the profile second, as today, so a failed
  secret deletion leaves the profile listed for retry.

## Implementation slices

### 1. Replace the keychain store with the file store

Completed 2026-09-08 in commit `73ac310`. `npm test`: 474 pass, 0 fail. `grep -rn keyring src test package.json`: no output. Login probe against `http://127.0.0.1:9` exited 5 and left no `secrets.json`. Deviation: the process-level test "a failed configuration write during replacement restores the prior secret" was also removed, not only the "failed rollback" test. With one directory holding both files, a profiles write cannot fail after a secrets write succeeds, so the restore path is covered by the `restoreSecret` unit tests in `test/secret-store.test.ts`.

- Worker: Codex headless, `gpt-5.6-sol`, effort high, `-s workspace-write`.
- Outcome: `auth login`, `auth remove`, `doctor`, and every API command read and write
  the secret through `secrets.json`. The keychain dependency and its test seams are gone.
  All existing tests pass with the fixtures reading the secrets file.
- Changes:
  - `src/secret-store.ts`: delete `KeyringSecretStore`; add `SecretStore` and
    `FileSecretStore` as designed, including the POSIX permission check
    (`process.platform !== 'win32'`), the atomic write, and the `secretsVersion` check.
  - `src/api/resolve.ts`, `src/commands/auth/login.ts`, `src/commands/auth/remove.ts`,
    `src/commands/doctor.ts`: replace `new KeyringSecretStore()` with
    `new FileSecretStore(configDir)` where `configDir` is `this.config.configDir` in a
    command and the existing `configDir` parameter in `resolveApiContext`.
  - `src/errors.ts`: update the meanings of `secret-store-failure` and
    `client-secret-missing`; add `secrets-file-permissions`.
  - `src/commands/auth/login.ts` description and `src/commands/auth/remove.ts`
    description: replace "operating system protected secret store" with "the secrets file
    in the CLI config directory, mode 0600".
  - `src/commands/auth/login.ts` `rollbackSecret` message: replace the keychain service
    wording with the secrets file path.
  - `test/helpers/auth-fixtures.ts`: `AuthContext` loses `keyringFile`; add
    `secretsPath(home)` returning `<home>/.config/intelligrc/secrets.json`; replace
    `readKeyring(ctx)` with `readSecrets(home): Record<string, string>` that returns the
    `secrets` object or `{}` when the file is missing.
  - `test/helpers/run-cli.ts`: delete `fakeKeyringEnv`.
  - Delete `test/helpers/fake-keyring.mjs`, `test/helpers/fake-keyring-register.mjs`,
    `test/native-store.check.ts`.
  - `test/test-seam.test.ts`: delete the loader-hook test.
  - `test/auth-login.test.ts`, `test/auth-list.test.ts`, `test/tenant-list.test.ts`,
    `test/live-suite.test.ts`, `test/pack.test.ts`: replace `readKeyring` assertions
    with `readSecrets`; the login test asserts `readSecrets(ctx.home)` deep-equals
    `{acme: SECRET}`.
  - `test/doctor.test.ts` "missing protected secret": replace `rmSync(ctx.keyringFile)`
    with `rmSync(secretsPath(ctx.home))`; expected code stays `client-secret-missing`.
  - `test/auth-replace.test.ts` "failed secret write": replace the
    `INTELLIGRC_FAKE_KEYRING_FAIL: 'set'` injection with `chmodSync(secretsPath, 0o400)`
    plus `chmodSync(configDir, 0o500)` so the atomic rename fails; skip on `win32`;
    expected code stays `secret-store-failure` and the stored secret stays the first one.
  - `src/secret-store.ts`: export `restoreSecret(store: SecretStore, profileName:
    string, hadProfile: boolean, priorSecret: string | null): void`, moved from the
    private `rollbackSecret` method in `src/commands/auth/login.ts`. It calls `store.set`
    when `hadProfile` and `priorSecret` is not null, else `store.delete`, and wraps any
    thrown error in `rollback-failed` (exit 3) with a message that names
    `store.filePath` and the profile name. Login calls it from the same place it called
    `rollbackSecret`.
  - `test/auth-replace.test.ts` "failed rollback": delete this process-level test. With
    a file store, a profiles write failure and a secrets rollback failure cannot be
    produced independently from outside the process, because both files live in the same
    directory and the secret write happens first. Replace it with a unit test in
    `test/secret-store.test.ts`: `restoreSecret` with a stub store whose `delete` throws
    raises a `CliFailure` with code `rollback-failed` whose message contains the stub's
    `filePath` and the profile name; with a stub whose `set` succeeds and `hadProfile`
    true, it calls `set` with the prior secret and does not call `delete`.
  - `test/auth-remove.test.ts` "secret store as the failed component": replace the
    injection with `chmodSync(configDir, 0o500)` before the run, after making
    `profiles.json` still readable; because the secret deletion now fails first, expected
    code is `secret-store-failure` and the profile stays listed. Adjust the sibling test
    "names profiles.json as the failed component" to first make the secrets file absent
    (`rmSync(secretsPath)`) so removal passes the secret step and fails on the profiles
    write.
  - New tests in `test/secret-store.test.ts` (unit, importing from
    `../dist/secret-store.js` the way `test/prompt.test.ts` imports `../dist/prompt.js`,
    because `secret-store.ts` imports `errors.js` and cannot run under type stripping
    from `src`): `set` creates the file with
    mode 0600 and the directory with mode 0700 (POSIX only); `get` of a missing file
    returns `null`; `get` of a file with mode 0644 throws a `CliFailure` with code
    `secrets-file-permissions` (POSIX only); `get` of a file with `secretsVersion: 2`
    throws `secret-store-failure`; `delete` of a missing key returns `false`; `set` then
    `get` round-trips; the temp file is absent after a successful `set`.
  - `package.json`: remove `@napi-rs/keyring` from `dependencies` and remove the
    `check:native-store` script. Run `npm install` so `package-lock.json` updates.
- Files: listed above.
- Dependencies: none.
- Validation:
  - `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npm test` — every test passes; the
    reporter shows zero failures.
  - `grep -rn "keyring" src test package.json` — prints nothing.
  - `PATH="/opt/homebrew/opt/node@24/bin:$PATH" ./bin/run.js auth login --profile t --client-id c --client-secret-env S --base-url http://127.0.0.1:9 ` with `S=x` and
    `INTELLIGRC_ALLOW_HTTP_LOCALHOST=1` and `XDG_CONFIG_HOME` pointed at a temp directory —
    exits 5 (`network-failure`) after tenant discovery, proving the code path reaches the
    network without any keychain access, and leaves no `secrets.json` behind.
- Done when: `npm test` passes and the grep prints nothing.

### 2. Add the credentials file and the environment identity

Completed 2026-09-08 in commit `d7b832d`. `npm test`: 484 pass, 0 fail. Environment identity against `https://127.0.0.1:9` exited 5 with `network-failure`; no identity exited 2 with `identity-required` and the full message. `test/manifest-lint.test.ts` and `test/commands.test.ts` were also updated because they pin the `profile` flag definition.

- Worker: Codex headless, `gpt-5.6-sol`, effort high, `-s workspace-write`.
- Outcome: an API command runs with `INTELLIGRC_CREDENTIALS_FILE` and no profile, or with
  the three environment variables and no profile. Mixing the credentials file with
  `--profile` exits 2. No identity at all exits 2 with a message naming all three ways.
- Changes:
  - `src/credentials-file.ts` (new): `readCredentialsFile(path: string):
    CredentialsFile` with the shape and failures designed above. Resolve a relative
    path against `process.cwd()`. Apply the POSIX permission check before reading.
  - `src/identity.ts` (new): `resolveIdentity` exactly as designed, using `ProfileStore`,
    `FileSecretStore`, `readCredentialsFile`, and `resolveBaseUrl`.
  - `src/api/resolve.ts`: `resolveApiContext(profileName: string | undefined, configDir,
    env)` delegates to `resolveIdentity`. Keep the exported failure constructors, which
    `doctor` uses.
  - `src/api/run-get.ts` and `src/api/run-write.ts`: `profile: string | undefined` in
    the options interfaces; every command file already passes `flags.profile as string`,
    which stays type-correct when the flag is optional because the cast widens.
  - `src/manifest.ts`: `profileFlag` becomes `required: false` with summary "Profile that
    supplies the credential, tenant, and base URL. Optional when
    INTELLIGRC_CREDENTIALS_FILE or the INTELLIGRC_CLIENT_ID, INTELLIGRC_CLIENT_SECRET, and
    INTELLIGRC_TENANT_ID variables supply the identity."
  - `src/errors.ts`: add `identity-required`, `identity-source-conflict`,
    `credentials-file-unreadable`, `credentials-file-invalid`,
    `credentials-file-permissions`.
  - `test/helpers/auth-fixtures.ts`: add `writeCredentialsFile(home, fields):
    string` that writes `<home>/credentials.json` with mode 0600 and returns the path.
  - New tests in `test/identity.test.ts` running through `runCli` against the fake API
    with `tenant list` (the API command that needs no tenant header) and
    `facility list` (which does):
    - environment identity with no profile sends `x-client-id`, `x-client-secret`, and
      `x-tenant-id` from the variables and exits 0;
    - environment identity with one of the three variables missing and no profile exits
      2 with `identity-required` and sends nothing;
    - no variables and no profile exits 2 with `identity-required`;
    - credentials file with no profile sends the file's headers and exits 0;
    - credentials file plus `--profile` exits 2 with `identity-source-conflict` and sends
      nothing;
    - credentials file with mode 0644 exits 3 with `credentials-file-permissions` (skip on
      `win32`);
    - credentials file missing `tenantId` exits 3 with `credentials-file-invalid` and the
      message contains `tenantId`;
    - credentials file that is not JSON exits 3 with `credentials-file-unreadable`;
    - credentials file with `INTELLIGRC_TENANT_ID` set sends the variable's value as
      `x-tenant-id`;
    - a profile with `INTELLIGRC_CLIENT_ID` and `INTELLIGRC_CLIENT_SECRET` set still sends
      the overrides (this is the existing `tenant-list` test; keep it passing unchanged).
  - `test/parse-failures.test.ts` line 13, "a missing required flag emits the JSON
    failure contract on stderr": it runs `data-type list` with no flags and expects
    `missing-required-flag`. Change its command to `auth remove`, whose `--profile` stays
    required, so the oclif mapping keeps a test. Add a sibling test: `data-type list`
    with no flags and no `INTELLIGRC_*` variables exits 2 with `identity-required`, empty
    stdout, and a message matching `/--profile/` and `/INTELLIGRC_CREDENTIALS_FILE/`.
- Files: listed above.
- Dependencies: slice 1.
- Validation:
  - `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npm test` — passes.
  - With `XDG_CONFIG_HOME` on an empty temp directory and `INTELLIGRC_CLIENT_ID=x
    INTELLIGRC_CLIENT_SECRET=y INTELLIGRC_TENANT_ID=z INTELLIGRC_BASE_URL=https://127.0.0.1:9`:
    `./bin/run.js facility list` — exits 5 with `network-failure`, not 3 with
    `profile-not-found`.
  - `./bin/run.js facility list` with no variables and no profile — exits 2 with
    `identity-required` and the message names `--profile`,
    `INTELLIGRC_CREDENTIALS_FILE`, and the three variables.
- Done when: the three validations above hold and `npm test` passes.

### 3. Add `auth status` and list environment variables in the catalog

Completed 2026-09-08 in commit `c12d3c0`. `npm test`: 491 pass, 0 fail, plus one added test: `auth status` with no identity exits 2 with `identity-required` (issue #92 acceptance criterion not in the slice text). `commands | jq -r '.env[].name' | sort` and `grep -rho 'INTELLIGRC_[A-Z_]\+' src | sort -u` are identical. `auth status --profile prod` on this machine exits 3 with `client-secret-missing`, because the local profiles still hold their secret in the keychain; the message names `auth login --replace`.

- Worker: Codex headless, `gpt-5.6-sol`, effort high, `-s workspace-write`.
- Outcome: `intelligrc auth status` prints the resolved identity and its source as JSON
  without the secret. `intelligrc commands` lists every environment variable the CLI
  reads, and a test proves the list matches the source.
- Changes:
  - `src/manifest.ts`: add the `auth status` entry as designed; add `ENV_CATALOG`; add
    `env: ENV_CATALOG` to the `Catalog` interface and `buildCatalog`; set
    `catalogVersion: 4` in the type and the value.
  - `src/commands/auth/status.ts` (new): parse, call `resolveIdentity(flags.profile,
    this.config.configDir, process.env)`, print the designed object through
    `formatOutput` with `resolveOutputFormat(flags)`, and route failures through
    `emitFailure` with `[identity.clientSecret]` as the redaction list when the identity
    resolved, else `[]`.
  - `src/commands/auth/status.ts` description: "Runs locally. Reads the profile, the
    secrets file, the credentials file, or the environment, and never contacts a network
    service. Never prints the client secret."
  - `test/auth-status.test.ts` (new): profile source reports `source: "profile"`,
    `secretSource: "secrets-file"`, `secretPresent: true`, `overrides: []`; profile with
    `INTELLIGRC_CLIENT_SECRET` set reports `secretSource: "environment"` and `overrides`
    containing `INTELLIGRC_CLIENT_SECRET`; environment identity reports
    `source: "environment"` and `profile: null`; credentials file reports
    `source: "credentials-file"` and the path; a missing profile exits 3 with
    `profile-not-found`; the stdout of every case does not contain the secret value;
    `expiry` and `permissions` are `null`.
  - `test/catalog-completeness.test.ts`: add a test that reads every file under `src`,
    collects `INTELLIGRC_[A-Z_]+` matches, and asserts the sorted set equals the sorted
    `env[].name` list from `./bin/run.js commands`; add `auth status` to the read-only
    assertions; update the `catalogVersion` assertion to 4.
  - `test/commands.test.ts:234` and `test/pack.test.ts:138`: change the pinned
    `catalogVersion` from 3 to 4.
- Files: listed above.
- Dependencies: slice 2.
- Validation:
  - `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npm test` — passes.
  - `./bin/run.js commands | jq -r '.env[].name' | sort` and
    `grep -rho 'INTELLIGRC_[A-Z_]\+' src | sort -u` — identical output.
  - `./bin/run.js auth status --profile prod | jq .identity.source` — prints
    `"profile"` on this machine after a fresh `auth login`.
- Done when: the two comparisons match and `npm test` passes.

### 4. Remove the keychain from the workflow and record the decision

Completed 2026-09-08. The validation grep matches only ADR-0002. `.github/workflows/live.yml` was also changed: it installed `gnome-keyring` and ran the live suite inside a D-Bus session solely for the keychain, and the validation grep covers every workflow file. `README.md` had no Authentication heading, so one was added after "First compliance workflow". Pull request #94; the workflow result is recorded in Plan history.

- Worker: `fable-worker` subagent (writing). It edits the ADR, the documentation, and
  the workflow YAML; no Codex worker is needed for this slice.
- Outcome: the cross-platform workflow no longer installs `gnome-keyring` or creates a
  keychain; it runs one secrets-file permission check on POSIX. ADR-0002 records the
  reversal. `README.md`, `CONTEXT.md`, and the operator skill describe the three identity
  sources and no longer mention a keychain.
- Changes:
  - `.github/workflows/cross-platform.yml`: delete the three "Native store check" steps
    and the comments that reference `@napi-rs/keyring` and the native store. Add one
    POSIX step after the install step:

    ```yaml
    - name: Secrets file is private after login (POSIX)
      if: runner.os != 'Windows'
      shell: bash
      env:
        INTELLIGRC_ALLOW_HTTP_LOCALHOST: '1'
        CI_SECRET: ci-throwaway
        XDG_CONFIG_HOME: ${{ runner.temp }}/xdg
      run: |
        set +e
        "$INTELLIGRC_INSTALLED_BIN" auth login --profile ci --client-id ci \
          --client-secret-env CI_SECRET --base-url http://127.0.0.1:9 2>/dev/null
        set -e
        # Login fails at tenant discovery (nothing listens), so no secrets file
        # may exist afterward. A file here means a secret was written before
        # discovery succeeded.
        test ! -e "$XDG_CONFIG_HOME/intelligrc/secrets.json"
    ```

    Update the header comment: remove the sentence about the native-store check.
  - `docs/adr/0002-file-secret-store-no-keychain.md` (new), in the same format as
    ADR-0001 (`status`, `date`, title, Why, Considered options, Consequences). Why: the
    keychain failed on Linux CI, containers, and agent sandboxes; the documented
    environment escape did not bypass the profile requirement; the owner runs agents off
    macOS. Considered: keep keychain default with file fallback (rejected: two paths to
    test, and silent fallback is a pitfall); encrypt the file with a passphrase
    (rejected: a passphrase needs a prompt or another secret, which recreates the
    headless problem). Consequences: `README.md` security properties change; the secrets
    file is as safe as the user's home directory; `secrets-file-permissions` refuses a
    shared file.
  - `README.md`: Requirements (line 21) drop the protected-store bullet; First compliance
    workflow (line 56) says the secret goes to `secrets.json` with mode 0600; add a
    "Headless identity" subsection under Authentication showing `INTELLIGRC_CREDENTIALS_FILE`
    and the environment identity with one example each; Security properties (line 540)
    replace the keychain sentence with: "The client secret is stored only in
    `secrets.json` in the CLI config directory with mode 0600, or supplied through
    `INTELLIGRC_CREDENTIALS_FILE` or `INTELLIGRC_CLIENT_SECRET`. The CLI refuses a secrets
    or credentials file that is readable by group or others." Add to the assumptions
    list: "The credential is a long-lived vendor client secret; the archived OpenAPI
    document defines no token exchange, so no short-lived credential exists."
  - `CONTEXT.md` Profile definition: replace "The secret lives in the operating system
    keychain." with "The secret lives in the secrets file in the CLI config directory."
    Add two terms: Credentials file and Identity source, with the meanings from this
    plan's Terms section.
  - `.claude/skills/intelligrc-cli/SKILL.md`: Authentication section replaces the
    keychain sentence, lists the three identity sources with one example each, adds
    `auth status` to the command list, states that `--profile` is optional when another
    source is present, and adds `INTELLIGRC_CREDENTIALS_FILE` to the environment list.
    Replace "keychain read" on line 63 with "secrets file read".
- Files: listed above.
- Dependencies: slice 3.
- Validation:
  - `grep -rn -i "keychain\|keyring\|protected secret store" README.md CONTEXT.md .claude/skills/intelligrc-cli/SKILL.md .github/workflows docs/adr/0002-file-secret-store-no-keychain.md` — matches only inside ADR-0002, where the history is recorded.
  - `gh workflow view cross-platform` after the PR — the workflow file parses; the next
    pull-request run passes on all three operating systems.
- Done when: the grep matches only ADR-0002 and the workflow passes on the PR.

## Acceptance criteria

- AC-1: Given a Linux host with no D-Bus session and no kernel keyring access, when a
  person runs `auth login` with `--client-secret-env` against a reachable API that
  returns one tenant, then the command exits 0, `profiles.json` holds the profile, and
  `secrets.json` holds the secret with mode 0600.
- AC-2: Given an empty config directory and `INTELLIGRC_CLIENT_ID`,
  `INTELLIGRC_CLIENT_SECRET`, and `INTELLIGRC_TENANT_ID` set, when an API command runs
  with no `--profile`, then the request carries those three values in its headers and no
  file under the config directory is read or written.
- AC-3: Given `INTELLIGRC_CREDENTIALS_FILE` naming a valid mode 0600 file, when an API
  command runs with no `--profile`, then the request carries the file's values.
- AC-4: Given `INTELLIGRC_CREDENTIALS_FILE` set, when an API command runs with
  `--profile`, then the command exits 2 with `identity-source-conflict` and sends nothing.
- AC-5: Given no profile flag, no credentials file, and an incomplete environment set,
  when an API command runs, then it exits 2 with `identity-required` and the message
  names all three ways to supply an identity.
- AC-6: Given a secrets file or credentials file with mode 0644 on a POSIX host, when any
  command reads it, then the command exits 3 with `secrets-file-permissions` or
  `credentials-file-permissions` and the message names the path and `chmod 600`.
- AC-7: Given any identity source, when `auth status` runs, then stdout is one JSON
  object with `source`, `secretSource`, `secretPresent`, `overrides`, `expiry`, and
  `permissions`, and stdout never contains the client secret.
- AC-8: Given the built CLI, when `intelligrc commands` runs, then `env[].name` equals
  the set of `INTELLIGRC_*` names found in `src`, and `catalogVersion` is 4.
- AC-9: Given the repository after the change, when `grep -rn keyring src test
  package.json` runs, then it prints nothing, and `npm ci` installs no native package.
- AC-10: Given a failed `secrets.json` write during `auth login --replace`, when the
  command exits, then the previous profile and previous secret are unchanged and the
  code is `secret-store-failure`.

## Validation plan

- Automated: `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npm test` after every slice,
  run by the main session (the Codex sandbox cannot open the fake API's listening
  socket). New files: `test/secret-store.test.ts`, `test/identity.test.ts`,
  `test/auth-status.test.ts`. Changed: `auth-login`, `auth-remove`, `auth-replace`,
  `auth-list`, `doctor`, `tenant-list`, `live-suite`, `pack`, `test-seam`,
  `catalog-completeness`, `commands`, `parse-failures`.
- Manual: on this machine, `auth login --profile prod --client-id <id>
  --client-secret-env <var>` then `auth status --profile prod` then `facility list
  --profile prod`; confirm `ls -l ~/.config/intelligrc/secrets.json` shows `-rw-------`.
- Integration: the cross-platform workflow on the pull request passes on Ubuntu, macOS,
  and Windows with the keychain steps removed. `npm run check:live` against the real
  tenant (`test/live/live-suite.ts`) passes using the file store.

## Risks and recovery

- Risk: a user's existing profile has its secret in the keychain and the new CLI cannot
  read it — Prevention: `client-secret-missing` already names the fix, `auth login
  --replace`; the README release note says every profile must be recreated once —
  Recovery: run `auth login --replace` per profile.
- Risk: `secrets.json` is copied or synced into a shared location — Prevention: the
  permission check refuses group- or world-readable files; the README says the file is as
  private as the home directory — Recovery: rotate the client secret in IntelliGRC and run
  `auth login --replace`.
- Risk: a test that injected keyring failures loses coverage when rewritten with
  `chmod` — Prevention: each rewritten test keeps its original expected error code and
  its "profile unchanged" assertion; `win32` skips are explicit — Recovery: none needed;
  the assertions are the same.
- Risk: making `--profile` optional lets a command run against the wrong tenant when a
  stale environment variable is set — Prevention: environment identity requires all
  three variables; `auth status` shows the effective source and overrides; the skill file
  tells agents to run `auth status` before the first write in a session — Recovery: none
  beyond the API's own tenant scoping, which the CLI does not bypass.
- Risk: the credentials file path is relative and the agent runs from another directory
  — Prevention: the `credentials-file-unreadable` message prints the resolved absolute
  path — Recovery: set an absolute path.

## Plan history

- 2026-09-08: Code review (standards and spec axes) after the four slices. Fixed: a blank `INTELLIGRC_*` variable overrode a good field with an empty string, so blank now counts as unset everywhere in `resolveIdentity`; the secrets temp file is created exclusively so mode 0600 always applies; leftover "protected secret" and "profile resolution" wording; the README write section contradicted the Authentication section; a README migration note for pre-existing profiles. Added tests: blank override, secrets file mode 0600 after login, and the `chmod 600` message on both permission codes. Not changed, by design: `FileSecretStore` mirrors `ProfileStore` rather than sharing a base class, `resolve.ts` stays a thin wrapper, and the `SecretStore` interface stays for the rollback unit test.
- 2026-09-08: Slices 1 to 4 implemented on branch `feature/identity-rewrite` (commits `73ac310`, `d7b832d`, `c12d3c0`, and the slice 4 commit). Two discoveries: the process-level rollback happy-path test cannot be produced with a single-directory file store and moved to a unit test; the live workflow also depended on the keychain and was simplified. The two profiles saved on the owner's machine (`prod`, `tp`) still hold their secret in the macOS keychain and need `auth login --replace` once; the `security` command needs a GUI approval to read them, so this was not automated.
- 2026-09-08: Published as GitHub issues #89 (store), #90 (environment identity), #91
  (credentials file), #92 (`auth status` and catalog env), #93 (CI, ADR, docs). Slice 2
  became two tickets, #90 and #91, so each lands one demoable behavior.
- 2026-09-08: Created from the agent-first CLI audit. The owner decided the keychain is
  not to be used; this plan removes it rather than keeping it as a default with a file
  fallback.
