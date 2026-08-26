// src/services/mixpanelIdentity.ts
//
// One stable Mixpanel distinct_id per install, shared by the popup, every content script
// instance, and the background service worker via chrome.storage.local (extension-scoped,
// unlike page localStorage which is per-origin). background.js can't import this module
// (it isn't bundled), so it re-implements the same get-or-create logic inline.
const STORAGE_KEY = 'mixpanelDistinctId'

export async function getOrCreateDistinctId(): Promise<string> {
  const existing = await chrome.storage.local.get(STORAGE_KEY)
  if (existing[STORAGE_KEY]) {
    return existing[STORAGE_KEY]
  }

  const id = crypto.randomUUID()
  await chrome.storage.local.set({ [STORAGE_KEY]: id })
  return id
}
