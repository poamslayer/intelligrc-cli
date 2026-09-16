#!/usr/bin/env node

import {Errors, flush, run} from '@oclif/core'

import {oclifFailure} from '../dist/oclif-failure.js'
import {emitFailure} from '../dist/report.js'

// A reader that goes away is not a failure. oclif installs a stdout error
// handler that swallows EPIPE and rethrows everything else, and macOS raises
// ENOTCONN rather than EPIPE when the read end of the pipe is already gone.
// That rethrow escapes as an uncaught exception and prints a stack trace on
// stderr, which breaks the contract that stderr carries only JSON. Ending
// quietly is what a reader like `head` expects.
//
// Any other uncaught exception still reports through the failure contract
// rather than as a raw stack trace.
process.on('uncaughtException', (error) => {
  if (error?.code === 'EPIPE' || error?.code === 'ENOTCONN') {
    process.exit(0)
  }

  process.exit(emitFailure(error, []))
})

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
