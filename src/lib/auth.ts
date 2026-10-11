// Supabase session helpers for the popup.
//
// Google sign-in does not run here. chrome.identity.launchWebAuthFlow() opens
// the account window, Chrome closes this popup, and a callback in this page
// dies with it — the flow is cancelled and chrome.storage.local never receives
// a session. The service worker owns launchWebAuthFlow + signInWithIdToken
// (src/services/googleSignInWorker.ts) and persists the session with the same
// chrome.storage.local adapter. The popup asks the worker to start, then reads
// the session back. getSession() re-reads that storage on every call.
//
// Refresh and clearing on a failed refresh stay with supabase-js
// (autoRefreshToken/persistSession below).
import type { Session } from '@supabase/supabase-js'
import { isRevokedRefreshTokenError, readPersistedSession } from './accessRecovery'
import { supabase } from './supabase'

// Reads whatever session supabase-js currently holds. On the first call in a fresh context
// (e.g. the popup just opened) this awaits supabase-js's own initialization, which loads the
// session from chrome.storage.local and, if the access token has expired, refreshes it
// using the stored refresh token. A refresh that fails because another context just rotated
// the refresh token, or because the network blipped, must not look like sign-out while the
// token is still in storage. Only a revoked refresh token (which supabase-js removes) does.
//
// Later calls also re-read chrome.storage.local, so a session the service worker just wrote
// shows up without recreating this client.
export async function getStoredSession(): Promise<Session | null> {
  try {
    const { data, error } = await supabase.auth.getSession()
    if (data.session?.access_token) return data.session
    if (error && isRevokedRefreshTokenError(error)) return null
    if (error) console.error('Failed to read Supabase session:', error)
  } catch (error) {
    if (isRevokedRefreshTokenError(error)) return null
    console.error('Failed to read Supabase session:', error)
  }
  const persisted = await readPersistedSession()
  if (!persisted || typeof persisted.access_token !== 'string') return null
  return persisted as unknown as Session
}

// Fires on every auth transition: initial restore, silent refresh, and sign-out (explicit or
// due to a failed refresh). Returns an unsubscribe function. It does not fire when another
// extension context writes the session; the popup listens for that storage write itself.
export function onAuthStateChanged(callback: (session: Session | null) => void): () => void {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => callback(session))
  return () => subscription.unsubscribe()
}

// auth-js clears the local session (and emits SIGNED_OUT) before it attempts to revoke the
// refresh token server-side, so the caller's UI can drop to the sign-in state immediately —
// this still resolves even if the network call fails (e.g. offline, already-revoked token).
export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) {
    console.error('Supabase sign-out request failed (session was already cleared locally):', error)
  }
}
