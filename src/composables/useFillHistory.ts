import { ref } from 'vue'
import type { FillHistoryEntry } from '../types'
import { getUserIdOrNull, readMirror } from '../lib/sync/shared'
import {
  bumpFillHistoryGeneration,
  clearFillHistoryInDb,
  fillHistoryGeneration,
  reconcileFillHistory,
  withFillHistoryLock,
} from '../lib/sync/fillHistory'
import { fillHistoryFromStorageChange } from '../lib/sync/fillHistoryWrite'
import { onMirrorReset } from '../lib/sync/mirrorEpoch'
import { useProfiles } from './useProfiles'

const MIRROR_KEY = 'fillHistory'
const profilesState = useProfiles()

// One list for the whole extension page. App.vue ("No fills yet") and History used to
// each keep their own ref, so a toast fill that updated storage never moved the view
// that was already open.
const fillHistory = ref<FillHistoryEntry[]>([])

let watching = false
// Bumped on every storage-driven list update so loadFillHistory cannot assign a
// snapshot it read before background.js appended the toast fill.
let storageRevision = 0
let refreshQueued = false

function dropFillHistoryMemory() {
  storageRevision += 1
  bumpFillHistoryGeneration()
  fillHistory.value = []
}

function watchFillHistoryStorage() {
  if (watching || typeof chrome === 'undefined' || !chrome.storage?.onChanged) return
  watching = true
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !Object.prototype.hasOwnProperty.call(changes, MIRROR_KEY)) return
    const update = fillHistoryFromStorageChange(changes[MIRROR_KEY].newValue)
    if (update === 'cleared') {
      dropFillHistoryMemory()
      return
    }
    // background.js appends the counted fill here. History is already mounted on the
    // popup.html tab, so replace the list instead of waiting for the next open.
    storageRevision += 1
    fillHistory.value = update
    // An empty write is a clear. Reconciling it would pull the database copy back
    // before that delete finishes. A non-empty write is a counted fill: push it once.
    if (update.length === 0 || refreshQueued) return
    refreshQueued = true
    void loadFillHistory().finally(() => {
      refreshQueued = false
    })
  })
}

watchFillHistoryStorage()
onMirrorReset(dropFillHistoryMemory)

async function readStoredHistory(): Promise<FillHistoryEntry[] | null | undefined> {
  try {
    const stored = await readMirror<FillHistoryEntry[]>(MIRROR_KEY)
    if (Array.isArray(stored)) return stored
    return null
  } catch {
    return undefined
  }
}

async function loadFillHistory() {
  watchFillHistoryStorage()
  const generation = fillHistoryGeneration()
  const userId = await getUserIdOrNull()
  if (generation !== fillHistoryGeneration()) return

  if (!userId) {
    const stored = await readStoredHistory()
    if (generation !== fillHistoryGeneration()) return
    fillHistory.value = Array.isArray(stored) ? stored : []
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
    await reconcileFillHistory(userId, known)
  } catch (error) {
    console.error('Failed to sync fill history with Supabase — using local cache', error)
  }

  if (generation !== fillHistoryGeneration()) return
  // Storage wins over the list reconcile returned. A toast fill can append after that
  // return; assigning the older list here is what left History on "No fills yet".
  const revision = storageRevision
  const fresh = await readStoredHistory()
  if (generation !== fillHistoryGeneration() || revision !== storageRevision) return
  if (Array.isArray(fresh)) fillHistory.value = fresh
  else if (fresh === null) fillHistory.value = []
}

export function useFillHistory() {
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
