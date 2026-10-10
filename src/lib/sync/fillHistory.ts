// Maps FillHistoryEntry <-> the Supabase `fill_history` table.
//
// Fill-history rows are appended by background.js (a plain, un-bundled service worker that
// can't use supabase-js), so it keeps writing to the chrome.storage.local mirror. The popup
// reconciles on load: pull remote, push any local rows not yet there, rewrite the mirror.
// Old rows are pruned server-side by a scheduled job and client-side (90d) by background.js.
// History is per account (cleared as a whole); each row records the profile used.
import { supabase } from '../supabase'
import { makeClientIds, readMirror, writeMirror } from './shared'
import { dedupeFillHistory, fillHistoryEntryKey } from './fillHistoryKey'
import type { FillHistoryEntry } from '../../types'

// Shared with background.js trackAutofill. The toolbar popup and a popup.html tab are separate
// pages, and the service worker appends rows; one exclusive lock covers all of them.
export const FILL_HISTORY_LOCK = 'gofillr-fill-history-reconcile'

const MIRROR_KEY = 'fillHistory'

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function fetchFillHistoryFromDb(userId: string): Promise<FillHistoryEntry[]> {
  const { data, error } = await supabase
    .from('fill_history')
    .select('*')
    .eq('user_id', userId)
    .order('occurred_at', { ascending: false })
  if (error) throw error

  const nextId = makeClientIds()
  const rows = (data ?? []).map((r: any) => ({
    id: nextId(),
    role: typeof r.role === 'string' ? r.role : '',
    site: typeof r.site === 'string' ? r.site : '',
    // A missing occurred_at must not become Date.now(): that key would change on every
    // read and the next reconcile would insert another row.
    timestamp: r.occurred_at ? new Date(r.occurred_at).getTime() : 0,
    filledCount: typeof r.filled_count === 'number' ? r.filled_count : 0,
    totalCount: typeof r.total_count === 'number' ? r.total_count : 0,
    profileId: typeof r.profile_id === 'string' ? r.profile_id : null,
    profileName: typeof r.profile_name === 'string' ? r.profile_name : null,
  }))
  // Rows already duplicated in the database (the migration that deletes them is not applied
  // yet) must not show up twice, and must not be inserted again.
  return dedupeFillHistory(rows)
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// profile_id is an FK (on delete set null). An entry stamped with a profile that has since
// been deleted would fail the whole insert, so ids not in `knownProfileIds` go up as null;
// the profile_name snapshot is kept either way.
export function fillHistoryRow(
  userId: string,
  e: FillHistoryEntry,
  knownProfileIds?: ReadonlySet<string> | null,
): Record<string, unknown> {
  const profileId = e.profileId && (!knownProfileIds || knownProfileIds.has(e.profileId)) ? e.profileId : null
  return {
    user_id: userId,
    role: e.role || null,
    site: e.site || null,
    occurred_at: new Date(e.timestamp).toISOString(),
    filled_count: e.filledCount,
    total_count: e.totalCount,
    profile_id: profileId,
    profile_name: e.profileName || null,
  }
}

export async function insertFillHistoryToDb(
  userId: string,
  entries: FillHistoryEntry[],
  knownProfileIds?: ReadonlySet<string> | null,
): Promise<void> {
  if (!entries.length) return
  const rows = dedupeFillHistory(entries).map((e) => fillHistoryRow(userId, e, knownProfileIds))
  const { error } = await supabase.from('fill_history').insert(rows)
  if (!error) return
  // 23505: a unique index on (user_id, occurred_at, site) rejected a row that is already
  // stored. The batch is one statement, so Postgres kept none of it. Retry row by row so
  // one duplicate does not drop the rest.
  if ((error as { code?: string }).code !== '23505') throw error
  for (const row of rows) {
    const { error: rowError } = await supabase.from('fill_history').insert(row)
    if (rowError && (rowError as { code?: string }).code !== '23505') throw rowError
  }
}

export async function clearFillHistoryInDb(userId: string): Promise<void> {
  const { error } = await supabase.from('fill_history').delete().eq('user_id', userId)
  if (error) throw error
}

export function withFillHistoryLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  if (!locks?.request) return fn()
  return locks.request(FILL_HISTORY_LOCK, () => fn())
}

// Merges local-only entries into the remote set (pushing them to the DB) and returns the
// unified, newest-first list.
// Reconciles run one at a time. The popup calls this from mount, after every fill, and from the
// auth watcher; two overlapping runs both saw the same "not stored yet" local rows and each
// inserted them, so every fill was stored twice with the same occurred_at.
let reconcileQueue: Promise<unknown> = Promise.resolve()

export function reconcileFillHistory(
  userId: string,
  local: FillHistoryEntry[],
  knownProfileIds?: ReadonlySet<string> | null,
): Promise<FillHistoryEntry[]> {
  const run = reconcileQueue.then(() => withFillHistoryLock(() => reconcileOnce(userId, local, knownProfileIds)))
  reconcileQueue = run.catch(() => undefined)
  return run
}

async function readLocalEntries(fallback: FillHistoryEntry[]): Promise<FillHistoryEntry[]> {
  try {
    const stored = await readMirror<FillHistoryEntry[]>(MIRROR_KEY)
    // [] is a real snapshot (history was just cleared). A missing key is one too: sign-out
    // removes it, and writing the caller's older snapshot back would put that account's
    // history on the device again. The fallback is only for a context with no storage API.
    if (Array.isArray(stored)) return stored
    return []
  } catch {
    return fallback
  }
}

async function reconcileOnce(
  userId: string,
  local: FillHistoryEntry[],
  knownProfileIds?: ReadonlySet<string> | null,
): Promise<FillHistoryEntry[]> {
  // Read inside the lock. The caller's snapshot can be from before background.js appended
  // the fill this reconcile is supposed to upload, and writing that snapshot back dropped it.
  const source = dedupeFillHistory(await readLocalEntries(local))
  const remote = await fetchFillHistoryFromDb(userId)
  const remoteKeys = new Set(remote.map(fillHistoryEntryKey))
  const unsynced = source.filter((entry) => !remoteKeys.has(fillHistoryEntryKey(entry)))

  if (unsynced.length) {
    await insertFillHistoryToDb(userId, unsynced, knownProfileIds)
  }

  const merged = dedupeFillHistory([...unsynced, ...remote]).sort((a, b) => b.timestamp - a.timestamp)
  try {
    await writeMirror(MIRROR_KEY, merged)
  } catch {
    // The database write already happened. The next reconcile rewrites the mirror.
  }
  return merged
}
