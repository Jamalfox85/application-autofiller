// Google ID-token sign-in helpers shared by the service worker and unit tests.
//
// chrome.identity.getAuthToken() only returns an OAuth access token. Supabase
// signInWithIdToken() needs a Google ID token, so we drive the implicit flow
// ourselves (response_type=id_token). The worker calls launchWebAuthFlow; this
// module stays free of chrome.* so the token and error mapping can be tested
// in Node.

const GOOGLE_OAUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'

const DEFAULT_SCOPES = ['openid', 'email', 'profile']

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

// Google echoes the (hashed) nonce into the ID token's `nonce` claim, and
// Supabase re-hashes the raw nonce we pass to signInWithIdToken() to check it
// matches — this is what stops a captured ID token from being replayed.
export function randomNonce(): string {
  return crypto.randomUUID() + crypto.randomUUID()
}

export async function buildGoogleAuthUrl(input: {
  clientId: string | undefined
  scopes?: readonly string[]
  redirectUri: string
  nonce?: string
}): Promise<{ url: string; nonce: string }> {
  if (!input.clientId) {
    throw new Error(
      'manifest.json is missing an "oauth2.client_id" — see the Google Cloud OAuth client setup.',
    )
  }

  const nonce = input.nonce ?? randomNonce()
  const hashedNonce = await sha256Hex(nonce)
  const url = new URL(GOOGLE_OAUTH_ENDPOINT)
  url.searchParams.set('client_id', input.clientId)
  url.searchParams.set('response_type', 'id_token')
  url.searchParams.set('redirect_uri', input.redirectUri)
  url.searchParams.set('scope', (input.scopes ?? DEFAULT_SCOPES).join(' '))
  url.searchParams.set('nonce', hashedNonce)
  url.searchParams.set('prompt', 'select_account')

  return { url: url.toString(), nonce }
}

// chrome.identity and Google return terse internal strings ("Only one web auth
// flow is allowed at a time.", "The user did not approve access.",
// "access_denied", ...). Map the ones a user can actually trigger to something
// they can act on; pass anything unrecognized through so we don't hide a real bug.
export function friendlyAuthError(raw: string | undefined | null): string {
  const message = (raw ?? '').trim()

  if (/only one web auth flow/i.test(message)) {
    return 'A sign-in window is already open. Close it, wait a few seconds, then try again.'
  }
  if (
    /did not approve|closed the window|user cancell?ed|access_denied|interaction required/i.test(
      message,
    )
  ) {
    return 'Sign-in was cancelled.'
  }
  if (/authorization page could not be loaded|network|failed to fetch|offline/i.test(message)) {
    return "Couldn't reach Google. Check your connection and try again."
  }
  if (
    /redirect_uri_mismatch|invalid_client|client.*not found|deleted_client|unauthorized_client/i.test(
      message,
    )
  ) {
    return "Sign-in isn't set up correctly on this build. Please contact support."
  }
  return message || 'Google sign-in failed. Please try again.'
}

export function friendlySupabaseAuthError(raw: string | undefined | null): string {
  const detail = (raw ?? '').trim()
  if (/failed to fetch|networkerror|load failed/i.test(detail)) {
    return "Couldn't reach the sign-in server. Check your connection and try again."
  }
  if (/provider is not enabled|unsupported provider/i.test(detail)) {
    return "Google sign-in isn't enabled for this project yet."
  }
  if (/nonce/i.test(detail)) {
    return 'Sign-in expired before it completed. Please try again.'
  }
  if (/audience|invalid.*token|bad_jwt/i.test(detail)) {
    return "Sign-in isn't set up correctly on this build. Please contact support."
  }
  return detail || 'Sign-in failed. Please try again.'
}

export function extractIdToken(redirectUrl: string): string {
  const params = new URLSearchParams(new URL(redirectUrl).hash.replace(/^#/, ''))
  const error = params.get('error')
  if (error) {
    throw new Error(friendlyAuthError(error))
  }
  const idToken = params.get('id_token')
  if (!idToken) {
    throw new Error('Google did not return an ID token.')
  }
  return idToken
}

// supabase-js persists the session at `sb-<project-ref>-auth-token`. The
// code-verifier and split-user keys share that prefix but are not the session.
export function isSupabaseAuthStorageKey(key: string): boolean {
  return /^sb-.+-auth-token$/.test(key)
}

export interface GoogleIdTokenClient {
  auth: {
    signInWithIdToken(credentials: {
      provider: 'google'
      token: string
      nonce: string
    }): Promise<{
      data: { session: unknown; user: unknown }
      error: { message: string } | null
    }>
  }
}

export async function exchangeGoogleIdToken(
  client: GoogleIdTokenClient,
  idToken: string,
  nonce: string,
): Promise<void> {
  const { data, error } = await client.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
    nonce,
  })
  if (error || !data.session || !data.user) {
    throw new Error(friendlySupabaseAuthError(error?.message))
  }
}

export function createAuthFlowGate() {
  let inFlight = false
  return {
    tryEnter(): string | null {
      if (inFlight) {
        return friendlyAuthError('Only one web auth flow is allowed at a time.')
      }
      inFlight = true
      return null
    },
    leave() {
      inFlight = false
    },
  }
}

export async function runGoogleSignIn(deps: {
  gate: ReturnType<typeof createAuthFlowGate>
  clientId: string | undefined
  scopes?: readonly string[]
  redirectUri: string
  launch: (url: string) => Promise<string>
  exchange: (idToken: string, nonce: string) => Promise<void>
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const blocked = deps.gate.tryEnter()
  if (blocked) return { ok: false, error: blocked }

  try {
    const { url, nonce } = await buildGoogleAuthUrl({
      clientId: deps.clientId,
      scopes: deps.scopes,
      redirectUri: deps.redirectUri,
    })
    const redirectUrl = await deps.launch(url)
    const idToken = extractIdToken(redirectUrl)
    await deps.exchange(idToken, nonce)
    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sign-in failed. Please try again.'
    return { ok: false, error: message }
  } finally {
    deps.gate.leave()
  }
}
