// Maps FillHistoryEntry <-> the Supabase `fill_history` table.
//
// Fill-history rows are appended by background.js (a plain, un-bundled service worker that
// can't use supabase-js), so it keeps writing to the chrome.storage.local mirror. The popup
// reconciles on load: pull remote, push any local rows not yet there, rewrite the mirror.
// Old rows are pruned server-side by a scheduled job and client-side (90d) by background.js.
import { supabase } from '../supabase'
import { makeClientIds } from './shared'
import type { FillHistoryEntry } from '../../types'

// timestamp (ms) + site uniquely identifies an entry well enough for de-duping.
const entryKey = (e: { timestamp: number; site: string }) => `${e.timestamp}|${e.site}`

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function fetchFillHistoryFromDb(userId: string): Promise<FillHistoryEntry[]> {
  const { data, error } = await supabase
    .from('fill_history')
    .select('*')
    .eq('user_id', userId)
    .order('occurred_at', { ascending: false })
  if (error) throw error

  const nextId = makeClientIds()
  return (data ?? []).map((r: any) => ({
    id: nextId(),
    role: typeof r.role === 'string' ? r.role : '',
    site: typeof r.site === 'string' ? r.site : '',
    timestamp: r.occurred_at ? new Date(r.occurred_at).getTime() : Date.now(),
    filledCount: typeof r.filled_count === 'number' ? r.filled_count : 0,
    totalCount: typeof r.total_count === 'number' ? r.total_count : 0,
  }))
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function insertFillHistoryToDb(
  userId: string,
  entries: FillHistoryEntry[],
): Promise<void> {
  if (!entries.length) return
  const { error } = await supabase.from('fill_history').insert(
    entries.map((e) => ({
      user_id: userId,
      role: e.role || null,
      site: e.site || null,
      occurred_at: new Date(e.timestamp).toISOString(),
      filled_count: e.filledCount,
      total_count: e.totalCount,
    })),
  )
  if (error) throw error
}

export async function clearFillHistoryInDb(userId: string): Promise<void> {
  const { error } = await supabase.from('fill_history').delete().eq('user_id', userId)
  if (error) throw error
}

// Merges local-only entries into the remote set (pushing them to the DB) and returns the
// unified, newest-first list. Pure-ish apart from the insert side effect.
export async function reconcileFillHistory(
  userId: string,
  local: FillHistoryEntry[],
): Promise<FillHistoryEntry[]> {
  const remote = await fetchFillHistoryFromDb(userId)
  const remoteKeys = new Set(remote.map(entryKey))
  const unsynced = local.filter((e) => !remoteKeys.has(entryKey(e)))

  if (unsynced.length) {
    await insertFillHistoryToDb(userId, unsynced)
  }

  return [...unsynced, ...remote].sort((a, b) => b.timestamp - a.timestamp)
}
