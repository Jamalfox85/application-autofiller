import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import { cloneDefaultPersonalInfo } from '../../lib/personalInfoDefaults.ts'
import bambooHrConfig, { setBambooResumeLoader } from './bamboohr.ts'
import {
  assignResumeFile,
  bambooOwnedMenu,
  bambooUploadRole,
  chooseBambooOptionText,
  describeBambooUpload,
  isBambooCountryControl,
  isBambooStateControl,
  pickBambooCountryOption,
  pickBambooStateOption,
} from './bamboohrFields.ts'
import {
  fileFromBambooSavedResumeMessage,
  fileFromSavedResumeMessage,
  loadSavedResumeFile,
} from './bamboohrResume.ts'

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

test('United States stays the country when Georgia and Uganda are also listed', () => {
  const menu = ['Uganda', 'Georgia', 'United States', 'Norway', 'South Georgia and the South Sandwich Islands']
  assert.equal(pickBambooCountryOption(menu, 'Norway', 'united_states'), 'United States')
  assert.equal(pickBambooCountryOption(menu, 'Georgia', 'united_states'), 'United States')
  assert.equal(pickBambooCountryOption(menu, 'Uganda', 'united_states'), 'United States')
  assert.equal(pickBambooCountryOption(['Uganda', 'Georgia', 'Norway'], 'Norway', 'united_states'), null)
  assert.equal(chooseBambooOptionText(['Uganda', 'Ukraine', 'United States'], 'Georgia'), null)
  assert.equal(pickBambooStateOption(menu, 'Georgia'), null)
  assert.equal(pickBambooStateOption(['Alabama', 'Georgia', 'Hawaii'], 'Georgia'), 'Georgia')
  assert.equal(pickBambooStateOption(['Uganda', 'Ukraine', 'United States'], 'Georgia'), null)
})

test('the open state menu is not the country list that appears first', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <div id="country-menu">
      <input class="fab-MenuSearch__input" />
      <div role="menuitem">Uganda</div>
      <div role="menuitem">Georgia</div>
    </div>
    <div id="state-menu" data-menu-id="state-menu">
      <input class="fab-MenuSearch__input" />
      <div role="menuitem">Georgia</div>
    </div>
    <button type="button" id="state-toggle" class="fab-SelectToggle" aria-controls="state-menu"></button>
  </body>`)
  const toggle = dom.window.document.getElementById('state-toggle')!
  assert.equal(bambooOwnedMenu(toggle)?.id, 'state-menu')
  assert.deepEqual(
    Array.from(bambooOwnedMenu(toggle)!.querySelectorAll('[role="menuitem"]')).map((el) => el.textContent),
    ['Georgia'],
  )
})

test('United States on the country control is not the state field', () => {
  const countryText = 'countryid.valuefabselect346countryunitedstatesselectone'
  assert.equal(countryText.includes('state'), true)
  assert.equal(
    isBambooStateControl({ name: 'countryId.value', id: 'fab-select346', type: 'select-one' }, countryText),
    false,
  )
  assert.equal(
    isBambooStateControl(
      { name: 'state.value', id: 'fab-select345', type: 'select-one' },
      'state.valuefabselect345stateselectone',
    ),
    true,
  )
  assert.equal(
    isBambooStateControl(
      { name: 'state.value', id: 'FabricTextField-344', type: 'text' },
      'state.valueprovincetext',
    ),
    true,
  )
  assert.equal(
    isBambooStateControl({ name: 'personalStatement', id: 'statement', type: 'textarea' }, 'personalstatement'),
    false,
  )
})

test('Georgia stays on the state control and United States stays on the country control', async () => {
  const dom = new JSDOM(`<!doctype html><body>
    <div id="country-menu">
      <input id="country-search" class="fab-MenuSearch__input" />
      <div role="menuitem" id="opt-uganda">Uganda</div>
      <div role="menuitem" id="opt-country-georgia">Georgia</div>
      <div role="menuitem" id="opt-us">United States</div>
      <div role="menuitem" id="opt-norway">Norway</div>
      <div role="menuitem" id="opt-south-georgia">South Georgia and the South Sandwich Islands</div>
    </div>
    <div id="state-menu">
      <input id="state-search" class="fab-MenuSearch__input" />
      <div role="menuitem" id="opt-al">Alabama</div>
      <div role="menuitem" id="opt-state-georgia">Georgia</div>
      <div role="menuitem" id="opt-hi">Hawaii</div>
    </div>
    <div class="fab-Select">
      <button type="button" class="fab-SelectToggle" id="state-toggle" aria-expanded="true" aria-controls="state-menu">
        <span class="fab-SelectToggle__content"></span>
      </button>
      <select name="state.value" id="fab-select345"></select>
    </div>
    <div class="fab-Select">
      <button type="button" class="fab-SelectToggle" id="country-toggle" aria-expanded="true" aria-controls="country-menu">
        <span class="fab-SelectToggle__content">Norway</span>
      </button>
      <select name="countryId.value" id="fab-select346">
        <option value="161" selected>Norway</option>
      </select>
    </div>
  </body>`)
  const doc = dom.window.document
  const clicks: string[] = []
  const countryToggle = doc.getElementById('country-toggle')!
  const stateToggle = doc.getElementById('state-toggle')!
  const watch = (id: string, toggle: Element, name: string) => {
    doc.getElementById(id)!.addEventListener('click', () => {
      clicks.push(name)
      const content = toggle.querySelector('.fab-SelectToggle__content')
      if (content) content.textContent = doc.getElementById(id)!.textContent
    })
  }
  watch('opt-uganda', countryToggle, 'country:Uganda')
  watch('opt-country-georgia', countryToggle, 'country:Georgia')
  watch('opt-us', countryToggle, 'country:United States')
  watch('opt-norway', countryToggle, 'country:Norway')
  watch('opt-south-georgia', countryToggle, 'country:South Georgia')
  watch('opt-state-georgia', stateToggle, 'state:Georgia')
  watch('opt-al', stateToggle, 'state:Alabama')

  assert.equal(bambooOwnedMenu(stateToggle)?.id, 'state-menu')
  assert.equal(bambooOwnedMenu(countryToggle)?.id, 'country-menu')
  assert.notEqual(doc.querySelector('.fab-MenuSearch__input')?.id, 'state-search')

  const info = cloneDefaultPersonalInfo()
  info.country = 'united_states'
  info.state = 'Georgia'
  const rule = bambooHrConfig()
  const stateField = 'state.valuefabselect345provincestateselectone'
  const countryField = 'countryid.valuefabselect346countryunitedstatesselectone'
  const stateSelect = doc.getElementById('fab-select345') as HTMLSelectElement
  const countrySelect = doc.getElementById('fab-select346') as HTMLSelectElement

  assert.equal(await rule.apply(stateSelect, stateField, info), true)
  assert.equal(await rule.apply(countrySelect, countryField, info), true)
  assert.deepEqual(clicks, ['state:Georgia', 'country:United States'])
  assert.equal((doc.getElementById('state-search') as HTMLInputElement).value, 'Georgia')
  assert.equal((doc.getElementById('country-search') as HTMLInputElement).value, 'United States')
  assert.equal(stateToggle.querySelector('.fab-SelectToggle__content')?.textContent, 'Georgia')
  assert.equal(countryToggle.querySelector('.fab-SelectToggle__content')?.textContent, 'United States')

  assert.equal(await rule.apply(stateSelect, stateField, info), true)
  assert.equal(await rule.apply(countrySelect, countryField, info), true)
  assert.deepEqual(clicks, ['state:Georgia', 'country:United States'])
})

test('a blank Province text input next to the country menu is filled with the profile state', async () => {
  const dom = new JSDOM(`<!doctype html><body>
    <div id="country-menu">
      <input id="country-search" class="fab-MenuSearch__input" />
      <div role="menuitem" id="opt-uganda">Uganda</div>
      <div role="menuitem" id="opt-country-georgia">Georgia</div>
      <div role="menuitem" id="opt-us">United States</div>
    </div>
    <div id="province-row">
      <label for="FabricTextField-344">Province*</label>
      <input id="FabricTextField-344" name="state.value" type="text" value="" />
    </div>
    <div class="fab-Select">
      <button type="button" class="fab-SelectToggle" id="country-toggle" aria-expanded="false" aria-label="Country Uganda">
        <span class="fab-SelectToggle__content">Uganda</span>
      </button>
      <select name="countryId.value" id="fab-select346">
        <option value="219" selected>Uganda</option>
      </select>
    </div>
  </body>`)
  const doc = dom.window.document
  const clicks: string[] = []
  const province = doc.getElementById('FabricTextField-344') as HTMLInputElement
  const countryToggle = doc.getElementById('country-toggle')!
  const countryContent = countryToggle.querySelector('.fab-SelectToggle__content')!
  // The menu stays closed until the toggle is clicked. Enter does not open it.
  countryToggle.addEventListener('click', () => {
    countryToggle.setAttribute('aria-expanded', 'true')
    countryToggle.setAttribute('aria-controls', 'country-menu')
  })
  const watch = (id: string, name: string) => {
    doc.getElementById(id)!.addEventListener('click', () => {
      clicks.push(name)
      countryContent.textContent = doc.getElementById(id)!.textContent
      // Changing country drops the region value. Province has to be written again.
      if (name === 'country:United States') province.value = ''
    })
  }
  watch('opt-uganda', 'country:Uganda')
  watch('opt-country-georgia', 'country:Georgia')
  watch('opt-us', 'country:United States')

  const info = cloneDefaultPersonalInfo()
  info.country = 'united_states'
  info.state = 'Georgia'
  const rule = bambooHrConfig()
  const country = doc.getElementById('fab-select346') as HTMLSelectElement
  assert.equal(province.value, '')
  assert.equal(countryContent.textContent, 'Uganda')

  assert.equal(await rule.apply(province, 'state.valueprovincetext', info), true)
  assert.equal(await rule.apply(country, 'countryid.valuecountryugandaselectone', info), true)
  assert.equal(province.value, 'Georgia')
  assert.equal(countryContent.textContent, 'United States')
  assert.deepEqual(clicks, ['country:United States'])

  assert.equal(await rule.apply(province, 'state.valueprovincetext', info), true)
  assert.equal(await rule.apply(country, 'countryid.valuecountryugandaselectone', info), true)
  assert.equal(province.value, 'Georgia')
  assert.equal(countryContent.textContent, 'United States')
  assert.deepEqual(clicks, ['country:United States'])
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
  assert.equal(resumeModule.includes('fileFromBambooSavedResumeMessage'), true)
  assert.equal(
    readFileSync(new URL('./bamboohr.ts', import.meta.url), 'utf8').includes('requestBambooSavedResume'),
    true,
  )
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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

// Piano careers form: the file input has no name or id. "Resume*" is a caption
// beside a hidden resumeFileId. The Choose File button is a sibling, not the input.
const FABRIC_FORM = `<!doctype html><body>
  <form>
    <div data-fabric-component="Flex">
      <p data-fabric-component="BodyText">Cover Letter</p>
      <div data-fabric-component="FileUpload">
        <div data-fabric-component="FileUploadInput">
          <button type="button" id="cover-choose">Choose File</button>
          <span id="cover-status">No file selected</span>
          <input type="file" aria-label="file-input" />
        </div>
        <input type="hidden" name="coverLetterFileId" />
      </div>
    </div>
    <div data-fabric-component="Flex">
      <p data-fabric-component="BodyText">Resume*</p>
      <div data-fabric-component="FileUpload">
        <div data-fabric-component="FileUploadInput">
          <button type="button" id="resume-choose">Choose File*</button>
          <span id="resume-status">No file selected</span>
          <input type="file" aria-label="file-input" required />
        </div>
        <input type="hidden" name="resumeFileId" />
      </div>
    </div>
    <button type="button" id="autofill">Autofill with resume</button>
    <input type="button" id="autofill-input" value="Autofill from resume" />
  </form>
</body>`

test('the Fabric resume choose-file receives admin-resume.docx and not the leftover pdf', async () => {
  const docx = new Uint8Array(24319)
  docx[0] = 0x50
  docx[1] = 0x4b
  docx[2] = 0x03
  docx[3] = 0x04
  const leftoverPdf = new Uint8Array(400)
  leftoverPdf[0] = 0x25
  leftoverPdf[1] = 0x50
  leftoverPdf[2] = 0x44
  leftoverPdf[3] = 0x46

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
            {
              resume_file_path: `${USER_ID}/resume.pdf`,
              resume_file_name: 'admin-resume.docx',
            },
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      if (url.endsWith('/resume.pdf')) {
        return new Response(leftoverPdf, { status: 200, headers: { 'content-type': 'application/pdf' } })
      }
      assert.equal(url, `${SUPABASE_URL}/storage/v1/object/authenticated/resumes/${USER_ID}/resume.docx`)
      return new Response(docx, {
        status: 200,
        headers: {
          'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        },
      })
    },
  })
  assert.ok(saved)
  assert.equal(saved.name, 'admin-resume.docx')
  assert.equal(saved.size, 24319)
  assert.equal(saved.size === leftoverPdf.byteLength, false)
  assert.equal(calls.some((url) => url.endsWith('/resume.pdf')), false)
  assert.deepEqual(new Uint8Array(await saved.arrayBuffer()).slice(0, 4), docx.slice(0, 4))

  const wire = {
    ok: true as const,
    fileName: saved.name,
    mimeType: saved.type,
    bytes: new Uint8Array(await saved.arrayBuffer()),
    bytesBase64: bytesToBase64(new Uint8Array(await saved.arrayBuffer())),
  }
  const delivered = JSON.parse(JSON.stringify(wire)) as { bytes?: unknown; bytesBase64?: unknown }
  assert.equal(delivered.bytes instanceof Uint8Array, false)
  assert.equal(Array.isArray(delivered.bytes), false)
  const fromWire = fileFromBambooSavedResumeMessage(delivered)
  assert.ok(fromWire)
  assert.equal(fromWire.name, 'admin-resume.docx')
  assert.equal(fromWire.size, 24319)
  assert.equal(
    fileFromBambooSavedResumeMessage({ ...delivered, bytesBase64: undefined }),
    null,
  )
  const pdfOnly = fileFromSavedResumeMessage({
    ok: true,
    fileName: 'resume.pdf',
    mimeType: 'application/pdf',
    bytes: leftoverPdf,
  })
  assert.equal(pdfOnly?.size, 400)
  assert.equal(fromWire.size === pdfOnly?.size, false)

  const dom = new JSDOM(FABRIC_FORM)
  const window = dom.window
  installDataTransfer(window as JSDOM['window'] & Window)
  const doc = window.document
  const clicks: string[] = []
  for (const id of ['cover-choose', 'resume-choose', 'autofill', 'autofill-input']) {
    doc.getElementById(id)?.addEventListener('click', () => clicks.push(id))
  }
  const resume = doc.querySelector('input[type="file"][required]') as HTMLInputElement
  const cover = doc.querySelector('input[type="file"]:not([required])') as HTMLInputElement
  const resumeStatus = doc.getElementById('resume-status')
  const coverStatus = doc.getElementById('cover-status')
  resume.addEventListener('change', () => {
    const file = resume.files?.[0]
    if (resumeStatus) resumeStatus.textContent = file?.name || 'No file selected'
  })
  cover.addEventListener('change', () => {
    const file = cover.files?.[0]
    if (coverStatus) coverStatus.textContent = file?.name || 'No file selected'
  })

  const previousChrome = (globalThis as { chrome?: unknown }).chrome
  ;(globalThis as { chrome?: unknown }).chrome = {
    runtime: {
      async sendMessage(message: unknown) {
        assert.deepEqual(message, { action: 'loadSavedResume' })
        return delivered
      },
    },
  }
  setBambooResumeLoader(null)
  try {
    const rule = bambooHrConfig()
    rule.prepareFill?.()
    const info = cloneDefaultPersonalInfo()
    assert.equal(describeBambooUpload(resume, 'file input file').name, 'resumeFileId')
    assert.equal(bambooUploadRole(describeBambooUpload(resume, 'file input file')), 'resume')
    assert.equal(bambooUploadRole(describeBambooUpload(cover, 'file input file')), 'cover')
    assert.equal(await rule.apply(cover, 'file input file', info), 'skip')
    assert.equal(await rule.apply(resume, 'file input file', info), true)
    assert.equal(await rule.apply(doc.getElementById('autofill') as HTMLInputElement, '', info), 'skip')
    assert.equal(await rule.apply(doc.getElementById('autofill-input') as HTMLInputElement, '', info), 'skip')
    assert.equal(resume.files?.[0]?.name, 'admin-resume.docx')
    assert.equal(resume.files?.[0]?.size, 24319)
    assert.equal(resume.value, 'C:\\fakepath\\admin-resume.docx')
    assert.equal(resumeStatus?.textContent, 'admin-resume.docx')
    assert.equal(cover.files?.length ?? 0, 0)
    assert.equal(cover.value, '')
    assert.equal(coverStatus?.textContent, 'No file selected')
    assert.deepEqual(clicks, [])
  } finally {
    ;(globalThis as { chrome?: unknown }).chrome = previousChrome
    setBambooResumeLoader(null)
  }
})
