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
import { supabase } from './supabase'
import type { Session } from '@supabase/supabase-js'

// Reads whatever session supabase-js currently holds. On the first call in a fresh context
// (e.g. the popup just opened) this awaits supabase-js's own initialization, which loads the
// session from chrome.storage.local and, if the access token has expired, silently refreshes
// it using the stored refresh token — no UI involved either way. If that refresh fails (token
// revoked, refresh token expired), supabase-js clears the stored session and this resolves to
// null, which is a signal to show the sign-in screen again.
//
// Later calls also re-read chrome.storage.local, so a session the service worker just wrote
// shows up without recreating this client.
export async function getStoredSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession()
  if (error) {
    console.error('Failed to read Supabase session:', error)
    return null
  }
  return data.session
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
