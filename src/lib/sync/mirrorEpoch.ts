// Generation for popup mirrors (fill history, profile, custom responses).
//
// An open extension page keeps those lists in memory. After sign-out, an account
// change, or chrome.storage.local.clear(), a save or reconcile that is still running
// must not write that memory back — the next sign-in would treat it as the new
// account's data and push it to the database.

type Reset = () => void

const resets = new Set<Reset>()
let epoch = 0
let userId: string | null = null

export function mirrorEpoch(): number {
  return epoch
}

export function mirrorUserId(): string | null {
  return userId
}

export function onMirrorReset(reset: Reset): void {
  resets.add(reset)
}

// `nextUserId` null is sign-out. The first sign-in on this page (null -> id) records
// the id and does not fire resets: there is no previous account in memory. Leaving
// an account, or switching from one id to another, bumps the epoch and drops memory.
export function noteMirrorUser(nextUserId: string | null): void {
  if (nextUserId === userId) return
  const previous = userId
  userId = nextUserId
  if (previous === null && nextUserId !== null) return
  epoch += 1
  for (const reset of resets) {
    try {
      reset()
    } catch (error) {
      console.error('[mirror] reset failed', error)
    }
  }
}
