// Shared helpers for the Supabase <-> chrome.storage.local sync layer.
//
// Model: Supabase is the source of truth for profile data, custom responses, and fill
// history. chrome.storage.local keeps a *mirror* of each so the content script (and the
// popup, when offline) can keep reading synchronously without a Supabase round-trip. The
// popup refreshes the mirror on load and rewrites it on every save.
import { supabase } from '../supabase'

// Reads the signed-in user's id from the locally-cached session (no network call). Returns
// null when there's no session — callers then fall back to the local mirror only.
export async function getUserIdOrNull(): Promise<string | null> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    return session?.user?.id ?? null
  } catch {
    return null
  }
}

export async function writeMirror(key: string, value: unknown): Promise<void> {
  await chrome.storage.local.set({ [key]: JSON.parse(JSON.stringify(value)) })
}

export async function readMirror<T>(key: string): Promise<T | undefined> {
  const data = await chrome.storage.local.get(key)
  return data[key] as T | undefined
}

// Replaces every row this user owns in `table` with `rows` (delete-all then insert). Used for
// the child tables (work_experience, education, skills, ...) where entries have no stable id
// that survives a round-trip — the whole collection is rewritten on each save. Not atomic; a
// failure after the delete throws and leaves the table empty for this user, but the local
// mirror still holds the data and the next save retries.
export async function replaceUserRows(
  table: string,
  userId: string,
  rows: Record<string, unknown>[],
): Promise<void> {
  const del = await supabase.from(table).delete().eq('user_id', userId)
  if (del.error) throw del.error

  if (rows.length > 0) {
    const ins = await supabase.from(table).insert(rows)
    if (ins.error) throw ins.error
  }
}

// Child-entry ids in the app are `number`s used only as Vue :keys and for in-session
// add/edit/remove tracking — they don't need to be stable across reloads. This hands back a
// fresh monotonic id per row read from the DB.
export function makeClientIds(): () => number {
  let next = Date.now()
  return () => next++
}
