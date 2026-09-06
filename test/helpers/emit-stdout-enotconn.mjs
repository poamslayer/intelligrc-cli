/**
 * Test-only preload. Raises on standard output the exact error macOS gives
 * when the read end of the pipe is already gone.
 *
 * oclif installs its own standard-output error handler that returns for EPIPE
 * and rethrows everything else, so this error escapes as an uncaught
 * exception. That is the failure this fixture reproduces, deterministically
 * and on every platform, instead of waiting for the race to land.
 */
setTimeout(() => {
  const error = new Error('write ENOTCONN')
  error.code = 'ENOTCONN'
  process.stdout.emit('error', error)
}, 50)
