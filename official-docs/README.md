# IntelliGRC API documentation

IntelliGRC's API documentation is the property of IntelliGRC. It is published behind the
vendor's login at <https://api-docs.intelligrc.app>, and this repository does not
distribute it.

## What this directory holds

- `errata.md`: observed API behavior that the vendor's document does not describe. This
  file is the project's own writing.
- `SHA256SUMS`: checksums of the vendor files the maintainer's local copy was taken from.
  Use them to confirm that a local copy matches the version the CLI was built against.

## Local copy for the contract test

`test/contract.test.ts` compares every CLI command against the OpenAPI document. The test
reads the document from `official-docs/swagger/v1/swagger.json`, or from the path in the
`INTELLIGRC_OPENAPI_PATH` environment variable when that variable is set. When the file is
absent, the contract tests are skipped and the rest of the suite still runs.

To run the contract tests:

1. Sign in to <https://api-docs.intelligrc.app> with an IntelliGRC account.
2. Save the OpenAPI document to `official-docs/swagger/v1/swagger.json`. The path is
   gitignored, so the copy stays on your machine.
3. Run `shasum -a 256 -c SHA256SUMS --ignore-missing` from this directory to confirm the
   copy matches the version the checksums record.
4. Run `npm test`.

The checksums describe the document as it existed when the checksums were recorded. A
newer document from the vendor will fail the checksum and may change contract test
results; that is expected, and the failing tests show what changed.
