import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  bytesToBase64,
  savedResumeDisplayName,
  savedResumeMimeType,
  savedResumeObjectPath,
  savedResumeOwnedBy,
  supabaseAuthStorageKey,
} from './savedResumeFile.ts'

const userId = '11111111-1111-4111-8111-111111111111'

test('the stored resume path is the user folder plus one object name', () => {
  assert.equal(savedResumeObjectPath(`${userId}/resume.pdf`), `${userId}/resume.pdf`)
  assert.equal(savedResumeObjectPath(`/${userId}/resume.pdf`), `${userId}/resume.pdf`)
  assert.equal(savedResumeObjectPath(`${userId}/../secrets.pdf`), null)
  assert.equal(savedResumeObjectPath('resume.pdf'), null)
  assert.equal(savedResumeObjectPath(`${userId}/nested/resume.pdf`), null)
  assert.equal(savedResumeOwnedBy(`${userId}/resume.pdf`, userId), true)
  assert.equal(savedResumeOwnedBy(`${userId}/resume.pdf`, '22222222-2222-4222-8222-222222222222'), false)
})

test('Ashby is shown the original file name, with a type it accepts', () => {
  assert.equal(savedResumeDisplayName('Ada Lovelace.pdf', `${userId}/resume.pdf`), 'Ada Lovelace.pdf')
  assert.equal(savedResumeDisplayName('folder/Ada.docx', `${userId}/resume.docx`), 'Ada.docx')
  assert.equal(savedResumeDisplayName('', `${userId}/resume.pdf`), 'resume.pdf')
  assert.equal(savedResumeDisplayName('Ada', `${userId}/resume.pdf`), 'Ada.pdf')
  assert.equal(savedResumeMimeType('Ada Lovelace.pdf'), 'application/pdf')
  assert.equal(
    savedResumeMimeType('Ada.docx'),
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  )
  assert.equal(bytesToBase64(new Uint8Array([104, 105])), 'aGk=')
})

test('the auth storage key matches the supabase-js project ref', () => {
  assert.equal(
    supabaseAuthStorageKey('https://noxtfmasxlzgijwlreoz.supabase.co'),
    'sb-noxtfmasxlzgijwlreoz-auth-token',
  )
  assert.equal(supabaseAuthStorageKey('not a url'), null)
})

test('only the Ashby fill asks the worker for the saved resume', () => {
  const background = readFileSync(new URL('../../background.js', import.meta.url), 'utf8')
  const emit = readFileSync(new URL('../../scripts/emit-install-attribution.mjs', import.meta.url), 'utf8')
  const profile = readFileSync(new URL('../lib/sync/profile.ts', import.meta.url), 'utf8')
  const ashby = readFileSync(new URL('../utils/siteRules/ashby.ts', import.meta.url), 'utf8')
  assert.match(background, /readSavedResumeForFill/)
  assert.match(background, /action === 'readSavedResume'/)
  assert.match(emit, /src\/services\/savedResumeWorker\.ts/)
  assert.equal(profile.includes('resume_file_path'), false)
  assert.match(ashby, /loadSavedResumeFile/)
  assert.doesNotMatch(readFileSync(new URL('../utils/siteRules/lever.ts', import.meta.url), 'utf8'), /loadSavedResumeFile/)
  assert.doesNotMatch(readFileSync(new URL('../utils/siteRules/greenhouse.ts', import.meta.url), 'utf8'), /loadSavedResumeFile/)
  assert.doesNotMatch(readFileSync(new URL('../utils/siteRules/workday.ts', import.meta.url), 'utf8'), /loadSavedResumeFile/)
  assert.doesNotMatch(readFileSync(new URL('../utils/siteRules/icims.ts', import.meta.url), 'utf8'), /loadSavedResumeFile/)
  assert.doesNotMatch(readFileSync(new URL('../utils/siteRules/bamboohr.ts', import.meta.url), 'utf8'), /loadSavedResumeFile/)
  assert.doesNotMatch(readFileSync(new URL('../utils/siteRules/jobvite.ts', import.meta.url), 'utf8'), /loadSavedResumeFile/)
  assert.doesNotMatch(readFileSync(new URL('../utils/siteRules/workable.ts', import.meta.url), 'utf8'), /loadSavedResumeFile/)
})
