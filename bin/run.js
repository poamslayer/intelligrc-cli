#!/usr/bin/env node

import {Errors, flush, run} from '@oclif/core'

import {emitFailure} from '../dist/errors.js'
import {oclifFailure} from '../dist/oclif-failure.js'

try {
  await run(process.argv.slice(2), import.meta.url)
  await flush()
} catch (error) {
  // A parse-time failure oclif raised before the command ran. Emit it through
  // the same contract every other failure uses.
  const failure = oclifFailure(error, process.argv.slice(2))
  if (failure) {
    process.exit(emitFailure(failure, []))
  }

  // Everything else, including the ExitError a command throws after writing
  // its own failure, keeps oclif's handling unchanged.
  await Errors.handle(error)
}
