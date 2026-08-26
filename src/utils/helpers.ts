export function normalizeText(text: string): string {
  return text.replace(/\s+/g, '').toLowerCase()
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Polls for an element on a fixed interval, resolving null if it never appears.
export function waitForElement<T extends Element>(
  selector: string,
  retries = 20,
  intervalMs = 300,
): Promise<T | null> {
  return new Promise((resolve) => {
    const check = (remaining: number) => {
      const el = document.querySelector<T>(selector)
      if (el) return resolve(el)
      if (remaining <= 0) return resolve(null)
      setTimeout(() => check(remaining - 1), intervalMs)
    }
    check(retries)
  })
}
