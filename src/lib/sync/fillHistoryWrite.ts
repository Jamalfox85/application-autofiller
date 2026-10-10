// Pure decisions for fill-history reconcile. The popup must not write an in-memory
// list back to chrome.storage.local: background.js is the only appender, and a stale
// page can otherwise resurrect rows that sign-out or a storage clear just removed.
import { dedupeFillHistory, fillHistoryEntryKey } from './fillHistoryKey.ts'
import type { FillHistoryEntry } from '../../types/index.ts'

// `null` means the storage key is absent. An array, including [], is a real snapshot.
// `commit` is false when the signed-in user or the page generation changed mid-flight.
export function mergeFillHistoryForWrite(
  first: FillHistoryEntry[] | null,
  remote: FillHistoryEntry[],
  latest: FillHistoryEntry[] | null,
  commit: boolean,
): { entries: FillHistoryEntry[]; write: boolean } {
  if (!commit) return { entries: [], write: false }
  // Had local rows, then the key disappeared: clear or sign-out. Do not write them back.
  if (latest === null && first !== null) return { entries: [], write: false }

  const local = latest ?? []
  const remoteKeys = new Set(remote.map(fillHistoryEntryKey))
  const unsynced = local.filter((entry) => !remoteKeys.has(fillHistoryEntryKey(entry)))
  const entries = dedupeFillHistory([...unsynced, ...remote]).sort(
    (a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0),
  )
  // A missing key and nothing on the server: leave the key absent.
  if (latest === null && entries.length === 0) return { entries: [], write: false }
  return { entries, write: true }
}

export function fillHistoryMirrorUnchanged(
  stored: FillHistoryEntry[] | null,
  next: FillHistoryEntry[],
): boolean {
  if (!stored || stored.length !== next.length) return false
  for (let i = 0; i < stored.length; i++) {
    if (fillHistoryEntryKey(stored[i]) !== fillHistoryEntryKey(next[i])) return false
    if ((stored[i].filledCount ?? 0) !== (next[i].filledCount ?? 0)) return false
    if ((stored[i].totalCount ?? 0) !== (next[i].totalCount ?? 0)) return false
    if ((stored[i].role ?? '') !== (next[i].role ?? '')) return false
  }
  return true
}

// Storage listener: an array replaces the in-memory list (so History updates while
// the page stays open). Anything else — the key was removed — drops that list.
export function fillHistoryFromStorageChange(newValue: unknown): FillHistoryEntry[] | 'cleared' {
  if (!Array.isArray(newValue)) return 'cleared'
  return newValue as FillHistoryEntry[]
}
