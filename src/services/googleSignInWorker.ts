// Google sign-in for the background service worker.
//
// An extension popup is destroyed the moment it loses focus. launchWebAuthFlow
// opens the Google account window, Chrome closes the popup, and a callback
// that lived in the popup is cancelled before signInWithIdToken can run — so
// chrome.storage.local never gets a Supabase session. This module runs both
// steps here, where the identity API keeps the worker alive until the window
// closes. The popup only sends { action: 'signInWithGoogle' }.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { chromeLocalStorage } from '../lib/chromeLocalStorage.ts'
import {
  createAuthFlowGate,
  exchangeGoogleIdToken,
  friendlyAuthError,
  runGoogleSignIn,
} from '../lib/googleAuth.ts'
import { supabasePublicConfigError } from '../lib/supabaseConfig.ts'

const gate = createAuthFlowGate()

let client: SupabaseClient | null = null

function workerSupabase(): SupabaseClient {
  if (client) return client

  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  const configError = supabasePublicConfigError(url, anonKey)
  if (configError || !url || !anonKey) {
    throw new Error(
      configError ?? "Sign-in isn't set up correctly on this build. Please contact support.",
    )
  }

  // autoRefreshToken stays off so this client does not rotate the refresh
  // token out from under the popup. skipAutoInitialize avoids reading (and
  // possibly rewriting) a session the popup already owns. persistSession still
  // writes signInWithIdToken's session to chrome.storage.local.
  client = createClient(url, anonKey, {
    auth: {
      storage: chromeLocalStorage,
      autoRefreshToken: false,
      persistSession: true,
      detectSessionInUrl: false,
      skipAutoInitialize: true,
    },
  })
  return client
}

function launchWebAuthFlow(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url, interactive: true }, (redirectUrl) => {
      if (chrome.runtime.lastError || !redirectUrl) {
        reject(new Error(friendlyAuthError(chrome.runtime.lastError?.message)))
        return
      }
      resolve(redirectUrl)
    })
  })
}

export async function signInWithGoogleInWorker(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const { oauth2 } = chrome.runtime.getManifest()
  const result = await runGoogleSignIn({
    gate,
    clientId: oauth2?.client_id,
    scopes: oauth2?.scopes,
    redirectUri: chrome.identity.getRedirectURL(),
    launch: launchWebAuthFlow,
    exchange: (idToken, nonce) => exchangeGoogleIdToken(workerSupabase(), idToken, nonce),
  })
  if (!result.ok) console.error('[google-sign-in]', result.error)
  return result
}
