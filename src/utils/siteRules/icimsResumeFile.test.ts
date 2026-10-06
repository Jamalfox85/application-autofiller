import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { JSDOM } from 'jsdom'
import type { PersonalInfo } from '../../types/index.ts'
import { icimsGateMayAdvance, planIcimsFill, type IcimsControl } from './icimsFields.ts'
import {
  applyIcimsResumeFile,
  loadIcimsSavedResume,
  resetIcimsResumeAttachMemory,
  resetIcimsSavedResumeCache,
} from './icimsResumeFile.ts'

const PDF = new TextEncoder().encode('%PDF-1.4 saved-resume')

function pageRealm() {
  class FakeDataTransfer {
    files: File[] = []
    items = {
      add: (file: File) => {
        this.files.push(file)
      },
    }
  }
  return {
    File,
    DataTransfer: FakeDataTransfer as unknown as typeof DataTransfer,
    Event,
  }
}

const control = (overrides: Partial<IcimsControl> = {}): IcimsControl => ({
  tagName: 'INPUT',
  type: 'file',
  ...overrides,
})

function fileInput(label: string, ownerDocument?: object) {
  const events: string[] = []
  const clicks: string[] = []
  const submits: string[] = []
  const input = {
    tagName: 'INPUT',
    type: 'file',
    name: 'PortalProfileFields.Resume_File',
    id: 'PortalProfileFields.Resume_File',
    value: '',
    files: null as File[] | null,
    ownerDocument: ownerDocument ?? { defaultView: pageRealm() },
    form: {
      submit() {
        submits.push('submit')
      },
      requestSubmit() {
        submits.push('requestSubmit')
      },
    },
    click() {
      clicks.push('click')
    },
    closest() {
      return { textContent: label }
    },
    parentElement: { textContent: label },
    getAttribute(name: string) {
      if (name === 'type') return 'file'
      if (name === 'name') return input.name
      if (name === 'id') return input.id
      return null
    },
    dispatchEvent(event: Event) {
      events.push(event.type)
      return true
    },
  }
  return { input, events, clicks, submits }
}

test('a plain Resume choose-file input is planned as a file attach', () => {
  const resume = planIcimsFill(
    control({
      name: 'PortalProfileFields.Resume_File',
      id: 'PortalProfileFields.Resume_File',
      fieldText: 'resume',
      contextText: 'Resume Choose File',
    }),
    {} as PersonalInfo,
  )
  assert.deepEqual(resume, { field: 'resumeFile', action: 'file' })

  const upload = planIcimsFill(
    control({ name: 'upload', fieldText: 'upload', contextText: 'Upload' }),
    {} as PersonalInfo,
  )
  assert.equal(upload.action, 'file')

  const choose = planIcimsFill(
    control({ fieldText: 'choosefile', contextText: 'Choose file' }),
    {} as PersonalInfo,
  )
  assert.equal(choose.action, 'file')

  const cv = planIcimsFill(control({ fieldText: 'uploadcv', contextText: 'Upload CV' }), {} as PersonalInfo)
  assert.equal(cv.action, 'file')
})

test('autofill-with-resume and other documents are not attached', () => {
  const autofill = planIcimsFill(
    control({
      id: 'parserResume',
      fieldText: 'upload',
      contextText: 'Autofill with resume. Upload your resume to automatically fill this application.',
    }),
    {} as PersonalInfo,
  )
  assert.deepEqual(autofill, { field: 'resumeFile', action: 'leave', reason: 'resume-autofill' })

  const cover = planIcimsFill(
    control({ name: 'coverLetter', fieldText: 'cover letter upload', contextText: 'Cover letter' }),
    {} as PersonalInfo,
  )
  assert.notEqual(cover.field, 'resumeFile')
  assert.notEqual(cover.action, 'file')

  const button = planIcimsFill(
    control({ type: 'button', fieldText: 'autofill with resume' }),
    {} as PersonalInfo,
  )
  assert.equal(button.action, 'ignore')
})

test('applyIcimsResumeFile selects the saved resume and does not submit', async () => {
  const saved = new File([PDF], 'Ada Lovelace.pdf', { type: 'application/pdf' })
  const { input, events, clicks, submits } = fileInput('Resume')
  assert.equal(await applyIcimsResumeFile(input, saved), true)
  assert.equal(input.files?.length, 1)
  assert.equal(input.files?.[0]?.name, 'Ada Lovelace.pdf')
  assert.equal(input.files?.[0]?.size, saved.size)
  assert.equal(input.files?.[0]?.type, 'application/pdf')
  assert.equal(
    new TextDecoder().decode(new Uint8Array(await input.files![0].arrayBuffer())),
    '%PDF-1.4 saved-resume',
  )
  assert.deepEqual(events, ['input', 'change'])
  assert.deepEqual(clicks, [])
  assert.deepEqual(submits, [])
  assert.equal(icimsGateMayAdvance(), false)

  const empty = fileInput('Resume')
  assert.equal(await applyIcimsResumeFile(empty.input, null), 'skip')
  assert.equal(empty.input.files, null)
  assert.deepEqual(empty.events, [])
  assert.deepEqual(empty.submits, [])
})

describe('iCIMS resume attach', { concurrency: 1 }, () => {
test('the iCIMS site rule puts the saved resume on the plain file input and skips autofill with resume', async () => {
  const previousWindow = globalThis.window
  const previousChrome = (globalThis as { chrome?: unknown }).chrome
  const messages: unknown[] = []
  Object.assign(globalThis, {
    window: {
      location: {
        hostname: 'careers-jobyaviation.icims.com',
        pathname: '/jobs/5424/candidate',
        search: '?in_iframe=1',
      },
    },
    chrome: {
      runtime: {
        async sendMessage(message: unknown) {
          messages.push(message)
          return {
            ok: true,
            fileName: 'Ada Lovelace.pdf',
            mimeType: 'application/pdf',
            bytes: PDF,
          }
        },
      },
    },
  })
  resetIcimsSavedResumeCache()
  resetIcimsResumeAttachMemory()
  try {
    const { default: icimsConfig } = await import('./icims.ts')
    const rule = icimsConfig()
    const autofill = fileInput('Autofill with resume')
    autofill.input.id = 'parserResume'
    autofill.input.name = 'parserResume'
    assert.equal(
      await rule.apply(autofill.input as unknown as HTMLInputElement, 'upload', {} as PersonalInfo),
      'skip',
    )
    assert.equal(autofill.input.files, null)
    assert.deepEqual(messages, [])
    assert.deepEqual(autofill.clicks, [])
    assert.deepEqual(autofill.submits, [])

    const plain = fileInput('Resume Choose File')
    assert.equal(
      await rule.apply(plain.input as unknown as HTMLInputElement, 'resume choose file', {} as PersonalInfo),
      true,
    )
    assert.deepEqual(messages, [{ action: 'loadSavedResume' }])
    const selected = plain.input.files?.[0]
    assert.equal(selected?.name, 'Ada Lovelace.pdf')
    assert.equal(selected?.type, 'application/pdf')
    assert.equal(selected?.size, PDF.byteLength)
    assert.equal(new TextDecoder().decode(new Uint8Array(await selected!.arrayBuffer())), '%PDF-1.4 saved-resume')
    assert.deepEqual(plain.events, ['input', 'change'])
    assert.deepEqual(plain.clicks, [])
    assert.deepEqual(plain.submits, [])
    assert.equal(icimsGateMayAdvance(), false)

    const missing = fileInput('Resume')
    resetIcimsSavedResumeCache()
    ;(globalThis as { chrome: { runtime: { sendMessage: (message: unknown) => Promise<unknown> } } }).chrome.runtime.sendMessage =
      async (message: unknown) => {
        messages.push(message)
        return { ok: false }
      }
    assert.equal(
      await rule.apply(missing.input as unknown as HTMLInputElement, 'resume', {} as PersonalInfo),
      'skip',
    )
    assert.equal(missing.input.files, null)
    assert.deepEqual(missing.submits, [])
    assert.equal(await loadIcimsSavedResume(), null)
  } finally {
    resetIcimsSavedResumeCache()
    resetIcimsResumeAttachMemory()
    globalThis.window = previousWindow
    Object.assign(globalThis, { chrome: previousChrome })
  }
})

const KEMIN_HOST = 'careers-kemin.icims.com'
const KEMIN_PATH = '/jobs/12279/global-erp-business-analyst/candidate'
const person = {
  firstName: 'Jamal',
  lastName: 'Fox',
  email: 'fox.jamal@outlook.com',
} as PersonalInfo

function keminLocation(search = '?in_iframe=1') {
  return {
    hostname: KEMIN_HOST,
    pathname: KEMIN_PATH,
    search,
    href: `https://${KEMIN_HOST}${KEMIN_PATH}${search}`,
  }
}

function memoryStorage() {
  const items = new Map<string, string>()
  return {
    getItem(key: string) {
      return items.has(key) ? (items.get(key) as string) : null
    },
    setItem(key: string, value: string) {
      items.set(key, value)
    },
    removeItem(key: string) {
      items.delete(key)
    },
  }
}

function resumeDocument(options?: { text?: string; nodes?: object[] }) {
  return {
    body: { textContent: options?.text || '' },
    defaultView: pageRealm(),
    querySelectorAll() {
      return options?.nodes || []
    },
  }
}

function labeledControl(label: string, extras?: { hidden?: boolean; type?: string; className?: string }) {
  const clicks: string[] = []
  const className = extras?.className || ''
  const node = {
    tagName: extras?.type === 'submit' ? 'INPUT' : 'BUTTON',
    type: extras?.type || 'button',
    hidden: extras?.hidden === true,
    className,
    textContent: label,
    value: label,
    parentElement: null as {
      className?: string
      hidden?: boolean
      parentElement?: null
      getAttribute?: (name: string) => string | null
    } | null,
    getAttribute(name: string) {
      if (name === 'type') return extras?.type || 'button'
      if (name === 'aria-label') return label
      if (name === 'class') return className || null
      return null
    },
    click() {
      clicks.push(label)
    },
  }
  return { node, clicks }
}

function textField(id: string, type = 'text') {
  return {
    tagName: 'INPUT',
    type,
    id,
    name: id,
    value: '',
    getAttribute(name: string) {
      if (name === 'type') return type
      if (name === 'id' || name === 'name') return id
      return null
    },
  }
}

function installIcimsHarness() {
  const location = keminLocation()
  const storage = memoryStorage()
  const messages: unknown[] = []
  const saved = {
    ok: true,
    fileName: 'Ada Lovelace.pdf',
    mimeType: 'application/pdf',
    bytes: PDF,
  }
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    sessionStorage: (globalThis as { sessionStorage?: unknown }).sessionStorage,
    chrome: (globalThis as { chrome?: unknown }).chrome,
  }
  const pageWindow: {
    location: ReturnType<typeof keminLocation>
    top?: { location: ReturnType<typeof keminLocation> }
  } = { location }
  Object.assign(globalThis, {
    window: pageWindow,
    document: {
      querySelector() {
        return null
      },
      querySelectorAll() {
        return []
      },
    },
    sessionStorage: storage,
    chrome: {
      runtime: {
        async sendMessage(message: unknown) {
          messages.push(message)
          if (!saved.ok) return { ok: false }
          return {
            ok: true,
            fileName: saved.fileName,
            mimeType: saved.mimeType,
            bytes: saved.bytes,
          }
        },
      },
    },
  })
  resetIcimsSavedResumeCache()
  resetIcimsResumeAttachMemory()
  return {
    location,
    messages,
    saved,
    pageWindow,
    restore() {
      resetIcimsSavedResumeCache()
      resetIcimsResumeAttachMemory()
      globalThis.window = previous.window
      globalThis.document = previous.document
      Object.assign(globalThis, {
        sessionStorage: previous.sessionStorage,
        chrome: previous.chrome,
      })
    },
  }
}

async function icimsRule() {
  const { default: icimsConfig } = await import('./icims.ts')
  return icimsConfig()
}

test('the first iCIMS fill attaches the saved resume, and a reload does not attach it again', async () => {
  // A hidden Replace Resume template is on the empty form. It is not an
  // accepted resume. Page-load autofill and the popup Auto-fill button both
  // come through this site rule.
  const hiddenReplace = labeledControl('Replace Resume', { hidden: true })
  const harness = installIcimsHarness()
  try {
    const rule = await icimsRule()
    const first = fileInput('Resume Choose File', resumeDocument({ nodes: [hiddenReplace.node] }))
    assert.equal(
      await rule.apply(first.input as unknown as HTMLInputElement, 'resume choose file', person),
      true,
    )
    assert.equal(first.input.files?.[0]?.name, 'Ada Lovelace.pdf')
    assert.equal(first.input.files?.[0]?.size, PDF.byteLength)
    assert.equal(
      new TextDecoder().decode(new Uint8Array(await first.input.files![0].arrayBuffer())),
      '%PDF-1.4 saved-resume',
    )
    assert.deepEqual(first.events, ['input', 'change'])
    assert.deepEqual(first.clicks, [])
    assert.deepEqual(first.submits, [])
    assert.deepEqual(hiddenReplace.clicks, [])
    assert.deepEqual(harness.messages, [{ action: 'loadSavedResume' }])

    // Same tab, new document. iCIMS changes eem on the reload. The file input
    // is empty again and the page does not yet show an accepted resume.
    resetIcimsResumeAttachMemory()
    harness.location.search = '?in_iframe=1&hrs=1&eem=second-token'
    harness.location.href = `https://${KEMIN_HOST}${harness.location.pathname}${harness.location.search}`
    const second = fileInput('Resume Choose File', resumeDocument())
    const messagesBefore = harness.messages.length
    assert.equal(
      await rule.apply(second.input as unknown as HTMLInputElement, 'resume choose file', person),
      'skip',
    )
    assert.equal(second.input.files, null)
    assert.deepEqual(second.events, [])
    assert.deepEqual(second.clicks, [])
    assert.deepEqual(second.submits, [])
    assert.equal(harness.messages.length, messagesBefore)

    const firstName = textField('PersonProfileFields.FirstName')
    const email = textField('PersonProfileFields.Email', 'email')
    assert.equal(await rule.apply(firstName as unknown as HTMLInputElement, 'first name', person), true)
    assert.equal(firstName.value, 'Jamal')
    assert.equal(await rule.apply(email as unknown as HTMLInputElement, 'email', person), true)
    assert.equal(email.value, 'fox.jamal@outlook.com')
    assert.equal(harness.messages.length, messagesBefore)

    // Another posting on this career site still gets one attach.
    resetIcimsResumeAttachMemory()
    resetIcimsSavedResumeCache()
    harness.location.pathname = '/jobs/13000/other-role/candidate'
    harness.location.search = '?in_iframe=1'
    harness.location.href = `https://${KEMIN_HOST}${harness.location.pathname}${harness.location.search}`
    const otherJob = fileInput('Resume Choose File', resumeDocument())
    assert.equal(await rule.apply(otherJob.input as unknown as HTMLInputElement, 'resume', person), true)
    assert.equal(otherJob.input.files?.[0]?.name, 'Ada Lovelace.pdf')
    assert.deepEqual(otherJob.clicks, [])
    assert.deepEqual(otherJob.submits, [])

    // A different tab does not share sessionStorage.
    Object.assign(globalThis, { sessionStorage: memoryStorage() })
    resetIcimsResumeAttachMemory()
    resetIcimsSavedResumeCache()
    harness.location.pathname = KEMIN_PATH
    harness.location.search = '?in_iframe=1'
    harness.location.href = `https://${KEMIN_HOST}${KEMIN_PATH}?in_iframe=1`
    const otherTab = fileInput('Resume Choose File', resumeDocument())
    assert.equal(await rule.apply(otherTab.input as unknown as HTMLInputElement, 'resume', person), true)
    assert.equal(otherTab.input.files?.[0]?.name, 'Ada Lovelace.pdf')
    assert.deepEqual(otherTab.clicks, [])
    assert.deepEqual(otherTab.submits, [])
  } finally {
    harness.restore()
  }
})

test('an already accepted iCIMS resume is not attached again', async () => {
  const rule = await icimsRule()

  async function assertSkipped(options: {
    topSearch?: string
    text?: string
    nodes?: Array<ReturnType<typeof labeledControl>>
  }) {
    const harness = installIcimsHarness()
    if (options.topSearch) harness.pageWindow.top = { location: keminLocation(options.topSearch) }
    const nodes = options.nodes || []
    try {
      const resume = fileInput(
        'Resume Choose File',
        resumeDocument({ text: options.text, nodes: nodes.map((entry) => entry.node) }),
      )
      assert.equal(
        await rule.apply(resume.input as unknown as HTMLInputElement, 'resume choose file', person),
        'skip',
      )
      assert.equal(resume.input.files, null)
      assert.deepEqual(resume.events, [])
      assert.deepEqual(resume.clicks, [])
      assert.deepEqual(resume.submits, [])
      assert.deepEqual(harness.messages, [])
      for (const entry of nodes) assert.deepEqual(entry.clicks, [])

      // Remembered for this tab and job, so the next reload stays off the file
      // even after the accepted-resume banner is gone.
      harness.pageWindow.top = undefined
      harness.location.search = '?in_iframe=1'
      harness.location.href = `https://${KEMIN_HOST}${KEMIN_PATH}?in_iframe=1`
      resetIcimsResumeAttachMemory()
      const again = fileInput('Resume Choose File', resumeDocument())
      assert.equal(await rule.apply(again.input as unknown as HTMLInputElement, 'resume', person), 'skip')
      assert.equal(again.input.files, null)
      assert.deepEqual(again.events, [])
      assert.deepEqual(harness.messages, [])
    } finally {
      harness.restore()
    }
  }

  const replace = labeledControl('Replace Resume')
  const submit = labeledControl('Submit Profile', { type: 'submit' })
  const finish = labeledControl('Finish', { type: 'button' })
  await assertSkipped({ nodes: [replace, submit, finish] })
  await assertSkipped({ nodes: [labeledControl('Resume202610061102.pdf')] })
  await assertSkipped({
    topSearch: '?from=profilebuilder&resumeSubmitted=1&hrs=1&eem=changing-token',
  })
})

test('the empty Kemin resume chooser still attaches the saved file, and a reload does not attach it again', async () => {
  // Fresh tab after an extension reload. The address bar has from=login and
  // accept_gdpr, and no resumeSubmitted=1. The visible chooser is only the
  // source buttons. iCIMS still keeps Replace Resume and a timestamp filename
  // in the markup, hidden with iCIMS_NoDisplay, and a visible wrapper's
  // textContent includes that hidden text.
  const harness = installIcimsHarness()
  const search = '?from=login&eem=dsu8m_bv36l1sNcHTnw_aNOHR&accept_gdpr=1'
  harness.location.search = search
  harness.location.href = `https://${KEMIN_HOST}${KEMIN_PATH}${search}`
  const chooser = 'Or please select your resume from one of the following:'
  const replace = labeledControl('Replace Resume', { className: 'iCIMS_NoDisplay' })
  replace.node.className = ''
  const filename = labeledControl('Resume202610061102.pdf', { className: 'NoDisplay' })
  const myComputer = labeledControl('My Computer')
  const googleDrive = labeledControl('Google Drive')
  const dropbox = labeledControl('Dropbox')
  const oneDrive = labeledControl('OneDrive')
  const submit = labeledControl('Submit Profile', { type: 'submit' })
  const wrapper = {
    id: 'PortalProfileFields.Resume_Content',
    textContent: `${chooser} Replace Resume Resume202610061102.pdf My Computer Google Drive Dropbox OneDrive`,
    childNodes: [
      { nodeType: 3, nodeName: '#text', nodeValue: chooser },
      replace.node,
      filename.node,
      myComputer.node,
      googleDrive.node,
      dropbox.node,
      oneDrive.node,
    ],
    parentElement: null,
    getAttribute() {
      return null
    },
  }
  replace.node.parentElement = wrapper
  filename.node.parentElement = wrapper
  const doc = resumeDocument({
    text: `${chooser} Replace Resume Resume202610061102.pdf`,
    nodes: [
      wrapper,
      replace.node,
      filename.node,
      myComputer.node,
      googleDrive.node,
      dropbox.node,
      oneDrive.node,
      submit.node,
    ],
  })
  const untouched = [replace, filename, myComputer, googleDrive, dropbox, oneDrive, submit]
  try {
    const rule = await icimsRule()
    const first = fileInput('Resume Choose File', doc)
    assert.equal(
      await rule.apply(first.input as unknown as HTMLInputElement, 'resume choose file', person),
      true,
    )
    assert.equal(first.input.files?.[0]?.name, 'Ada Lovelace.pdf')
    assert.deepEqual(first.events, ['input', 'change'])
    assert.deepEqual(first.clicks, [])
    assert.deepEqual(first.submits, [])
    assert.deepEqual(harness.messages, [{ action: 'loadSavedResume' }])
    for (const entry of untouched) assert.deepEqual(entry.clicks, [])

    resetIcimsResumeAttachMemory()
    const second = fileInput('Resume Choose File', doc)
    const messagesBefore = harness.messages.length
    assert.equal(
      await rule.apply(second.input as unknown as HTMLInputElement, 'resume choose file', person),
      'skip',
    )
    assert.equal(second.input.files, null)
    assert.deepEqual(second.events, [])
    assert.deepEqual(second.clicks, [])
    assert.deepEqual(second.submits, [])
    assert.equal(harness.messages.length, messagesBefore)
    for (const entry of untouched) assert.deepEqual(entry.clicks, [])
  } finally {
    harness.restore()
  }
})

test('a failed iCIMS resume download does not use up the one attach', async () => {
  const harness = installIcimsHarness()
  harness.saved.ok = false
  try {
    const rule = await icimsRule()
    const first = fileInput('Resume', resumeDocument())
    assert.equal(await rule.apply(first.input as unknown as HTMLInputElement, 'resume', person), 'skip')
    assert.equal(first.input.files, null)
    assert.deepEqual(first.events, [])
    assert.deepEqual(first.clicks, [])
    assert.deepEqual(first.submits, [])

    harness.saved.ok = true
    resetIcimsSavedResumeCache()
    resetIcimsResumeAttachMemory()
    const second = fileInput('Resume', resumeDocument())
    assert.equal(await rule.apply(second.input as unknown as HTMLInputElement, 'resume', person), true)
    assert.equal(second.input.files?.[0]?.name, 'Ada Lovelace.pdf')
    assert.deepEqual(second.events, ['input', 'change'])
    assert.deepEqual(second.clicks, [])
    assert.deepEqual(second.submits, [])
  } finally {
    harness.restore()
  }
})

// Live Kemin create-profile markup, captured from icims_content_iframe.
// Replace Resume and the filename label stay in the DOM with iCIMS_NoDisplay.
// Resume=false and Resume_FileName="" mean iCIMS has not accepted a file.
const KEMIN_CHOOSER_HTML = `<!doctype html><html><body>
<form id="profile">
<div class="iCIMS_ResumeSection" role="group" aria-labelledby="label_PortalProfileFields.Resume_File">
 <div class="iCIMS_InfoMsg"><label id="label_PortalProfileFields.Resume_File">Or please select your resume from one of the following:</label></div>
 <div id="PortalProfileFields.Resume_Loading" class="iCIMS_NoDisplay iCIMS_loadingImageResume">Parsing resume, please wait...</div>
 <div class="iCIMS_ResumeContentDiv" id="PortalProfileFields.Resume_Content">
  <input id="PortalProfileFields.Resume" type="hidden" value="false">
  <input id="PortalProfileFields.Resume_FileName" type="hidden" value="">
  <div id="PortalProfileFields.Resume_CurrentFile">
   <div id="PortalProfileFields.Resume_FileNameLabel" class="iCIMS_CurrentFile iCIMS_NoDisplay"><span></span></div>
   <div id="PortalProfileFields.Resume_DeleteButtonSpan" class="iCIMS_FileUploadDeleteButtonContainer iCIMS_NoDisplay">
    <button id="PortalProfileFields.Resume_Button" type="button" class="small iCIMS_Button iCIMS_DeleteButton iCIMS_SecondaryButton">Replace Resume</button>
   </div>
  </div>
  <div id="PortalProfileFields.Resume_UploadButtons" class="upload-buttons">
   <div class="iCIMS_FileUploadButtonBlock PortalProfileFields.Resume_local_ButtonContainer localButton">
    <div tabindex="0" class="iCIMS_FileFieldButton iCIMS_SecondaryButton iCIMS_resumeUpload">
     <span>My Computer (Opens new window)</span>
     <input type="file" id="PortalProfileFields.Resume_File" name="PortalProfileFields.Resume_File" tabindex="-1" aria-labelledby="label_PortalProfileFields.Resume_File" aria-required="true" onchange="this.form.submit()">
    </div>
   </div>
   <button type="button">Google Drive</button>
   <button type="button">Dropbox</button>
   <button type="button">OneDrive</button>
  </div>
 </div>
</div>
<input id="PersonProfileFields.FirstName" name="PersonProfileFields.FirstName" value="">
<input id="PersonProfileFields.LastName" name="PersonProfileFields.LastName" value="">
<input id="PersonProfileFields.Email" name="PersonProfileFields.Email" type="email" value="">
<button type="submit">Submit Profile</button>
</form>
</body></html>`

function savedResumeWire() {
  let binary = ''
  for (const byte of PDF) binary += String.fromCharCode(byte)
  // chrome.runtime.sendMessage JSON-serializes the worker reply. The Uint8Array
  // becomes a plain object. The file that arrives is bytesBase64.
  return JSON.parse(
    JSON.stringify({
      ok: true,
      fileName: 'Jamal_Fox_Resume_Feb_2026.pdf',
      mimeType: 'application/pdf',
      bytes: PDF,
      bytesBase64: btoa(binary),
    }),
  ) as { ok: boolean; fileName: string; bytesBase64: string }
}

function keminChooser(search: string) {
  const dom = new JSDOM(KEMIN_CHOOSER_HTML, {
    url: `https://${KEMIN_HOST}${KEMIN_PATH}${search}`,
  })
  class FakeDataTransfer {
    files: File[] = []
    items = {
      add: (file: File) => {
        this.files.push(file)
      },
    }
  }
  dom.window.DataTransfer = FakeDataTransfer as unknown as typeof DataTransfer
  const input = dom.window.document.getElementById('PortalProfileFields.Resume_File') as HTMLInputElement
  let files: File[] | null = null
  Object.defineProperty(input, 'files', {
    configurable: true,
    get() {
      return files
    },
    set(value: File[] | null) {
      files = value
    },
  })
  const clicks: string[] = []
  const submits: string[] = []
  dom.window.document.querySelectorAll('button, a, div, input').forEach((el) => {
    ;(el as HTMLElement).click = () => {
      clicks.push((el.textContent || (el as HTMLElement).id || 'click').replace(/\s+/g, ' ').trim())
    }
  })
  const form = input.form
  if (form) {
    form.submit = () => {
      submits.push('submit')
    }
    form.requestSubmit = () => {
      submits.push('requestSubmit')
    }
  }
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    sessionStorage: (globalThis as { sessionStorage?: unknown }).sessionStorage,
    chrome: (globalThis as { chrome?: unknown }).chrome,
  }
  const messages: unknown[] = []
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    sessionStorage: dom.window.sessionStorage,
    chrome: {
      runtime: {
        async sendMessage(message: unknown) {
          messages.push(message)
          const wire = savedResumeWire()
          assert.equal(typeof wire.bytesBase64, 'string')
          assert.equal(wire.bytesBase64.length > 0, true)
          return wire
        },
      },
    },
  })
  resetIcimsSavedResumeCache()
  resetIcimsResumeAttachMemory()
  return {
    dom,
    input,
    clicks,
    submits,
    messages,
    restore() {
      resetIcimsSavedResumeCache()
      resetIcimsResumeAttachMemory()
      globalThis.window = previous.window
      globalThis.document = previous.document
      Object.assign(globalThis, { sessionStorage: previous.sessionStorage, chrome: previous.chrome })
    },
  }
}

test('the live Kemin chooser attaches once, and an accepted reload does not', async () => {
  const search = '?from=login&eem=dsu8m_bv36l1sNcHTnw_aNOHR&accept_gdpr=1&in_iframe=1'
  const page = keminChooser(search)
  // This tab already recorded job 12279. A reload keeps that record. The page
  // itself has not accepted a resume.
  page.dom.window.sessionStorage.setItem(
    'gofillr.icims.resumeAttached',
    JSON.stringify([`${KEMIN_HOST}|12279`]),
  )
  resetIcimsResumeAttachMemory()
  try {
    const rule = await icimsRule()
    assert.equal(
      await rule.apply(page.input, 'portalprofilefields resume file my computer file', person),
      true,
    )
    assert.equal(page.input.files?.[0]?.name, 'Jamal_Fox_Resume_Feb_2026.pdf')
    assert.equal(page.messages.length, 1)
    assert.deepEqual(page.clicks, [])
    assert.deepEqual(page.submits, [])

    const firstName = page.dom.window.document.getElementById('PersonProfileFields.FirstName') as HTMLInputElement
    assert.equal(await rule.apply(firstName, 'first name', person), true)
    assert.equal(firstName.value, 'Jamal')

    // A second pass in this same document must not attach again.
    const messagesAfterFirst = page.messages.length
    assert.equal(await rule.apply(page.input, 'resume', person), 'skip')
    assert.equal(page.messages.length, messagesAfterFirst)
    assert.deepEqual(page.clicks, [])
    assert.deepEqual(page.submits, [])

    async function assertReloadSkips(mutate: (dom: JSDOM) => void) {
      const reloaded = keminChooser(search)
      mutate(reloaded.dom)
      page.dom.window.sessionStorage.clear()
      reloaded.dom.window.sessionStorage.clear()
      resetIcimsResumeAttachMemory()
      resetIcimsSavedResumeCache()
      try {
        assert.equal(await rule.apply(reloaded.input, 'resume', person), 'skip')
        assert.equal(reloaded.input.files, null)
        assert.deepEqual(reloaded.messages, [])
        assert.deepEqual(reloaded.clicks, [])
        assert.deepEqual(reloaded.submits, [])
      } finally {
        reloaded.restore()
      }
    }

    await assertReloadSkips((dom) => {
      const url = new URL(dom.window.location.href)
      url.search = '?from=profilebuilder&resumeSubmitted=1&hrs=1&eem=next-token&in_iframe=1'
      dom.window.history.replaceState({}, '', `${url.pathname}${url.search}`)
    })
    await assertReloadSkips((dom) => {
      const flag = dom.window.document.getElementById('PortalProfileFields.Resume') as HTMLInputElement
      flag.value = 'true'
    })
    await assertReloadSkips((dom) => {
      const fileName = dom.window.document.getElementById('PortalProfileFields.Resume_FileName') as HTMLInputElement
      fileName.value = 'Resume202610061102.pdf'
    })
    await assertReloadSkips((dom) => {
      const replace = dom.window.document.getElementById('PortalProfileFields.Resume_DeleteButtonSpan') as HTMLElement
      replace.className = 'iCIMS_FileUploadDeleteButtonContainer'
    })
  } finally {
    page.restore()
  }
})
})
