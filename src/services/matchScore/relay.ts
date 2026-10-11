const DEFAULT_ATTEMPTS = 40
const DEFAULT_DELAY_MS = 100

function defaultWait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// The job frame can finish scoring before the top document's listener exists.
// A dropped send leaves the card hidden, so keep trying for a few seconds.
export async function deliverToTopFrame(
  send: () => Promise<unknown>,
  wait: (ms: number) => Promise<void> = defaultWait,
  attempts = DEFAULT_ATTEMPTS,
  delayMs = DEFAULT_DELAY_MS,
): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await send()
      return true
    } catch {
      if (attempt === attempts - 1) return false
      await wait(delayMs)
    }
  }
  return false
}
