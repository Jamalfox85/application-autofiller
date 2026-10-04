import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import { cloneDefaultPersonalInfo } from '../../lib/personalInfoDefaults.ts'
import bambooHrConfig, { setBambooResumeLoader } from './bamboohr.ts'
import {
  assignResumeFile,
  bambooUploadRole,
  describeBambooUpload,
  isBambooCountryControl,
  pickBambooCountryOption,
} from './bamboohrFields.ts'
import { fileFromSavedResumeMessage, loadSavedResumeFile } from './bamboohrResume.ts'

const require = createRequire(import.meta.url)
const FileListIdl = require('jsdom/lib/generated/idl/FileList.js')
const idlUtils = require('jsdom/lib/generated/idl/utils.js')

// jsdom has no DataTransfer. This stand-in builds a real FileList so the
// production assignment path can set input.files the same way Chrome does.
function installDataTransfer(window: JSDOM['window'] & Window) {
  if (typeof window.DataTransfer === 'function') return
  window.DataTransfer = class DataTransfer {
    _files: File[]
    constructor() {
      this._files = []
    }
    get items() {
      return {
        add: (file: File) => {
          this._files.push(file)
        },
      }
    }
    get files() {
      const list = FileListIdl.create(window, [], {})
      const impl = idlUtils.implForWrapper(list)
      for (const file of this._files) impl.push(idlUtils.implForWrapper(file))
      return list
    }
  } as unknown as typeof DataTransfer
}

const COUNTRIES = [
  'United States',
  'Canada',
  'Norway',
  'United Arab Emirates',
  'United Kingdom',
  'US Minor Outlying Islands',
]

test('chooses United States when Norway is also listed and is the current value', () => {
  assert.equal(pickBambooCountryOption(COUNTRIES, 'Norway', 'united_states'), 'United States')
  assert.equal(pickBambooCountryOption(COUNTRIES, 'Norway', 'United States'), 'United States')
  assert.equal(pickBambooCountryOption(COUNTRIES, '161', 'united_states'), 'United States')
})

test('a blank profile country does not replace the posting default', () => {
  assert.equal(pickBambooCountryOption(COUNTRIES, 'Norway', ''), null)
  assert.equal(pickBambooCountryOption(COUNTRIES, 'United States', '   '), null)
  assert.equal(pickBambooCountryOption(COUNTRIES, 'Norway', null), null)
})

test('does not choose a nearby United option when United States is absent', () => {
  const withoutUs = COUNTRIES.filter((country) => country !== 'United States')
  assert.equal(pickBambooCountryOption(withoutUs, 'Norway', 'united_states'), null)
})

const SUPABASE_URL = 'https://example.supabase.co'
const ANON_KEY = 'test-anon-key'
const USER_ID = '11111111-1111-1111-1111-111111111111'

function storedSession(expiresAt = 9_999_999_999) {
  return JSON.stringify({
    access_token: 'access-token',
    expires_at: expiresAt,
    user: { id: USER_ID },
  })
}

test('only the countryId select is the country control', () => {
  assert.equal(
    isBambooCountryControl({ name: 'countryId.value', id: 'fab-select346', type: 'select-one' }),
    true,
  )
  assert.equal(
    isBambooCountryControl({ name: 'state.value', id: 'fab-select345', type: 'select-one' }),
    false,
  )
  assert.equal(
    isBambooCountryControl({ name: 'state.value', id: 'FabricTextField-344', type: 'text' }),
    false,
  )
  assert.equal(
    isBambooCountryControl({
      name: 'educationInstitutionName',
      id: 'educationInstitutionName',
      type: 'text',
    }),
    false,
  )
})

test('resume, upload, and choose-file controls are the resume input; cover letter and autofill are not', () => {
  assert.equal(
    bambooUploadRole({ tagName: 'INPUT', type: 'file', name: 'resume', label: 'Resume' }),
    'resume',
  )
  assert.equal(bambooUploadRole({ tagName: 'INPUT', type: 'file', label: 'Upload' }), 'resume')
  assert.equal(
    bambooUploadRole({ tagName: 'INPUT', type: 'file', label: 'Choose file' }),
    'resume',
  )
  assert.equal(
    bambooUploadRole({
      tagName: 'INPUT',
      type: 'file',
      name: 'coverLetter',
      label: 'Cover Letter Choose file',
    }),
    'cover',
  )
  assert.equal(
    bambooUploadRole({ tagName: 'INPUT', type: 'file', label: 'Autofill with resume' }),
    'autofill',
  )
  assert.equal(
    bambooUploadRole({ tagName: 'BUTTON', type: 'button', text: 'Autofill with resume' }),
    'autofill',
  )
  assert.equal(
    bambooUploadRole({ tagName: 'INPUT', type: 'button', text: 'Auto-fill from resume' }),
    'autofill',
  )
  assert.equal(
    bambooUploadRole({ tagName: 'INPUT', type: 'file', label: 'Please upload your transcript' }),
    'other',
  )
})

test('a saved resume is assigned to the BambooHR resume file input only', async () => {
  const savedBytes = new TextEncoder().encode('%PDF saved resume bytes')
  const calls: string[] = []
  const saved = await loadSavedResumeFile({
    supabaseUrl: SUPABASE_URL,
    anonKey: ANON_KEY,
    nowMs: 1_700_000_000_000,
    readStorage: async () => storedSession(),
    fetchImpl: async (url) => {
      calls.push(url)
      if (url.includes('/rest/v1/profiles')) {
        return new Response(
          JSON.stringify([
            { resume_file_path: `${USER_ID}/resume.pdf`, resume_file_name: 'ada-lovelace.pdf' },
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      assert.equal(
        url,
        `${SUPABASE_URL}/storage/v1/object/authenticated/resumes/${USER_ID}/resume.pdf`,
      )
      return new Response(savedBytes, { status: 200, headers: { 'content-type': 'application/pdf' } })
    },
  })
  assert.ok(saved)
  assert.equal(saved.name, 'ada-lovelace.pdf')
  assert.equal(saved.size, savedBytes.byteLength)
  assert.equal(saved.type, 'application/pdf')
  const delivered = fileFromSavedResumeMessage({
    ok: true,
    fileName: saved.name,
    mimeType: saved.type,
    bytes: new Uint8Array(await saved.arrayBuffer()),
  })
  assert.ok(delivered)
  assert.equal(delivered.name, 'ada-lovelace.pdf')
  assert.equal(new TextDecoder().decode(await delivered.arrayBuffer()), '%PDF saved resume bytes')
  assert.equal(fileFromSavedResumeMessage({ ok: false }), null)
  assert.deepEqual(calls, [
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(USER_ID)}&select=resume_file_path,resume_file_name`,
    `${SUPABASE_URL}/storage/v1/object/authenticated/resumes/${USER_ID}/resume.pdf`,
  ])

  const dom = new JSDOM(`<!doctype html><body>
    <form>
      <label for="resume">Resume</label>
      <input id="resume" name="resume" type="file" />

      <label for="cover">Cover Letter <span>Choose file</span></label>
      <input id="cover" name="coverLetter" type="file" />

      <label for="upload">Upload</label>
      <input id="upload" type="file" />

      <div>
        <span>Choose file</span>
        <input id="choose" type="file" />
      </div>

      <label for="transcript">Please upload your transcript</label>
      <input id="transcript" type="file" />

      <button type="button" id="autofill">Autofill with resume</button>
      <input type="button" id="autofill-input" value="Autofill with resume" />

      <label for="college">College/University</label>
      <input id="college" name="educationInstitutionName" type="text" />

      <label for="gender">Gender</label>
      <select id="gender" name="gender"><option value="">Select</option></select>
    </form>
  </body>`)
  const window = dom.window
  installDataTransfer(window as JSDOM['window'] & Window)
  const doc = window.document
  const clicks: string[] = []
  for (const id of ['autofill', 'autofill-input', 'cover', 'transcript', 'college', 'gender']) {
    doc.getElementById(id)?.addEventListener('click', () => clicks.push(id))
  }

  setBambooResumeLoader(async () => delivered)
  try {
    const rule = bambooHrConfig()
    const info = cloneDefaultPersonalInfo()
    info.firstName = 'Ada'
    info.lastName = 'Lovelace'
    info.country = 'united_states'
    info.education = []

    const resume = doc.getElementById('resume') as HTMLInputElement
    const cover = doc.getElementById('cover') as HTMLInputElement
    const upload = doc.getElementById('upload') as HTMLInputElement
    const choose = doc.getElementById('choose') as HTMLInputElement
    const transcript = doc.getElementById('transcript') as HTMLInputElement
    const college = doc.getElementById('college') as HTMLInputElement
    const gender = doc.getElementById('gender') as HTMLSelectElement

    assert.equal(await rule.apply(resume, '', info), true)
    assert.equal(await rule.apply(upload, '', info), true)
    assert.equal(await rule.apply(choose, '', info), true)
    assert.equal(await rule.apply(cover, '', info), 'skip')
    assert.equal(await rule.apply(transcript, '', info), false)
    assert.equal(await rule.apply(doc.getElementById('autofill') as HTMLInputElement, '', info), 'skip')
    assert.equal(await rule.apply(doc.getElementById('autofill-input') as HTMLInputElement, '', info), 'skip')
    assert.equal(await rule.apply(college, '', info), false)

    const assigned = resume.files?.[0]
    assert.ok(assigned)
    assert.equal(assigned.name, 'ada-lovelace.pdf')
    assert.equal(assigned.size, savedBytes.byteLength)
    assert.equal(new TextDecoder().decode(await assigned.arrayBuffer()), '%PDF saved resume bytes')
    assert.equal(resume.value, 'C:\\fakepath\\ada-lovelace.pdf')

    for (const extra of [upload, choose]) {
      assert.equal(extra.files?.[0]?.name, 'ada-lovelace.pdf')
      assert.equal(extra.files?.[0]?.size, savedBytes.byteLength)
    }

    assert.equal(cover.files?.length ?? 0, 0)
    assert.equal(cover.value, '')
    assert.equal(transcript.files?.length ?? 0, 0)
    assert.equal(college.value, '')
    assert.equal(gender.value, '')
    assert.deepEqual(clicks, [])
    assert.equal(describeBambooUpload(doc.getElementById('autofill')!).tagName, 'BUTTON')
  } finally {
    setBambooResumeLoader(null)
  }
})

test('the service worker downloads the saved resume for the content script', () => {
  const background = readFileSync(new URL('../../../background.js', import.meta.url), 'utf8')
  const emit = readFileSync(new URL('../../../scripts/emit-install-attribution.mjs', import.meta.url), 'utf8')
  assert.equal(background.includes("request.action === 'loadSavedResume'"), true)
  assert.equal(background.includes('loadSavedResumeForWorker'), true)
  assert.equal(background.includes('./src/utils/siteRules/bamboohrResumeWorker.js'), true)
  assert.equal(emit.includes('src/utils/siteRules/bamboohrResumeWorker.ts'), true)
  const resumeModule = readFileSync(new URL('./bamboohrResume.ts', import.meta.url), 'utf8')
  assert.equal(resumeModule.includes("action: 'loadSavedResume'"), true)
  assert.equal(readFileSync(new URL('./bamboohr.ts', import.meta.url), 'utf8').includes('requestSavedResume'), true)
})

test('no saved resume leaves the BambooHR resume file input empty', async () => {
  const calls: string[] = []
  const missing = await loadSavedResumeFile({
    supabaseUrl: SUPABASE_URL,
    anonKey: ANON_KEY,
    nowMs: 1_700_000_000_000,
    readStorage: async () => storedSession(),
    fetchImpl: async (url) => {
      calls.push(url)
      return new Response(JSON.stringify([{ resume_file_path: null, resume_file_name: null }]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    },
  })
  assert.equal(missing, null)
  assert.equal(calls.length, 1)

  const expired = await loadSavedResumeFile({
    supabaseUrl: SUPABASE_URL,
    anonKey: ANON_KEY,
    nowMs: 1_700_000_000_000,
    readStorage: async () => storedSession(1),
    fetchImpl: async () => {
      throw new Error('should not download without a session')
    },
  })
  assert.equal(expired, null)

  const otherUser = await loadSavedResumeFile({
    supabaseUrl: SUPABASE_URL,
    anonKey: ANON_KEY,
    nowMs: 1_700_000_000_000,
    readStorage: async () => storedSession(),
    fetchImpl: async (url) => {
      if (url.includes('/storage/')) throw new Error('should not download another user resume')
      return new Response(
        JSON.stringify([{ resume_file_path: 'someone-else/resume.pdf', resume_file_name: 'other.pdf' }]),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    },
  })
  assert.equal(otherUser, null)

  const dom = new JSDOM(`<!doctype html><body>
    <label for="resume">Resume</label>
    <input id="resume" name="resume" type="file" />
    <label for="cover">Cover Letter</label>
    <input id="cover" name="coverLetter" type="file" />
    <button type="button" id="autofill">Autofill with resume</button>
  </body>`)
  installDataTransfer(dom.window as JSDOM['window'] & Window)
  const resume = dom.window.document.getElementById('resume') as HTMLInputElement
  setBambooResumeLoader(async () => null)
  try {
    const rule = bambooHrConfig()
    assert.equal(await rule.apply(resume, '', cloneDefaultPersonalInfo()), 'skip')
    assert.equal(resume.files?.length ?? 0, 0)
    assert.equal(await assignResumeFile(resume, null), false)
    assert.equal(resume.files?.length ?? 0, 0)
  } finally {
    setBambooResumeLoader(null)
  }
})
