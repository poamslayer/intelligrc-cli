/**
 * Upstream error-body preservation shared by tenant discovery and the API
 * request runtime. The body is parsed as JSON regardless of its declared
 * content type; a non-JSON body is preserved as bounded redacted text.
 */
import {redact} from '../errors.js'

/**
 * Bound for preserved upstream error text, applied after redaction so a
 * credential straddling the boundary can never leave a partial value
 * behind. Measured in UTF-16 code units, which equals bytes for the
 * ASCII bodies the contract describes.
 */
const MAX_PRESERVED_BODY_LENGTH = 16 * 1024
const TRUNCATION_MARKER = '…[truncated]'

export function apiErrorFromBody(bodyText: string, redactionValues: string[]): unknown {
  const redacted = redact(bodyText, redactionValues)
  const bounded =
    redacted.length > MAX_PRESERVED_BODY_LENGTH
      ? redacted.slice(0, MAX_PRESERVED_BODY_LENGTH) + TRUNCATION_MARKER
      : redacted
  try {
    return JSON.parse(bounded)
  } catch {
    return bounded
  }
}
