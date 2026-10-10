// Maps FillHistoryEntry <-> the Supabase `fill_history` table.
//
// Fill-history rows are appended by background.js (a plain, un-bundled service worker that
// can't use supabase-js), so it keeps writing to the chrome.storage.local mirror. The popup
// reconciles on load: pull remote, push any local rows not yet there, rewrite the mirror.
// Old rows are pruned server-side by a scheduled job and client-side (90d) by background.js.
// History is per account (cleared as a whole); each row records the profile used.
import { supabase } from '../supabase'
import { getUserIdOrNull, makeClientIds, readMirror, writeMirror } from './shared'
import { dedupeFillHistory, fillHistoryEntryKey } from './fillHistoryKey'
import { fillHistoryMirrorUnchanged, mergeFillHistoryForWrite } from './fillHistoryWrite'
import { mirrorEpoch } from './mirrorEpoch'
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
//
// The local list is always re-read inside the lock. Callers do not pass their Vue ref: that
// ref survives chrome.storage.local.clear() and sign-out, and writing it back pushed the
// previous account's history on the next sign-in.
let reconcileQueue: Promise<unknown> = Promise.resolve()

// Bumped when the mirror is cleared or the account changes, so a reconcile that already
// read the old list does not insert or write it.
let generation = 0

export function bumpFillHistoryGeneration(): void {
  generation += 1
}

export function fillHistoryGeneration(): number {
  return generation
}

export function reconcileFillHistory(
  userId: string,
  knownProfileIds?: ReadonlySet<string> | null,
): Promise<FillHistoryEntry[]> {
  const run = reconcileQueue.then(() => withFillHistoryLock(() => reconcileOnce(userId, knownProfileIds)))
  reconcileQueue = run.catch(() => undefined)
  return run
}

// null: the key is absent (sign-out removed it, or this profile has no mirror yet).
// undefined: storage could not be read — do not invent a list and do not write one.
async function readFillHistoryMirror(): Promise<FillHistoryEntry[] | null | undefined> {
  try {
    const stored = await readMirror<FillHistoryEntry[]>(MIRROR_KEY)
    if (Array.isArray(stored)) return stored
    return null
  } catch {
    return undefined
  }
}

async function stillThisAccount(
  userId: string,
  epochAtStart: number,
  generationAtStart: number,
): Promise<boolean> {
  if (epochAtStart !== mirrorEpoch() || generationAtStart !== generation) return false
  return (await getUserIdOrNull()) === userId
}

async function reconcileOnce(
  userId: string,
  knownProfileIds?: ReadonlySet<string> | null,
): Promise<FillHistoryEntry[]> {
  const epochAtStart = mirrorEpoch()
  const generationAtStart = generation
  const owns = () => stillThisAccount(userId, epochAtStart, generationAtStart)

  // Read inside the lock. A snapshot from before background.js appended the fill would
  // drop that row when written back. A snapshot from before a clear would restore it.
  const first = await readFillHistoryMirror()
  if (first === undefined || !(await owns())) return []

  const remote = await fetchFillHistoryFromDb(userId)
  if (!(await owns())) return []

  const latest = await readFillHistoryMirror()
  if (latest === undefined || !(await owns())) return []

  const plan = mergeFillHistoryForWrite(first, remote, latest, true)
  if (!plan.write) return []

  const remoteKeys = new Set(remote.map(fillHistoryEntryKey))
  const unsynced = plan.entries.filter((entry) => !remoteKeys.has(fillHistoryEntryKey(entry)))
  if (unsynced.length) {
    if (!(await owns())) return []
    await insertFillHistoryToDb(userId, unsynced, knownProfileIds)
  }

  // A toast fill can land while the insert is in flight when the lock is not shared
  // with the service worker. Pick it up so the mirror write does not erase it.
  const after = await readFillHistoryMirror()
  if (after === undefined || !(await owns())) return []
  const known = dedupeFillHistory([...remote, ...unsynced])
  const finalPlan = mergeFillHistoryForWrite(first, known, after, true)
  if (!finalPlan.write || !(await owns())) return []

  const knownKeys = new Set(known.map(fillHistoryEntryKey))
  const extras = finalPlan.entries.filter((entry) => !knownKeys.has(fillHistoryEntryKey(entry)))
  if (extras.length) {
    if (!(await owns())) return []
    await insertFillHistoryToDb(userId, extras, knownProfileIds)
  }

  const finalRead = await readFillHistoryMirror()
  if (finalRead === undefined || !(await owns())) return []
  const publish = mergeFillHistoryForWrite(
    first,
    dedupeFillHistory([...known, ...extras]),
    finalRead,
    true,
  )
  if (!publish.write) return []
  if (fillHistoryMirrorUnchanged(finalRead, publish.entries)) return publish.entries

  try {
    await writeMirror(MIRROR_KEY, publish.entries)
  } catch {
    // The database write already happened. The next reconcile rewrites the mirror.
  }
  return publish.entries
}
