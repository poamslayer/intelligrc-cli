---
status: accepted
date: 2026-09-08
---

# Store the client secret in a mode 0600 file and remove the operating-system keychain

Until September 2026 the CLI stored the client secret only in the operating-system
secret store through `@napi-rs/keyring`, and `README.md` listed "no plaintext fallback"
as a security property. We reversed that decision. The secret of a saved profile now
lives in `secrets.json` in the CLI config directory with mode 0600, the keychain
dependency is gone, and two headless identity sources exist beside the profile: a
credentials file named by `INTELLIGRC_CREDENTIALS_FILE`, and the environment identity
formed by `INTELLIGRC_CLIENT_ID`, `INTELLIGRC_CLIENT_SECRET`, and `INTELLIGRC_TENANT_ID`.

## Why

- The keychain failed on the hosts an agent runs on. On Linux CI without a D-Bus session
  and an unlocked Secret Service collection, inside a container whose seccomp profile
  blocks the kernel keyring, and in agent sandboxes, `auth login` failed at the secret
  write with exit code 3 and saved no profile.
- The documented environment escape did not work. `INTELLIGRC_CLIENT_SECRET` was read
  only after the profile loaded, so with every `INTELLIGRC_*` variable set and no profile
  the CLI still exited 3 with `profile-not-found`. The CLI had no working headless
  identity path on any platform.
- The owner runs agents off macOS. A store that works only on an unlocked macOS login
  session protects nothing where the CLI is actually used.

## Considered options

- **Keep the keychain as the default with a file fallback.** Rejected. Two storage paths
  double the tests and the documentation, and a silent fallback is a pitfall: a user
  would not know which store holds the secret until something failed.
- **Encrypt the secrets file with a passphrase.** Rejected. A passphrase needs either an
  interactive prompt or another secret to unlock it, which recreates the headless
  problem this decision exists to solve.
- **Store the secret in a mode 0600 file, as the AWS CLI and gcloud do.** Accepted. One
  path to test, one path to explain, and it works on every host the CLI supports.

## Consequences

- The security properties in `README.md` change. The client secret is stored in
  `secrets.json` with mode 0600, or supplied through `INTELLIGRC_CREDENTIALS_FILE` or
  `INTELLIGRC_CLIENT_SECRET`. The "no plaintext fallback" property no longer holds.
- The secrets file is as safe as the user's home directory. Anyone who can read the home
  directory as that user can read the secret.
- The CLI refuses a shared file. On POSIX, a secrets file with any group or other
  permission bit set fails with `secrets-file-permissions` (exit 3), and a credentials
  file in the same state fails with `credentials-file-permissions` (exit 3). Each message
  names the path and the fix, `chmod 600`. Windows skips the check because its file ACLs
  do not map to POSIX mode bits.
- Every profile created before this change must be recreated once with
  `auth login --replace`, because the new CLI cannot read a secret from the keychain.
- The cross-platform workflow no longer installs `gnome-keyring` or creates a keychain.
  It checks instead that a login which fails at tenant discovery leaves no secrets file
  behind.
- Reopen this decision if the vendor API adds a token exchange that makes a short-lived
  credential possible, or if a supported host mounts secrets with permission bits the
  user cannot change.
