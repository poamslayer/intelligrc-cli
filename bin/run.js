#!/usr/bin/env node

import {Errors, flush, run} from '@oclif/core'

import {emitFailure} from '../dist/errors.js'
import {oclifFailure} from '../dist/oclif-failure.js'

try {
  await run(process.argv.slice(2), import.meta.url)
  // Not awaited, matching oclif's own execute(). flush() resolves on a
  // "drain" event that never arrives when a downstream reader closes the
  // pipe early, as `intelligrc commands | head` does, and its timeout timer
  // is unref'd. Awaiting it there leaves the process exiting with a pending
  // await, which Node reports on stderr and which would break a caller that
  // parses stderr.
  void flush()
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
