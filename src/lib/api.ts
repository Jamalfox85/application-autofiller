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
import {
  accessTokenNeedsRefresh,
  refreshSessionIfExpiring,
} from './accessRecovery.ts'
import { supabase } from './supabase'

// Returns a currently-valid Supabase access token. Refreshes first when expires_at
// is inside five minutes (or already past), which covers a service worker that slept
// through supabase-js's auto-refresh timer. A revoked refresh token signs the user
// out inside refreshSessionIfExpiring. A network failure keeps the current token
// when it has not expired yet. Throws if there's no session — callers must surface
// "sign in again" rather than send `Authorization: Bearer null`.
export async function getValidAccessToken(): Promise<string> {
  const early = await refreshSessionIfExpiring()
  if (early?.ok) return early.token
  if (early && !early.transient) {
    throw new Error('Your session has expired. Please sign in again.')
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (session?.access_token && !accessTokenNeedsRefresh(session.expires_at)) {
    return session.access_token
  }
  if (!session?.access_token) {
    throw new Error('Not signed in')
  }
  return session.access_token
}

export { normalizeParsedResume } from './parsedResume'
