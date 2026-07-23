/**
 * Masked client-secret prompt. Typed characters never reach the output
 * stream. The prompt text and the final newline are the only bytes
 * written, so the secret cannot appear on screen or in a capture of the
 * terminal.
 */
import {CliFailure, EXIT} from './errors.js'

const ENTER_CR = '\r'
const ENTER_LF = '\n'
const CTRL_C = String.fromCharCode(3)
const BACKSPACE = String.fromCharCode(127)
const CTRL_H = String.fromCharCode(8)

export interface PromptInput extends NodeJS.ReadableStream {
  isTTY?: boolean
  setRawMode?: (mode: boolean) => void
}

export function promptSecret(
  input: PromptInput,
  output: NodeJS.WritableStream,
  promptText = 'Client secret (input hidden): ',
): Promise<string> {
  return new Promise((resolve, reject) => {
    output.write(promptText)

    // Raw mode delivers keystrokes unbuffered and disables the terminal's
    // own echo. Fake streams in tests have no raw mode; they never echo.
    if (input.isTTY) {
      input.setRawMode?.(true)
    }

    let value = ''

    const finish = (action: () => void): void => {
      input.removeListener('data', onData)
      if (input.isTTY) {
        input.setRawMode?.(false)
      }

      input.pause()
      action()
    }

    const onData = (chunk: Buffer | string): void => {
      for (const char of chunk.toString('utf8')) {
        if (char === ENTER_CR || char === ENTER_LF) {
          finish(() => {
            output.write('\n')
            resolve(value)
          })
          return
        }

        if (char === CTRL_C) {
          finish(() => {
            output.write('\n')
            reject(
              new CliFailure({
                code: 'prompt-cancelled',
                message: 'The client-secret prompt was cancelled.',
                exitCode: EXIT.invalidInput,
              }),
            )
          })
          return
        }

        if (char === BACKSPACE || char === CTRL_H) {
          value = value.slice(0, -1)
          continue
        }

        value += char
      }
    }

    input.on('data', onData)
    input.resume()
  })
}

/**
 * Visible yes-or-no prompt for a destructive action, built on the same
 * stdin-reading mechanism as promptSecret but without masking, so the reader
 * sees what they type. It reads one line and resolves true only for an
 * affirmative answer ("y" or "yes", case-insensitive). Every other answer,
 * including a bare Enter, resolves false — the default is always "no", so an
 * accidental Enter never confirms.
 */
export function promptConfirm(
  input: PromptInput,
  output: NodeJS.WritableStream,
  promptText: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    output.write(promptText)

    let value = ''

    const finish = (answer: string): void => {
      input.removeListener('data', onData)
      input.pause()
      const normalized = answer.trim().toLowerCase()
      resolve(normalized === 'y' || normalized === 'yes')
    }

    const onData = (chunk: Buffer | string): void => {
      value += chunk.toString('utf8')
      const newlineIndex = value.search(/[\r\n]/)
      if (newlineIndex !== -1) {
        finish(value.slice(0, newlineIndex))
      }
    }

    input.on('data', onData)
    input.resume()
  })
}
