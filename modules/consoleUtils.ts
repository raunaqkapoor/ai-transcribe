type LoaderOptions = {
    message?: string
    intervalMs?: number
    frames?: string[]
    successSymbol?: string
    failureSymbol?: string
}

/**
 * Runs an async function while displaying a simple spinner/loader in the console.
 * The spinner is cleared and replaced with a success/failure symbol on completion.
 */
export const withConsoleLoader = async <T>(fn: () => Promise<T>, options?: LoaderOptions): Promise<T> => {
    const message = options?.message ?? 'Working'
    const frames = options?.frames ?? ['|', '/', '-', '\\']
    const intervalMs = options?.intervalMs ?? 80
    const successSymbol = options?.successSymbol ?? '✓'
    const failureSymbol = options?.failureSymbol ?? '✗'

    let frameIndex = 0
    const isTTY = !!process.stdout.isTTY

    const render = (text: string): void => {
        if (!isTTY) {
            return
        }
        // Clear line and carriage return, then write
        process.stdout.write(`\r\u001b[2K${text}`)
    }

    if (isTTY) {
        render(`${message} ${frames[0]}`)
    } else {
        // Non-TTY fallback: single-line log at start
        process.stdout.write(`${message}...\n`)
    }

    const timer: NodeJS.Timeout = setInterval(() => {
        if (!isTTY) {
            return
        }
        frameIndex = (frameIndex + 1) % frames.length
        render(`${message} ${frames[frameIndex]}`)
    }, intervalMs)

    try {
        const result = await fn()
        clearInterval(timer)
        if (isTTY) {
            render(`${message} ${successSymbol}\n`)
        }
        return result
    } catch (error) {
        clearInterval(timer)
        if (isTTY) {
            render(`${message} ${failureSymbol}\n`)
        }
        throw error
    }
}
