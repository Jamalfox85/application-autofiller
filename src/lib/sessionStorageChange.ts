import { isSupabaseAuthStorageKey } from './googleAuth.ts'

export type StoredSessionAction = 'sign-out' | 'reread' | 'ignore'

// The service worker clears the Supabase session key when a refresh token is rejected.
// onAuthStateChange does not cross extension contexts, so the popup has to notice the
// removal itself and show sign-in. A new session while already signed in is ignored
// here; a write while signed out is re-read.
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
  if (cleared) return status === 'signed-out' ? 'ignore' : 'sign-out'
  if (status === 'signed-in') return 'ignore'
  return wrote ? 'reread' : 'ignore'
}
