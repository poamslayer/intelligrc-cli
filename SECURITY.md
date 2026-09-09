# Security policy

## Reporting a vulnerability

Report a security problem through GitHub private vulnerability reporting on this
repository. Open the Security tab and use the "Report a vulnerability" button.

Do not open a public issue for a security problem.

## Scope

This policy covers the CLI source under `src/` and the published npm package
`@poamslayer/intelligrc-cli`.

A problem in the IntelliGRC service itself is out of scope. Report that problem to
IntelliGRC, not to this repository.

## What to include

1. The affected version. Run `intelligrc version` to get it.
2. Steps to reproduce the problem.
3. The impact if the problem is exploited.

## Response

The maintainer acknowledges each report within seven days. The acknowledgement
confirms receipt. It does not set a date for a fix.

## Known non-issue: test TLS key pair

The files `test/helpers/tls-test-key.pem` and `test/helpers/tls-test-cert.pem` are a
self-signed RSA key pair committed on purpose. The certificate subject is
`CN=intelligrc-cli-test-only`.

Only `test/helpers/fake-tls.ts` uses the key pair. That helper runs a loopback HTTPS
server in the test suite to prove that the CLI keeps certificate validation enabled.

The key is trusted by nothing and authenticates nothing. Secret-scanning alerts on
these two files are expected and can be dismissed.

## How the CLI handles credentials

The CLI stores the client secret in a private file with 0600 permissions under the
user's config directory. The secret is never stored in the repository and never
written to logs.
