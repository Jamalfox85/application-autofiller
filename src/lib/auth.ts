// Google sign-in for the popup, backed by Supabase Auth.
//
// Chrome's chrome.identity.getAuthToken() only returns an OAuth *access* token, not a Google
// ID token (a signed JWT) — and Supabase's signInWithIdToken() requires the latter to verify
// the user server-side. To get an ID token we drive the OAuth implicit flow ourselves via
// chrome.identity.launchWebAuthFlow(), asking Google for response_type=id_token directly.
// See manifest.json's "oauth2" block for the client id/scopes this reads via
// chrome.runtime.getManifest().
//
// Session persistence, refresh, and clearing on failed refresh are handled by supabase-js
// itself (autoRefreshToken/persistSession in src/lib/supabase.ts) via the chrome.storage.local
// adapter configured there — this module just wraps the calls the popup needs and exposes
// sign-in/sign-out as explicit actions.
import { supabase } from './supabase'
import type { Session, User } from '@supabase/supabase-js'

const GOOGLE_OAUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

// Google echoes the (hashed) nonce into the ID token's `nonce` claim, and Supabase re-hashes
// the raw nonce we pass to signInWithIdToken() to check it matches — this is what stops a
// captured ID token from being replayed to sign in as someone else.
function randomNonce(): string {
  return crypto.randomUUID() + crypto.randomUUID()
}

async function buildGoogleAuthUrl(): Promise<{ url: string; nonce: string }> {
  const { oauth2 } = chrome.runtime.getManifest()
  if (!oauth2?.client_id) {
    throw new Error('manifest.json is missing an "oauth2.client_id" — see the Google Cloud OAuth client setup.')
  }

  const nonce = randomNonce()
  const hashedNonce = await sha256Hex(nonce)

  const url = new URL(GOOGLE_OAUTH_ENDPOINT)
  url.searchParams.set('client_id', oauth2.client_id)
  url.searchParams.set('response_type', 'id_token')
  url.searchParams.set('redirect_uri', chrome.identity.getRedirectURL())
  url.searchParams.set('scope', (oauth2.scopes ?? ['openid', 'email', 'profile']).join(' '))
  url.searchParams.set('nonce', hashedNonce)
  url.searchParams.set('prompt', 'select_account')

  return { url: url.toString(), nonce }
}

function launchWebAuthFlow(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url, interactive: true }, (redirectUrl) => {
      if (chrome.runtime.lastError || !redirectUrl) {
        reject(new Error(chrome.runtime.lastError?.message || 'Google sign-in was cancelled.'))
        return
      }
      resolve(redirectUrl)
    })
  })
}

function extractIdToken(redirectUrl: string): string {
  const params = new URLSearchParams(new URL(redirectUrl).hash.replace(/^#/, ''))
  const error = params.get('error')
  if (error) {
    throw new Error(`Google sign-in failed: ${error}`)
  }
  const idToken = params.get('id_token')
  if (!idToken) {
    throw new Error('Google did not return an ID token.')
  }
  return idToken
}

export interface AuthResult {
  session: Session
  user: User
}

// Triggers the native Google account picker, then exchanges the resulting ID token for a
// Supabase session. On success, Supabase creates the user record if this is their first
// sign-in. Throws with a user-facing message on cancellation or failure — callers show it.
export async function signInWithGoogle(): Promise<AuthResult> {
  const { url, nonce } = await buildGoogleAuthUrl()
  const redirectUrl = await launchWebAuthFlow(url)
  const idToken = extractIdToken(redirectUrl)

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
    nonce,
  })

  if (error || !data.session || !data.user) {
    throw new Error(error?.message || 'Sign-in failed. Please try again.')
  }

  return { session: data.session, user: data.user }
}

// Reads whatever session supabase-js currently holds. On the first call in a fresh context
// (e.g. the popup just opened) this awaits supabase-js's own initialization, which loads the
// session from chrome.storage.local and, if the access token has expired, silently refreshes
// it using the stored refresh token — no UI involved either way. If that refresh fails (token
// revoked, refresh token expired), supabase-js clears the stored session and this resolves to
// null, which is a signal to show the sign-in screen again.
export async function getStoredSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession()
  if (error) {
    console.error('Failed to read Supabase session:', error)
    return null
  }
  return data.session
}

// Fires on every auth transition: initial restore, silent refresh, and sign-out (explicit or
// due to a failed refresh). Returns an unsubscribe function.
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
