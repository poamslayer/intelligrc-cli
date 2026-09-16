/**
 * The environment variables one call reads.
 *
 * This is structurally what `NodeJS.ProcessEnv` is, written without the
 * ambient `NodeJS` namespace on purpose. The type appears in the published
 * declarations of the `core` export subpath, and naming an ambient namespace
 * there would make the surface depend on the consumer having installed
 * `@types/node`. `process.env` is assignable to it, so the CLI passes its own
 * environment unchanged.
 */
export type EnvironmentVariables = Record<string, string | undefined>
