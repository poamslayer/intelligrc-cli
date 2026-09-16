# The `core` export subpath

`@poamslayer/intelligrc-cli/core` is a supported library API. It exists so another
program sends requests through the same transport and reads the same command catalog the
`intelligrc` executable uses, rather than keeping a copy that drifts.

The first consumer is the IntelliGRC MCP server. Its ADR-0003 records why it consumes a
subpath on this package instead of a third shared package.

## What the subpath serves

```js
import {apiRequest, buildCatalog, resolveIdentity} from '@poamslayer/intelligrc-cli/core'
```

Three things, and nothing else:

1. **The transport.** `apiRequest`, with its `ApiRequestOptions`, `ApiSuccess`,
   `HttpMethod`, and `QueryPairs` types. One call sends one documented request and applies
   the whole request policy: credential headers, per-attempt timeout, bounded retries,
   Retry-After delays, same-host-only redirects, and mandatory certificate validation. A
   POST is never retried.
2. **The manifest.** `buildCatalog`, `commandSpecs`, `commandSpec`, `apiCommandSpec`,
   `selectContract`, `ENV_CATALOG`, and the types that describe them. This is the command
   catalog the contract suite keeps equal to the archived OpenAPI document.
3. **Identity resolution.** `resolveIdentity` and its `Identity` type, covering all three
   identity sources: a named profile, a credentials file, and the environment.

It also serves the failure vocabulary those three raise — `CliFailure`, `EXIT`,
`ERROR_CATALOG`, `EXIT_CODE_CATALOG`, `redact` — plus `resolveBaseUrl`,
`DEFAULT_BASE_URL`, and the `EnvironmentVariables` type.

## Three rules every module behind the subpath follows

A command may prompt, exit, and read the working directory. A long-running server may do
none of those, so the modules behind this subpath do none of them:

1. **No terminal prompting.** A prompt with no terminal attached blocks forever.
2. **No process exit.** An exit takes down the host program.
3. **No working-directory lookup.** A relative path resolves against a directory the
   caller supplies. `resolveIdentity` takes that directory as its fourth argument.

Nothing behind the subpath writes to standard output or standard error either. The CLI's
own writes to standard error live in `src/report.ts`, which the subpath does not reach.

`test/core-export-purity.test.ts` walks the module graph out of `src/core/index.ts` and
fails on any of these.

## What is deliberately not served

- **The oclif adaptation.** `oclifArgs` and `oclifFlags` live in `src/oclif-manifest.ts`,
  so the manifest itself is plain data and a consumer never loads a command framework.
- **Output formatting, prompting, and failure reporting.** A consumer decides what its
  own output is.
- **The command classes.** They are the executable, not a library.
- **A deep import.** The package declares an `exports` map, so
  `@poamslayer/intelligrc-cli/dist/manifest.js` is refused with
  `ERR_PACKAGE_PATH_NOT_EXPORTED`. The cost of the shared code stays visible and
  versioned.

## Semver obligations

Everything the subpath exports is public API under this package's version:

- **Patch**: behavior fixes that keep every exported signature.
- **Minor**: new exports, and new optional fields on an exported type.
- **Major**: removing an export, renaming one, changing a signature, making an optional
  field required, or narrowing a return type.

Catalog content is data rather than API surface. Adding a command, or adding a flag to
one, is a minor release. Removing a command, or renaming one, is a major release, because
a consumer resolves requests against the catalog and a removed entry stops resolving.

The export surface is deliberately small and `test/core-export-purity.test.ts` caps the
module graph it reaches. Growing it is a decision to take on purpose: raise the cap in
that test and record here what was added and why.

## Version policy for a consumer

A consumer pins a caret range on a released version, for example
`"@poamslayer/intelligrc-cli": "^0.2.0"`. Before 1.0.0 a caret range on a `0.x` version
allows patch releases only, which is the intended caution.

When the catalog changes, a consumer that resolves requests against it sees the change on
its next install:

- A **new command** becomes reachable with no consumer change.
- A **removed or renamed command** stops resolving, and every request naming its
  operation is refused before anything is sent. That is the designed failure: the consumer
  reports that the operation is not in the catalog rather than sending an undocumented
  path.

A consumer that needs to know it is running against an expected catalog reads
`buildCatalog().catalogVersion`, which changes when the catalog's own shape changes.

## Proving it works

`test/core-export.test.ts` packs a tarball from a clean checkout, installs it into a
separate consumer package, and then:

- imports the subpath by specifier and reads the catalog through it,
- refuses a deep import into the package,
- typechecks a consumer source file against the shipped declaration files, with no
  `@types/node` installed, so the declarations cannot depend on an ambient namespace the
  consumer does not have,
- resolves an identity from a credentials file and sends one request through the
  transport to a recording server.

Testing the installed tarball rather than `src/` is the point: the exports map, the built
JavaScript, and the declaration files can each break without the source changing.
