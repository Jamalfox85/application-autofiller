import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
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

function labeledControl(label: string, extras?: { hidden?: boolean; type?: string }) {
  const clicks: string[] = []
  const node = {
    tagName: extras?.type === 'submit' ? 'INPUT' : 'BUTTON',
    type: extras?.type || 'button',
    hidden: extras?.hidden === true,
    textContent: label,
    value: label,
    parentElement: null,
    getAttribute(name: string) {
      if (name === 'type') return extras?.type || 'button'
      if (name === 'aria-label') return label
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
  await assertSkipped({ text: 'Uploaded resume Resume202610061102.pdf' })
  await assertSkipped({
    topSearch: '?from=profilebuilder&resumeSubmitted=1&hrs=1&eem=changing-token',
  })
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
})
