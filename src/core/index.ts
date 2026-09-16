/**
 * The supported library surface of this package, published as the `core`
 * export subpath.
 *
 * It exists so another program — today the IntelliGRC MCP server — sends
 * requests through the same transport and reads the same command catalog
 * the `intelligrc` executable uses, rather than keeping a copy that can
 * drift. Everything re-exported here carries semver obligations. See
 * `docs/core-export.md` for the version policy and what may change.
 *
 * Three rules hold for every module reachable from this file:
 *
 * 1. It never prompts on a terminal.
 * 2. It never exits the process.
 * 3. It never reads the working directory. A caller that needs a relative
 *    path resolved supplies the directory to resolve it against.
 *
 * Nothing here writes to standard output or standard error either, so the
 * caller decides what its own output is.
 */

export {
  apiRequest,
  type ApiRequestOptions,
  type ApiSuccess,
  type HttpMethod,
  type QueryPairs,
} from '../api/client.js'

export {
  CliFailure,
  ERROR_CATALOG,
  EXIT,
  EXIT_CODE_CATALOG,
  type FailureFields,
  redact,
} from '../errors.js'

export {DEFAULT_BASE_URL, resolveBaseUrl} from '../base-url.js'

export {
  CONFIG_DIRNAME,
  CONFIG_DIR_VARIABLE,
  resolveConfigDir,
} from '../config-dir.js'

export {type EnvironmentVariables} from '../environment.js'

export {
  type Identity,
  type IdentitySource,
  type SecretSource,
  resolveIdentity,
} from '../identity.js'

export {
  type ApiCommandSpec,
  type ArgSpec,
  type Catalog,
  type CatalogCommand,
  type CatalogOperation,
  type CommandSpec,
  ENV_CATALOG,
  type FlagSpec,
  type OperationContract,
  type ParameterContract,
  type RequestBodyFieldContract,
  type RequestBodyItemContract,
  type RequestBodyItemFieldContract,
  type VariantContract,
  type WriteTarget,
  apiCommandSpec,
  buildCatalog,
  commandSpec,
  commandSpecs,
  selectContract,
} from '../manifest.js'
