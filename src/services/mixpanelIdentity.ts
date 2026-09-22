// src/services/mixpanelIdentity.ts
//
// One stable Mixpanel distinct_id per install, shared by the popup, every content script
// instance, and the background service worker via chrome.storage.local (extension-scoped,
// unlike page localStorage which is per-origin). background.js can't import this module
// (it isn't bundled), so it re-implements the same get-or-create logic inline.
const STORAGE_KEY = 'mixpanelDistinctId'

let cachedDistinctId: string | null = null

export async function getOrCreateDistinctId(): Promise<string> {
  if (cachedDistinctId) return cachedDistinctId

  const existing = await chrome.storage.local.get(STORAGE_KEY)
  const stored = existing[STORAGE_KEY]
  if (typeof stored === 'string' && stored) {
    cachedDistinctId = stored
    return stored
  }

  const id = crypto.randomUUID()
  cachedDistinctId = id
  await chrome.storage.local.set({ [STORAGE_KEY]: id })
  return id
}
