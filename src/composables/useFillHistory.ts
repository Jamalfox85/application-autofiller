import { ref } from 'vue'
import type { FillHistoryEntry } from '../types'
import { getUserIdOrNull, readMirror } from '../lib/sync/shared'
import { clearFillHistoryInDb, reconcileFillHistory, withFillHistoryLock } from '../lib/sync/fillHistory'

import { useProfiles } from './useProfiles'

const MIRROR_KEY = 'fillHistory'
const profilesState = useProfiles()

export function useFillHistory() {
  const fillHistory = ref<FillHistoryEntry[]>([])

  const loadFillHistory = async () => {
    const local = (await readMirror<FillHistoryEntry[]>(MIRROR_KEY)) ?? []
    const userId = await getUserIdOrNull()

    if (!userId) {
      fillHistory.value = local
      return
    }

    try {
      // Pushes any entries background.js appended locally that aren't in Supabase yet, and
      // returns the merged, newest-first list.
      // Rows stamped with a since-deleted profile go up with profile_id null (FK), keeping
      // the name snapshot. Before list_profiles has answered, no ids are filtered.
      const known = profilesState.loaded.value ? profilesState.profileIds.value : null
      // reconcileFillHistory rewrites the mirror itself, inside the fill-history lock.
      // Writing it again here raced with background.js appending the next fill.
      const merged = await reconcileFillHistory(userId, local, known)
      fillHistory.value = merged
    } catch (error) {
      console.error('Failed to sync fill history with Supabase — using local cache', error)
      fillHistory.value = local
    }
  }

  const clearFillHistory = async () => {
    // Hold the same lock as reconcile so a mirror rewrite cannot restore rows this clear
    // just removed. background.js must not take the lock itself: this call is already inside it.
    await withFillHistoryLock(async () => {
      await chrome.runtime.sendMessage({ action: 'clearFillHistory' })
      fillHistory.value = []

      const userId = await getUserIdOrNull()
      if (!userId) return
      try {
        await clearFillHistoryInDb(userId)
      } catch (error) {
        console.error('Failed to clear fill history in Supabase', error)
      }
    })
  }

  return {
    fillHistory,
    loadFillHistory,
    clearFillHistory,
  }
}
