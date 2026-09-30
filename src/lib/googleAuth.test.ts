import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildGoogleAuthUrl,
  createAuthFlowGate,
  exchangeGoogleIdToken,
  extractIdToken,
  friendlyAuthError,
  friendlySupabaseAuthError,
  isSupabaseAuthStorageKey,
  runGoogleSignIn,
  sha256Hex,
} from './googleAuth.ts'

test('friendlyAuthError maps the chrome single-flight and cancel strings', () => {
  assert.equal(
    friendlyAuthError('Only one web auth flow is allowed at a time.'),
    'A sign-in window is already open. Close it, wait a few seconds, then try again.',
  )
  assert.equal(friendlyAuthError('The user did not approve access.'), 'Sign-in was cancelled.')
  assert.equal(friendlyAuthError('access_denied'), 'Sign-in was cancelled.')
  assert.equal(
    friendlyAuthError('Authorization page could not be loaded.'),
    "Couldn't reach Google. Check your connection and try again.",
  )
  assert.equal(
    friendlyAuthError('redirect_uri_mismatch'),
    "Sign-in isn't set up correctly on this build. Please contact support.",
  )
  assert.equal(friendlyAuthError('something unexpected'), 'something unexpected')
  assert.equal(friendlyAuthError(''), 'Google sign-in failed. Please try again.')
  assert.equal(friendlyAuthError(null), 'Google sign-in failed. Please try again.')
})

test('friendlySupabaseAuthError maps nonce, network, and setup failures', () => {
  assert.equal(
    friendlySupabaseAuthError('Nonce mismatch'),
    'Sign-in expired before it completed. Please try again.',
  )
  assert.equal(
    friendlySupabaseAuthError('Failed to fetch'),
    "Couldn't reach the sign-in server. Check your connection and try again.",
  )
  assert.equal(
    friendlySupabaseAuthError('provider is not enabled'),
    "Google sign-in isn't enabled for this project yet.",
  )
  assert.equal(
    friendlySupabaseAuthError('invalid token'),
    "Sign-in isn't set up correctly on this build. Please contact support.",
  )
  assert.equal(friendlySupabaseAuthError(''), 'Sign-in failed. Please try again.')
})

test('extractIdToken reads the implicit-flow hash and maps Google errors', () => {
  const redirect = `https://abcdefghijklmnop.chromiumapp.org/#${new URLSearchParams({
    id_token: 'header.payload.sig',
    token_type: 'Bearer',
  }).toString()}`
  assert.equal(extractIdToken(redirect), 'header.payload.sig')

  assert.throws(
    () => extractIdToken('https://abcdefghijklmnop.chromiumapp.org/#error=access_denied'),
    /Sign-in was cancelled/,
  )
  assert.throws(
    () => extractIdToken('https://abcdefghijklmnop.chromiumapp.org/#'),
    /Google did not return an ID token/,
  )
})

test('buildGoogleAuthUrl sends a hashed nonce and asks for an ID token', async () => {
  const nonce = 'raw-nonce-value'
  const { url, nonce: returned } = await buildGoogleAuthUrl({
    clientId: 'client.apps.googleusercontent.com',
    scopes: ['openid', 'email', 'profile'],
    redirectUri: 'https://abcdefghijklmnop.chromiumapp.org/',
    nonce,
  })
  const parsed = new URL(url)
  assert.equal(returned, nonce)
  assert.equal(parsed.origin + parsed.pathname, 'https://accounts.google.com/o/oauth2/v2/auth')
  assert.equal(parsed.searchParams.get('response_type'), 'id_token')
  assert.equal(parsed.searchParams.get('prompt'), 'select_account')
  assert.equal(parsed.searchParams.get('client_id'), 'client.apps.googleusercontent.com')
  assert.equal(parsed.searchParams.get('redirect_uri'), 'https://abcdefghijklmnop.chromiumapp.org/')
  assert.equal(parsed.searchParams.get('scope'), 'openid email profile')
  assert.equal(parsed.searchParams.get('nonce'), await sha256Hex(nonce))
  assert.notEqual(parsed.searchParams.get('nonce'), nonce)
})

test('buildGoogleAuthUrl refuses a build with no oauth client id', async () => {
  await assert.rejects(
    () => buildGoogleAuthUrl({ clientId: undefined, redirectUri: 'https://ext.chromiumapp.org/' }),
    /oauth2\.client_id/,
  )
})

test('isSupabaseAuthStorageKey matches only the session slot', () => {
  assert.equal(isSupabaseAuthStorageKey('sb-abcdefgh-auth-token'), true)
  assert.equal(isSupabaseAuthStorageKey('sb-abcdefgh-auth-token-code-verifier'), false)
  assert.equal(isSupabaseAuthStorageKey('sb-abcdefgh-auth-token-user'), false)
  assert.equal(isSupabaseAuthStorageKey('personalInfo'), false)
})

test('exchangeGoogleIdToken forwards the raw nonce and maps Supabase errors', async () => {
  let seen: unknown
  await exchangeGoogleIdToken(
    {
      auth: {
        async signInWithIdToken(credentials) {
          seen = credentials
          return { data: { session: { access_token: 'a' }, user: { id: 'u' } }, error: null }
        },
      },
    },
    'header.payload.sig',
    'raw-nonce',
  )
  assert.deepEqual(seen, { provider: 'google', token: 'header.payload.sig', nonce: 'raw-nonce' })

  await assert.rejects(
    () =>
      exchangeGoogleIdToken(
        {
          auth: {
            async signInWithIdToken() {
              return { data: { session: null, user: null }, error: { message: 'Nonce mismatch' } }
            },
          },
        },
        'header.payload.sig',
        'raw-nonce',
      ),
    /Sign-in expired before it completed/,
  )
})

test('a second sign-in gets the single-flight message while the first launch is open', async () => {
  const gate = createAuthFlowGate()
  let launches = 0
  let releaseLaunch: (redirectUrl: string) => void = () => {}
  const launchHeld = new Promise<string>((resolve) => {
    releaseLaunch = resolve
  })

  const deps = {
    gate,
    clientId: 'client.apps.googleusercontent.com',
    redirectUri: 'https://abcdefghijklmnop.chromiumapp.org/',
    launch: async (url: string) => {
      launches += 1
      const parsed = new URL(url)
      assert.equal(parsed.searchParams.get('response_type'), 'id_token')
      return launchHeld
    },
    exchange: async (idToken: string, nonce: string) => {
      assert.equal(idToken, 'header.payload.sig')
      assert.ok(nonce.length > 0)
    },
  }

  const first = runGoogleSignIn(deps)
  const second = await runGoogleSignIn(deps)
  assert.equal(second.ok, false)
  if (!second.ok) {
    assert.equal(
      second.error,
      'A sign-in window is already open. Close it, wait a few seconds, then try again.',
    )
  }

  releaseLaunch('https://abcdefghijklmnop.chromiumapp.org/#id_token=header.payload.sig')
  const finished = await first
  assert.deepEqual(finished, { ok: true })
  assert.equal(launches, 1)

  const third = await runGoogleSignIn({
    ...deps,
    launch: async () => {
      launches += 1
      return 'https://abcdefghijklmnop.chromiumapp.org/#id_token=header.payload.sig'
    },
  })
  assert.deepEqual(third, { ok: true })
  assert.equal(launches, 2)
})

test('a cancelled launch releases the gate so the next attempt can run', async () => {
  const gate = createAuthFlowGate()
  let exchanged = false
  const cancelled = await runGoogleSignIn({
    gate,
    clientId: 'client.apps.googleusercontent.com',
    redirectUri: 'https://abcdefghijklmnop.chromiumapp.org/',
    launch: async () => {
      throw new Error(friendlyAuthError('The user did not approve access.'))
    },
    exchange: async () => {
      exchanged = true
    },
  })
  assert.deepEqual(cancelled, { ok: false, error: 'Sign-in was cancelled.' })
  assert.equal(exchanged, false)

  const retried = await runGoogleSignIn({
    gate,
    clientId: 'client.apps.googleusercontent.com',
    redirectUri: 'https://abcdefghijklmnop.chromiumapp.org/',
    launch: async () => 'https://abcdefghijklmnop.chromiumapp.org/#id_token=header.payload.sig',
    exchange: async () => {
      exchanged = true
    },
  })
  assert.deepEqual(retried, { ok: true })
  assert.equal(exchanged, true)
})
