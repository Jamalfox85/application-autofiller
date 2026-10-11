import { isSupabaseAuthStorageKey } from './googleAuth.ts'

export type StoredSessionAction = 'reread' | 'ignore'

// The service worker clears the Supabase session key when a refresh token is rejected.
// onAuthStateChange does not cross extension contexts, so the popup has to notice the
// removal itself and show sign-in. A clear is re-read rather than applied immediately:
// a refresh rotation can remove the key and write the new session a moment later, and
// treating the gap as sign-out left the popup signed out while the token was still
// in storage. A new session while already signed in is ignored; a write while signed
// out is re-read.
export function storedSessionAction(
  status: 'loading' | 'signed-in' | 'signed-out',
  changes: Record<string, { newValue?: unknown } | undefined>,
): StoredSessionAction {
  let cleared = false
  let wrote = false
  for (const [key, change] of Object.entries(changes)) {
    if (!change || !isSupabaseAuthStorageKey(key)) continue
    if (change.newValue == null) cleared = true
    else wrote = true
  }
  if (cleared) return status === 'signed-out' ? 'ignore' : 'reread'
  if (status === 'signed-in') return 'ignore'
  return wrote ? 'reread' : 'ignore'
}
