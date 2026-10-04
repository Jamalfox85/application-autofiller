import assert from 'node:assert/strict'
import test from 'node:test'
import {
  authStorageKeyForUrl,
  bytesToBase64,
  cacheIsUsable,
  resumeStorageObjectUrl,
  resolveSavedResume,
  userIdFromAccessToken,
  type ResumeByteSource,
  type SavedResumeCache,
  type StoredAuthSession,
} from './savedResumeFile.ts'

const NOW = Date.parse('2026-10-04T12:00:00Z')
const CONFIG = { supabaseUrl: 'https://example.supabase.co', anonKey: 'anon-key', now: NOW }

function jwt(sub: string): string {
  const payload = Buffer.from(JSON.stringify({ sub })).toString('base64url')
  return `e30.${payload}.sig`
}

function session(userId = 'user-1', expiresAt = Math.floor(NOW / 1000) + 3600): StoredAuthSession {
  const accessToken = jwt(userId)
  return {
    storageKey: 'sb-example-auth-token',
    accessToken,
    refreshToken: `refresh-${userId}`,
    expiresAt,
    userId,
    raw: { access_token: accessToken, refresh_token: `refresh-${userId}`, user: { id: userId } },
  }
}

function cache(partial: Partial<SavedResumeCache> = {}): SavedResumeCache {
  return {
    userId: 'user-1',
    fileName: 'ada.pdf',
    fileType: 'application/pdf',
    bytesBase64: bytesToBase64(new Uint8Array([1, 2, 3])),
    storagePath: 'user-1/file.pdf',
    updatedAt: 1,
    ...partial,
  }
}

function source(overrides: Partial<ResumeByteSource> = {}): ResumeByteSource {
  return {
    readCache: async () => null,
    writeCache: async () => {},
    readSession: async () => session(),
    writeSession: async () => {},
    fetchBytes: async () => ({
      ok: true,
      status: 200,
      bytes: new Uint8Array([9, 9]),
      contentType: 'application/pdf',
    }),
    fetchJson: async () => ({ ok: true, status: 200, json: [] }),
    ...overrides,
  }
}

test('a saved resume is the cached upload when the name, user, and path still match', async () => {
  let fetched = 0
  const result = await resolveSavedResume(
    { resumeFileName: 'ada.pdf', resumeFilePath: 'user-1/file.pdf' },
    source({
      readCache: async () => cache(),
      fetchBytes: async () => {
        fetched += 1
        throw new Error('cache hit should not download')
      },
    }),
    CONFIG,
  )
  assert.equal(fetched, 0)
  assert.equal(result?.name, 'ada.pdf')
  assert.equal(result?.type, 'application/pdf')
  assert.deepEqual(result?.bytes, new Uint8Array([1, 2, 3]))
})

test('no filename means there is nothing to attach', async () => {
  const result = await resolveSavedResume(
    { resumeFileName: '  ' },
    source({
      readCache: async () => {
        throw new Error('should not read')
      },
    }),
    CONFIG,
  )
  assert.equal(result, null)
})

test('a signed-in user with no local bytes downloads profiles.resume_file_path', async () => {
  const writes: SavedResumeCache[] = []
  const urls: string[] = []
  const result = await resolveSavedResume(
    { resumeFileName: 'ada-lovelace-resume.pdf', resumeFilePath: '' },
    source({
      fetchJson: async (url) => {
        urls.push(url)
        return { ok: true, status: 200, json: [{ resume_file_path: 'user-1/obj.pdf' }] }
      },
      fetchBytes: async (url) => {
        urls.push(url)
        return { ok: true, status: 200, bytes: new Uint8Array([4, 5]), contentType: 'application/pdf' }
      },
      writeCache: async (record) => {
        writes.push(record)
      },
    }),
    CONFIG,
  )
  assert.equal(result?.name, 'ada-lovelace-resume.pdf')
  assert.deepEqual(result?.bytes, new Uint8Array([4, 5]))
  assert.equal(writes.length, 1)
  assert.equal(writes[0].storagePath, 'user-1/obj.pdf')
  assert.equal(writes[0].userId, 'user-1')
  assert.ok(urls.some((url) => url.includes('/rest/v1/profiles')))
  assert.ok(urls.some((url) => url.endsWith('/storage/v1/object/resumes/user-1/obj.pdf')))
})

test('a stale cache for another user or another object is not attached', async () => {
  const downloaded: string[] = []
  const result = await resolveSavedResume(
    { resumeFileName: 'ada.pdf', resumeFilePath: 'user-1/new.pdf' },
    source({
      readCache: async () => cache({ storagePath: 'user-1/old.pdf', userId: 'user-2' }),
      fetchBytes: async (url) => {
        downloaded.push(url)
        return { ok: true, status: 200, bytes: new Uint8Array([7]), contentType: 'application/pdf' }
      },
    }),
    CONFIG,
  )
  assert.equal(downloaded.length, 1)
  assert.deepEqual(result?.bytes, new Uint8Array([7]))
  assert.equal(cacheIsUsable(cache({ userId: 'someone-else' }), { fileName: 'ada.pdf', userId: 'user-1' }), false)
  assert.equal(cacheIsUsable(null, { fileName: 'ada.pdf' }), false)
})

test('an expired session is refreshed before the download', async () => {
  const calls: string[] = []
  const result = await resolveSavedResume(
    { resumeFileName: 'ada.pdf', resumeFilePath: 'user-1/file.pdf' },
    source({
      readSession: async () => session('user-1', Math.floor(NOW / 1000) - 10),
      fetchJson: async (url) => {
        calls.push(url)
        return {
          ok: true,
          status: 200,
          json: { access_token: jwt('user-1'), refresh_token: 'next', expires_in: 3600, user: { id: 'user-1' } },
        }
      },
      fetchBytes: async (url) => {
        calls.push(url)
        return { ok: true, status: 200, bytes: new Uint8Array([8]), contentType: null }
      },
    }),
    CONFIG,
  )
  assert.equal(result?.type, 'application/pdf')
  assert.equal(calls[0]?.includes('/auth/v1/token'), true)
  assert.equal(calls[1]?.includes('/storage/v1/object/resumes/'), true)
})

test('a 401 retries once with a refreshed token and then skips when the object is missing', async () => {
  let downloads = 0
  const missing = await resolveSavedResume(
    { resumeFileName: 'ada.pdf', resumeFilePath: 'user-1/gone.pdf' },
    source({
      fetchBytes: async () => {
        downloads += 1
        return { ok: false, status: downloads === 1 ? 401 : 404, bytes: new Uint8Array(), contentType: null }
      },
      fetchJson: async () => ({
        ok: true,
        status: 200,
        json: { access_token: jwt('user-1'), refresh_token: 'next', expires_in: 3600 },
      }),
    }),
    CONFIG,
  )
  assert.equal(missing, null)
  assert.equal(downloads, 2)
})

test('without a session, only a matching local cache can attach', async () => {
  const cached = await resolveSavedResume(
    { resumeFileName: 'ada.pdf' },
    source({
      readCache: async () => cache(),
      readSession: async () => null,
      fetchBytes: async () => {
        throw new Error('offline cache should not download')
      },
    }),
    { ...CONFIG, supabaseUrl: '', anonKey: '' },
  )
  assert.deepEqual(cached?.bytes, new Uint8Array([1, 2, 3]))

  const missing = await resolveSavedResume(
    { resumeFileName: 'ada.pdf', resumeFilePath: 'user-1/file.pdf' },
    source({ readCache: async () => null, readSession: async () => null }),
    CONFIG,
  )
  assert.equal(missing, null)
})

test('storage urls encode each path segment', () => {
  assert.equal(
    resumeStorageObjectUrl('https://example.supabase.co/', 'user 1/my resume.pdf'),
    'https://example.supabase.co/storage/v1/object/resumes/user%201/my%20resume.pdf',
  )
  assert.equal(authStorageKeyForUrl('https://example.supabase.co'), 'sb-example-auth-token')
  assert.equal(userIdFromAccessToken(jwt('user-1')), 'user-1')
  assert.equal(userIdFromAccessToken('not-a-jwt'), '')
})
