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
