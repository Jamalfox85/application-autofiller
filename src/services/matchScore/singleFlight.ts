// One in-flight promise per key. The key is stored before `run` starts, so a
// second caller that arrives while the first is still on the stack joins the
// same promise instead of starting another request.

const inflight = new Map<string, Promise<unknown>>()

export interface SingleFlight<T> {
  leader: boolean
  result: Promise<T>
}

export function beginSingleFlight<T>(key: string, run: () => Promise<T>): SingleFlight<T> {
  const existing = inflight.get(key) as Promise<T> | undefined
  if (existing) return { leader: false, result: existing }
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const gate = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  inflight.set(key, gate)
  Promise.resolve()
    .then(run)
    .then(resolve, reject)
    .finally(() => {
      if (inflight.get(key) === gate) inflight.delete(key)
    })
  return { leader: true, result: gate }
}

export function resetSingleFlightForTests(): void {
  inflight.clear()
}
