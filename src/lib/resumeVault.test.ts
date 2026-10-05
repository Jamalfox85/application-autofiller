import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  canonicalResumeObjectName,
  resumeStoragePath,
  savedResumeProfileRow,
  saveResumeToAccount,
  userIdFromAccessToken,
} from './resumeVault.ts'

const USER = '11c61a90-9bf2-47ed-b353-e5fdcacbcdb5'
const PROFILE = '7b0c1f4e-2d3a-4c5b-9e8f-0a1b2c3d4e5f'

function jwt(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `header.${body}.sig`
}

test('the storage object is the user and profile folder plus a canonical resume name', () => {
  assert.equal(canonicalResumeObjectName('Ada Lovelace.pdf', ''), 'resume.pdf')
  assert.equal(canonicalResumeObjectName('notes.DOCX', ''), 'resume.docx')
  assert.equal(canonicalResumeObjectName('blob', 'application/pdf'), 'resume.pdf')
  assert.equal(canonicalResumeObjectName('notes.txt', 'text/plain'), null)
  assert.equal(resumeStoragePath(USER, PROFILE, 'resume.pdf'), `${USER}/${PROFILE}/resume.pdf`)
})

test('the signed-in user id comes from the access token subject', () => {
  assert.equal(userIdFromAccessToken(jwt({ sub: USER })), USER)
  assert.equal(userIdFromAccessToken(jwt({ sub: 'not-a-user' })), null)
  assert.equal(userIdFromAccessToken('nope'), null)
})

test('saving a resume uploads to the profile folder and patches that candidate profile only', async () => {
  const calls: { url: string; init: RequestInit }[] = []
  const saved = await saveResumeToAccount({
    supabaseUrl: 'https://example.supabase.co/',
    anonKey: 'anon-key',
    accessToken: jwt({ sub: USER }),
    profileId: PROFILE,
    fileName: 'Ada.pdf',
    fileType: 'application/pdf',
    bytes: new Uint8Array([1, 2, 3]),
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} })
      if (String(url).includes('/storage/')) return new Response('{}', { status: 200 })
      if (init?.method === 'PATCH') return new Response(null, { status: 204 })
      return new Response(JSON.stringify([{ resume_file_path: `${USER}/${PROFILE}/resume.pdf` }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    },
  })

  assert.deepEqual(saved, {
    userId: USER,
    profileId: PROFILE,
    fileName: 'Ada.pdf',
    storagePath: `${USER}/${PROFILE}/resume.pdf`,
  })
  assert.equal(calls.length, 3)

  const upload = calls[0]
  assert.equal(
    upload.url,
    `https://example.supabase.co/storage/v1/object/resumes/${USER}/${PROFILE}/resume.pdf`,
  )
  const uploadHeaders = upload.init.headers as Record<string, string>
  assert.equal(uploadHeaders.Authorization, `Bearer ${jwt({ sub: USER })}`)
  assert.equal(uploadHeaders.apikey, 'anon-key')
  assert.equal(uploadHeaders['x-upsert'], 'true')
  assert.equal(upload.init.method, 'POST')

  const profile = calls[1]
  assert.equal(profile.url, `https://example.supabase.co/rest/v1/candidate_profiles?id=eq.${PROFILE}`)
  assert.equal(profile.init.method, 'PATCH')
  const row = JSON.parse(String(profile.init.body))
  assert.deepEqual(row, {
    resume_file_name: 'Ada.pdf',
    resume_file_path: `${USER}/${PROFILE}/resume.pdf`,
  })
  assert.equal('plan' in row, false)
  assert.ok(calls.every((call) => !call.url.includes('/rest/v1/profiles')))

  const read = calls[2]
  assert.equal(
    read.url,
    `https://example.supabase.co/rest/v1/candidate_profiles?id=eq.${PROFILE}&select=resume_file_path,resume_file_name`,
  )
  assert.equal(
    (read.init.headers as Record<string, string>).Authorization,
    uploadHeaders.Authorization,
  )
})

test('a profile write that does not echo the path (e.g. a locked profile) is not treated as saved', async () => {
  await assert.rejects(
    () =>
      saveResumeToAccount({
        supabaseUrl: 'https://example.supabase.co',
        anonKey: 'anon-key',
        accessToken: jwt({ sub: USER }),
        profileId: PROFILE,
        fileName: 'Ada.pdf',
        fileType: 'application/pdf',
        bytes: new Uint8Array([1]),
        fetchImpl: async (url) => {
          if (String(url).includes('/storage/')) return new Response('{}', { status: 200 })
          if (String(url).includes('select=')) return new Response(JSON.stringify([]), { status: 200 })
          return new Response(null, { status: 204 })
        },
      }),
    /Couldn't save your resume to your account/,
  )
})

test('an upload without a profile id is refused before anything is stored', async () => {
  let called = false
  await assert.rejects(
    () =>
      saveResumeToAccount({
        supabaseUrl: 'https://example.supabase.co',
        anonKey: 'anon-key',
        accessToken: jwt({ sub: USER }),
        profileId: '',
        fileName: 'Ada.pdf',
        fileType: 'application/pdf',
        bytes: new Uint8Array([1]),
        fetchImpl: async () => {
          called = true
          return new Response('{}', { status: 200 })
        },
      }),
    /reopen GoFillr/,
  )
  assert.equal(called, false)
})

test('profile sync reads the saved path back and does not null it when unset', () => {
  const profile = readFileSync('src/lib/sync/profileRows.ts', 'utf8')
  const write = profile.slice(
    profile.indexOf('export function profileToDbRows'),
    profile.indexOf('export function dbRowsToProfile'),
  )
  const read = profile.slice(
    profile.indexOf('export function dbRowsToProfile'),
    profile.indexOf('export function dbRowsToCustomResponses'),
  )
  assert.match(write, /info\.resumeFileName \? \{ resume_file_name: info\.resumeFileName \}/)
  assert.match(write, /info\.resumeFilePath \? \{ resume_file_path: info\.resumeFilePath \}/)
  assert.doesNotMatch(write, /resume_file_name: nullIfEmpty/)
  assert.match(read, /resumeFilePath: str\(p\.resume_file_path\)/)
  assert.equal(
    savedResumeProfileRow({
      userId: USER,
      profileId: PROFILE,
      fileName: 'Ada.pdf',
      storagePath: `${USER}/${PROFILE}/resume.pdf`,
    }).resume_file_path,
    `${USER}/${PROFILE}/resume.pdf`,
  )
})

test('the service worker saves the resume before it asks the parse API', () => {
  const background = readFileSync('background.js', 'utf8')
  const uploadFn = background.slice(
    background.indexOf('async function handleResumeUpload'),
    background.indexOf('chrome.runtime.onMessage.addListener'),
  )
  assert.match(uploadFn, /persistUploadedResume/)
  assert.ok(uploadFn.indexOf('persistUploadedResume') < uploadFn.indexOf('await fetch(url'))
  assert.match(uploadFn, /Authorization: `Bearer \$\{token\}`/)
  assert.match(uploadFn, /form\.append\('profile_id', profileId\)/)
  assert.match(uploadFn, /persistUploadedResume\(\{ token, profileId,/)
  assert.doesNotMatch(uploadFn, /\/resumes\/generate/)
})
