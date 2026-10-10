// Resolve with `fallback` if `work` has not settled in `ms`. The work itself keeps running; the
// caller just stops waiting for it. Used so slow analytics or billing calls cannot hold back the
// "Autofill completed" toast.
export function withTimeout<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms)
    work.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      () => {
        clearTimeout(timer)
        resolve(fallback)
      },
    )
  })
}
