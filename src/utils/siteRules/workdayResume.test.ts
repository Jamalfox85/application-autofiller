import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import type { PersonalInfo } from '../../types/index.ts'
import {
  isWorkdayApplicationSubmitControl,
  isWorkdayResumeAutofillControl,
  workdayApplyChooserTarget,
} from './workdayFields.ts'
import {
  attachWorkdaySavedResume,
  createWorkdayResumeAttempt,
  fileFromWorkdaySavedResume,
  isWorkdayCoverLetterFileInput,
  isWorkdayResumeFileInput,
  workdayResumeFileInput,
} from './workdayResume.ts'
import workdayConfig, { setWorkdayResumeLoader } from './workday.ts'

const STORED_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3])

function installDataTransfer(window: JSDOM['window'] & { DataTransfer?: new () => DataTransfer }) {
  class DataTransferPolyfill {
    private queued: File[] = []
    items = {
      add: (file: File) => {
        this.queued.push(file)
      },
    }
    get files(): FileList {
      const holder = window.document.createElement('input')
      holder.type = 'file'
      const list = holder.files
      if (!list) throw new Error('file input has no FileList')
      const symbol = Object.getOwnPropertySymbols(list).find((candidate) => {
        const impl = (list as unknown as Record<symbol, { push?: (file: File) => void }>)[candidate]
        return !!impl && typeof impl.push === 'function'
      })
      if (!symbol) throw new Error('jsdom FileList has no impl')
      const impl = (list as unknown as Record<symbol, { length: number; push: (file: File) => void }>)[symbol]
      impl.length = 0
      for (const file of this.queued) impl.push(file)
      return list
    }
  }
  window.DataTransfer = DataTransferPolyfill as unknown as new () => DataTransfer
}

function trackClicks(doc: Document) {
  const clicks: string[] = []
  for (const el of Array.from(doc.querySelectorAll('button, a, input'))) {
    el.addEventListener('click', () => {
      clicks.push((el as HTMLElement).id || el.getAttribute('aria-label') || el.tagName)
    })
  }
  return clicks
}

function savedFile(
  window: JSDOM['window'],
  bytes: Uint8Array,
  name = 'Ada-Lovelace-resume.pdf',
  type = 'application/pdf',
): File {
  return new window.File([bytes], name, { type })
}

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

// The inner box is only the dropzone caption. Resume/CV sits above it, the same
// shape as the My Experience file-upload-input-ref control.
const DROPZONE_FORM = `<!doctype html><body>
  <div>
    <div data-automation-id="formLabel">Resume/CV</div>
    <div data-automation-id="file-upload">
      <div data-automation-id="file-upload-drop-zone">
        <p>Upload a file (5MB max)*</p>
        <div>Drop files here</div>
        <span>or</span>
        <button type="button" id="select-resume">Select files</button>
        <input id="resume-file" type="file" data-automation-id="file-upload-input-ref" />
      </div>
    </div>
  </div>
  <div>
    <h2>Cover Letter</h2>
    <div data-automation-id="file-upload">
      <div data-automation-id="file-upload-drop-zone">
        <p>Upload a file (5MB max)*</p>
        <div>Drop files here</div>
        <span>or</span>
        <button type="button" id="select-cover">Select files</button>
        <input id="cover-file" type="file" data-automation-id="file-upload-input-ref" />
      </div>
    </div>
  </div>
  <button type="button" id="autofill">Autofill with Resume</button>
  <button type="button" id="last">Use My Last Application</button>
  <button type="button" id="submit">Submit</button>
  <button type="button" id="submit-app">Submit Application</button>
  <button type="button" id="send">Send</button>
</body>`

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

const APPLY_FORM = `<!doctype html><body>
  <button type="button" id="autofill">Autofill with Resume</button>
  <button type="button" id="last">Use My Last Application</button>
  <a data-automation-id="applyManually" id="manual">Apply Manually</a>
  <button type="button" id="submit">Submit Application</button>
  <button type="button" id="send">Send</button>
  <label for="resume">Resume</label>
  <input id="resume" type="file" />
  <label for="cv">CV</label>
  <input id="cv" type="file" />
  <label for="cover">Cover Letter</label>
  <input id="cover" type="file" />
</body>`

const profile = { resumeFileName: 'Ada-Lovelace-resume.pdf' } as PersonalInfo

test('Workday file input receives the stored resume bytes and autofill controls are not clicked', async () => {
  const dom = new JSDOM(APPLY_FORM)
  installDataTransfer(dom.window)
  const doc = dom.window.document
  const clicks = trackClicks(doc)
  const resume = doc.getElementById('resume') as HTMLInputElement
  const cover = doc.getElementById('cover') as HTMLInputElement
  const file = savedFile(dom.window, STORED_BYTES)
  assert.equal(isWorkdayResumeFileInput(resume), true)
  assert.equal(isWorkdayCoverLetterFileInput(cover), true)
  assert.equal(workdayResumeFileInput(doc)?.id, 'resume')

  setWorkdayResumeLoader(async () => file)
  const rule = workdayConfig()
  assert.equal(await rule.apply(resume, 'resume', profile), true)
  assert.equal(resume.files?.length, 1)
  assert.equal(resume.files?.[0]?.name, 'Ada-Lovelace-resume.pdf')
  assert.equal(resume.files?.[0]?.type, 'application/pdf')
  assert.deepEqual(new Uint8Array(await resume.files![0].arrayBuffer()), STORED_BYTES)
  assert.equal(await rule.apply(cover, 'cover letter', profile), 'skip')
  assert.equal(cover.files?.length ?? 0, 0)
  assert.deepEqual(clicks, [])

  assert.equal(isWorkdayResumeAutofillControl(doc.getElementById('autofill')!), true)
  assert.equal(isWorkdayResumeAutofillControl(doc.getElementById('last')!), true)
  assert.equal(isWorkdayApplicationSubmitControl(doc.getElementById('submit')!), true)
  assert.equal(isWorkdayApplicationSubmitControl(doc.getElementById('send')!), true)
  const target = workdayApplyChooserTarget(doc)
  assert.equal(target?.id, 'manual')
  target?.click()
  assert.deepEqual(clicks, ['manual'])
  setWorkdayResumeLoader(null)
})

test('a filename with no stored object is not attached', async () => {
  const dom = new JSDOM(APPLY_FORM)
  installDataTransfer(dom.window)
  const resume = dom.window.document.getElementById('resume') as HTMLInputElement
  setWorkdayResumeLoader(async () => null)
  const rule = workdayConfig()
  assert.equal(await rule.apply(resume, 'resume', profile), 'skip')
  assert.equal(resume.files?.length ?? 0, 0)
  assert.equal(await attachWorkdaySavedResume(resume, null), false)
  assert.equal(await attachWorkdaySavedResume(resume, savedFile(dom.window, new Uint8Array())), false)
  assert.equal(resume.files?.length ?? 0, 0)
  setWorkdayResumeLoader(null)
})

test('cover letter and a file input beside Autofill with Resume stay empty', async () => {
  const dom = new JSDOM(`<!doctype html><body>
    <div>
      <span>Cover Letter</span>
      <label for="cl">Choose file</label>
      <input id="cl" type="file" />
    </div>
    <button type="button" id="autofill">Autofill with Resume</button>
    <input id="beside" type="file" />
  </body>`)
  installDataTransfer(dom.window)
  const doc = dom.window.document
  const clicks = trackClicks(doc)
  const file = savedFile(dom.window, STORED_BYTES)
  assert.equal(workdayResumeFileInput(doc), null)
  assert.equal(await attachWorkdaySavedResume(doc.getElementById('cl') as HTMLInputElement, file), false)
  assert.equal(await attachWorkdaySavedResume(doc.getElementById('beside') as HTMLInputElement, file), false)
  assert.equal((doc.getElementById('cl') as HTMLInputElement).files?.length ?? 0, 0)
  assert.deepEqual(clicks, [])
})

test('plain Upload, CV, and Choose file inputs receive the saved resume', async () => {
  const dom = new JSDOM(`<!doctype html><body>
    <input id="upload" type="file" aria-label="Upload" />
    <label for="cv">CV</label>
    <input id="cv" type="file" />
    <label for="choose">Choose file</label>
    <input id="choose" type="file" />
    <button type="button" id="autofill">Autofill with Resume</button>
    <button type="button" id="submit">Submit</button>
  </body>`)
  installDataTransfer(dom.window)
  const doc = dom.window.document
  const clicks = trackClicks(doc)
  const file = savedFile(dom.window, STORED_BYTES)
  const upload = doc.getElementById('upload') as HTMLInputElement
  assert.equal(workdayResumeFileInput(doc)?.id, 'upload')
  assert.equal(await attachWorkdaySavedResume(upload, file), true)
  assert.deepEqual(new Uint8Array(await upload.files![0].arrayBuffer()), STORED_BYTES)
  const cv = doc.getElementById('cv') as HTMLInputElement
  assert.equal(isWorkdayResumeFileInput(cv), true)
  assert.equal(await attachWorkdaySavedResume(cv, file), true)
  const choose = doc.getElementById('choose') as HTMLInputElement
  assert.equal(isWorkdayResumeFileInput(choose), true)
  assert.equal(await attachWorkdaySavedResume(choose, file), true)
  assert.equal(choose.files?.[0]?.name, file.name)
  assert.deepEqual(clicks, [])
  assert.equal(workdayApplyChooserTarget(doc), null)
})

test('a Resume/CV dropzone receives the saved file and the cover letter dropzone stays empty', async () => {
  const dom = new JSDOM(DROPZONE_FORM)
  installDataTransfer(dom.window)
  const doc = dom.window.document
  const clicks = trackClicks(doc)
  const resume = doc.getElementById('resume-file') as HTMLInputElement
  const cover = doc.getElementById('cover-file') as HTMLInputElement
  const storedName = 'stored-on-profile.docx'
  const file = savedFile(dom.window, STORED_BYTES, storedName, DOCX_TYPE)

  assert.equal(resume.id, 'resume-file')
  assert.equal(resume.getAttribute('name'), null)
  assert.equal(resume.getAttribute('aria-label'), null)
  assert.equal(resume.getAttribute('accept'), null)
  assert.equal(resume.getAttribute('data-automation-id'), 'file-upload-input-ref')
  assert.equal(isWorkdayResumeFileInput(resume), true)
  assert.equal(isWorkdayCoverLetterFileInput(cover), true)
  assert.equal(isWorkdayResumeFileInput(cover), false)
  assert.equal(workdayResumeFileInput(doc)?.id, 'resume-file')

  setWorkdayResumeLoader(async () => file)
  const rule = workdayConfig()
  assert.equal(await rule.apply(resume, 'file', { resumeFileName: 'other-name.pdf' } as PersonalInfo), true)
  assert.equal(resume.files?.length, 1)
  assert.equal(resume.files?.[0]?.name, storedName)
  assert.equal(resume.files?.[0]?.type, DOCX_TYPE)
  assert.deepEqual(new Uint8Array(await resume.files![0].arrayBuffer()), STORED_BYTES)
  assert.equal(await rule.apply(cover, 'file', profile), 'skip')
  assert.equal(cover.files?.length ?? 0, 0)
  assert.equal(await attachWorkdaySavedResume(cover, file), false)
  assert.deepEqual(clicks, [])
  assert.equal(isWorkdayResumeAutofillControl(doc.getElementById('autofill')!), true)
  assert.equal(isWorkdayResumeAutofillControl(doc.getElementById('last')!), true)
  assert.equal(isWorkdayApplicationSubmitControl(doc.getElementById('submit')!), true)
  assert.equal(isWorkdayApplicationSubmitControl(doc.getElementById('submit-app')!), true)
  assert.equal(isWorkdayApplicationSubmitControl(doc.getElementById('send')!), true)
  setWorkdayResumeLoader(null)
})

test('a heading above the dropzone counts, and a bare Select files input does not', async () => {
  const dom = new JSDOM(`<!doctype html><body>
    <h2>Resume/CV</h2>
    <div>
      <p>Upload a file (5MB max)*</p>
      <div>Drop files here</div>
      <span>or</span>
      <button type="button">Select files</button>
      <input id="headed" type="file" data-automation-id="file-upload-input-ref" />
    </div>
    <div>
      <p>Upload a file (5MB max)*</p>
      <div>Drop files here</div>
      <span>or</span>
      <button type="button">Select files</button>
      <input id="bare" type="file" data-automation-id="file-upload-input-ref" />
    </div>
  </body>`)
  installDataTransfer(dom.window)
  const doc = dom.window.document
  const headed = doc.getElementById('headed') as HTMLInputElement
  const bare = doc.getElementById('bare') as HTMLInputElement
  const file = savedFile(dom.window, STORED_BYTES, 'stored-on-profile.docx', DOCX_TYPE)
  assert.equal(isWorkdayResumeFileInput(headed), true)
  assert.equal(isWorkdayResumeFileInput(bare), false)
  assert.equal(await attachWorkdaySavedResume(headed, file), true)
  assert.equal(headed.files?.[0]?.name, 'stored-on-profile.docx')
  assert.equal(await attachWorkdaySavedResume(bare, file), false)
  assert.equal(bare.files?.length ?? 0, 0)
})

test('a missing file is not a finished attach, so the dropzone that appears next still receives it', async () => {
  const early = new JSDOM(`<!doctype html><body><input id="early" type="file" aria-label="Upload" /></body>`)
  installDataTransfer(early.window)
  const later = new JSDOM(DROPZONE_FORM)
  installDataTransfer(later.window)
  const storedName = 'stored-on-profile.docx'
  const file = savedFile(later.window, STORED_BYTES, storedName, DOCX_TYPE)
  let calls = 0
  const fill = createWorkdayResumeAttempt(async () => {
    calls += 1
    return calls === 1 ? null : file
  })
  const earlyInput = early.window.document.getElementById('early') as HTMLInputElement
  assert.equal(await fill(early.window.document), false)
  assert.equal(earlyInput.files?.length ?? 0, 0)
  assert.equal(await fill(early.window.document), false)
  assert.equal(calls, 1)

  assert.equal(await fill(later.window.document), true)
  assert.equal(calls, 2)
  const resume = later.window.document.getElementById('resume-file') as HTMLInputElement
  const cover = later.window.document.getElementById('cover-file') as HTMLInputElement
  assert.equal(resume.files?.[0]?.name, storedName)
  assert.deepEqual(new Uint8Array(await resume.files![0].arrayBuffer()), STORED_BYTES)
  assert.equal(cover.files?.length ?? 0, 0)
})

test('a failed download is retried on the next apply', async () => {
  const dom = new JSDOM(DROPZONE_FORM)
  installDataTransfer(dom.window)
  const resume = dom.window.document.getElementById('resume-file') as HTMLInputElement
  const storedName = 'stored-on-profile.docx'
  const file = savedFile(dom.window, STORED_BYTES, storedName, DOCX_TYPE)
  let calls = 0
  setWorkdayResumeLoader(async () => {
    calls += 1
    return calls === 1 ? null : file
  })
  const rule = workdayConfig()
  assert.equal(await rule.apply(resume, 'file', profile), 'skip')
  assert.equal(resume.files?.length ?? 0, 0)
  assert.equal(await rule.apply(resume, 'file', profile), true)
  assert.equal(calls, 2)
  assert.equal(resume.files?.[0]?.name, storedName)
  setWorkdayResumeLoader(null)
})

test('a loadSavedResume reply with plain-object bytes and bytesBase64 still attaches the saved file', async () => {
  const storedName = 'stored-on-profile.docx'
  const wire = {
    ok: true,
    fileName: storedName,
    mimeType: DOCX_TYPE,
    bytes: STORED_BYTES,
    bytesBase64: bytesToBase64(STORED_BYTES),
  }
  const delivered = JSON.parse(JSON.stringify(wire)) as { bytes?: unknown; bytesBase64?: unknown }
  assert.equal(delivered.bytes instanceof Uint8Array, false)
  assert.equal(Array.isArray(delivered.bytes), false)
  assert.equal(typeof delivered.bytesBase64, 'string')

  const decoded = fileFromWorkdaySavedResume(delivered)
  assert.equal(decoded?.name, storedName)
  assert.deepEqual(new Uint8Array(await decoded!.arrayBuffer()), STORED_BYTES)
  assert.equal(fileFromWorkdaySavedResume({ ...delivered, bytesBase64: undefined }), null)

  const previousChrome = (globalThis as { chrome?: unknown }).chrome
  const messages: unknown[] = []
  Object.assign(globalThis, {
    chrome: {
      runtime: {
        async sendMessage(payload: unknown) {
          messages.push(payload)
          return delivered
        },
      },
    },
  })
  const dom = new JSDOM(DROPZONE_FORM)
  installDataTransfer(dom.window)
  const doc = dom.window.document
  const clicks = trackClicks(doc)
  const resume = doc.getElementById('resume-file') as HTMLInputElement
  const cover = doc.getElementById('cover-file') as HTMLInputElement
  setWorkdayResumeLoader(null)
  try {
    const rule = workdayConfig()
    assert.equal(await rule.apply(resume, 'file', profile), true)
    assert.equal(resume.files?.[0]?.name, storedName)
    assert.equal(resume.files?.[0]?.type, DOCX_TYPE)
    assert.deepEqual(new Uint8Array(await resume.files![0].arrayBuffer()), STORED_BYTES)
    assert.equal(await rule.apply(cover, 'file', profile), 'skip')
    assert.equal(cover.files?.length ?? 0, 0)
    assert.deepEqual(clicks, [])
    assert.deepEqual(messages, [{ action: 'loadSavedResume' }])
  } finally {
    setWorkdayResumeLoader(null)
    Object.assign(globalThis, { chrome: previousChrome })
  }
})

test('the Workday resume module does not click or hardcode a filename', () => {
  const source = readFileSync(new URL('./workdayResume.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /\.click\s*\(/)
  assert.doesNotMatch(source, /admin-resume/)
})

test('job-page Apply is clicked and Autofill with Resume is not', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <button data-automation-id="adventureButton" id="autofill">Autofill with Resume</button>
    <button data-automation-id="adventureButton" id="last">Use My Last Application</button>
    <a data-automation-id="adventureButton" id="apply">Apply</a>
    <button data-automation-id="adventureButton" id="submit">Submit</button>
    <button data-automation-id="adventureButton" id="send">Send</button>
  </body>`)
  const doc = dom.window.document
  const clicks = trackClicks(doc)
  const target = workdayApplyChooserTarget(doc)
  assert.equal(target?.id, 'apply')
  target?.click()
  assert.deepEqual(clicks, ['apply'])
  assert.equal(workdayApplyChooserTarget(doc, { jobApplyClicked: true }), null)
})
