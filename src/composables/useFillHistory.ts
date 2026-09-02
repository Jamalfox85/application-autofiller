import { ref } from 'vue'
import type { FillHistoryEntry } from '../types'
import { getUserIdOrNull, readMirror, writeMirror } from '../lib/sync/shared'
import { clearFillHistoryInDb, reconcileFillHistory } from '../lib/sync/fillHistory'

const MIRROR_KEY = 'fillHistory'

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
      const merged = await reconcileFillHistory(userId, local)
      fillHistory.value = merged
      await writeMirror(MIRROR_KEY, merged)
    } catch (error) {
      console.error('Failed to sync fill history with Supabase — using local cache', error)
      fillHistory.value = local
    }
  }

  const clearFillHistory = async () => {
    // Clears the local mirror (via background.js, which owns that key).
    await chrome.runtime.sendMessage({ action: 'clearFillHistory' })
    fillHistory.value = []

    const userId = await getUserIdOrNull()
    if (userId) {
      try {
        await clearFillHistoryInDb(userId)
      } catch (error) {
        console.error('Failed to clear fill history in Supabase', error)
      }
    }
  }

  return {
    fillHistory,
    loadFillHistory,
    clearFillHistory,
  }
}
