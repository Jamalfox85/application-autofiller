import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  parseStoredSession,
  readSavedResume,
  resumeObjectPath,
  supabaseAuthStorageKey,
} from './savedResume.ts'

const USER = '11111111-1111-4111-8111-111111111111'
const URL = 'https://noxtfmasxlzgijwlreoz.supabase.co'
const NOW = 1_700_000_000_000

function session(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    access_token: 'tok',
    expires_at: Math.floor(NOW / 1000) + 3600,
    user: { id: USER },
    ...overrides,
  })
}

test('auth storage key is the supabase-js project key', () => {
  assert.equal(supabaseAuthStorageKey(URL), 'sb-noxtfmasxlzgijwlreoz-auth-token')
  assert.equal(supabaseAuthStorageKey('not a url'), null)
})

test('resume object path stays inside the signed-in user folder', () => {
  assert.equal(resumeObjectPath(USER, `${USER}/resume.pdf`), `${USER}/resume.pdf`)
  assert.equal(resumeObjectPath(USER, `/${USER}/My Resume.pdf`), `${USER}/My Resume.pdf`)
  assert.equal(resumeObjectPath(USER, `${USER}/nested/resume.pdf`), null)
  assert.equal(resumeObjectPath(USER, `${USER}/../secret.pdf`), null)
  assert.equal(resumeObjectPath(USER, 'someone-else/resume.pdf'), null)
  assert.equal(resumeObjectPath('not-a-uuid', `${USER}/resume.pdf`), null)
})

test('expired or unreadable sessions are not used', () => {
  assert.equal(parseStoredSession('nope', NOW), null)
  assert.equal(
    parseStoredSession(session({ expires_at: Math.floor(NOW / 1000) - 5 }), NOW),
    null,
  )
  assert.deepEqual(parseStoredSession(session(), NOW), { accessToken: 'tok', userId: USER })
})

test('readSavedResume downloads the stored file under its original name', async () => {
  const calls: { url: string; authorization: string; apikey: string }[] = []
  const saved = await readSavedResume({
    supabaseUrl: URL,
    anonKey: 'anon',
    now: NOW,
    readStorageItem: async () => session(),
    fetchImpl: async (input, init) => {
      const url = String(input)
      const headers = new Headers(init?.headers)
      calls.push({
        url,
        authorization: headers.get('authorization') || '',
        apikey: headers.get('apikey') || '',
      })
      if (url.includes('/rest/v1/profiles')) {
        return new Response(
          JSON.stringify([
            {
              resume_file_path: `${USER}/resume.pdf`,
              resume_file_name: 'Ada Lovelace.pdf',
            },
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      return new Response(new Uint8Array([37, 80, 68, 70]), {
        status: 200,
        headers: { 'content-type': 'application/pdf; charset=binary' },
      })
    },
  })

  assert.equal(calls.length, 2)
  assert.equal(calls[0].authorization, 'Bearer tok')
  assert.equal(calls[0].apikey, 'anon')
  assert.match(calls[0].url, new RegExp(`id=eq\\.${USER}`))
  assert.equal(
    calls[1].url,
    `${URL}/storage/v1/object/resumes/${USER}/resume.pdf`,
  )
  assert.ok(saved)
  assert.equal(saved.name, 'Ada Lovelace.pdf')
  assert.equal(saved.mimeType, 'application/pdf')
  assert.deepEqual(Array.from(saved.bytes), [37, 80, 68, 70])
})

test('a path outside the user folder is not downloaded', async () => {
  let storageHits = 0
  const saved = await readSavedResume({
    supabaseUrl: URL,
    anonKey: 'anon',
    now: NOW,
    readStorageItem: async () => session(),
    fetchImpl: async (input) => {
      const url = String(input)
      if (url.includes('/storage/')) storageHits += 1
      return new Response(
        JSON.stringify([{ resume_file_path: 'other-user/resume.pdf', resume_file_name: 'x.pdf' }]),
        { status: 200 },
      )
    },
  })
  assert.equal(saved, null)
  assert.equal(storageHits, 0)
})
