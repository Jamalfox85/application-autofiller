// src/lib/api.ts
//
// Helpers for talking to the Go resume API. The upload request itself runs in the background
// service worker (see background.js + src/composables/useResumeUpload.ts) so a closing popup
// can't abort the 5–10s parse; this module only provides the access token and the response
// normalizer they share.
//
// The old Railway API (autofiller-api-dev.up.railway.app) has been retired — its usage/
// checkout/billing endpoints and the components that called them (Settings.vue,
// UpgradeModal.vue) were removed with it.
import { supabase } from './supabase'

// Returns a currently-valid Supabase access token, refreshing it first if it's expired (or
// about to be). Throws if there's no session — callers must surface "sign in again" rather
// than let an `Authorization: Bearer null` go out and come back 401.
export async function getValidAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error('Not signed in')
  }

  const expiresAtMs = session.expires_at ? session.expires_at * 1000 : 0
  if (expiresAtMs && expiresAtMs - Date.now() < 60_000) {
    const { data, error } = await supabase.auth.refreshSession()
    if (error || !data.session?.access_token) {
      throw new Error('Your session has expired. Please sign in again.')
    }
    return data.session.access_token
  }

  return session.access_token
}

export { normalizeParsedResume } from './parsedResume'
