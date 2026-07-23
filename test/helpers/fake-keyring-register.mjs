/**
 * Module loader hook that redirects every import of @napi-rs/keyring to the
 * file-backed fake. Injected into spawned CLI processes through
 * NODE_OPTIONS="--import <this file>" by the test seam. Never loaded in
 * production.
 */
import {registerHooks} from 'node:module'

const shimUrl = new URL('./fake-keyring.mjs', import.meta.url).href

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@napi-rs/keyring') {
      return {url: shimUrl, shortCircuit: true}
    }

    return nextResolve(specifier, context)
  },
})
