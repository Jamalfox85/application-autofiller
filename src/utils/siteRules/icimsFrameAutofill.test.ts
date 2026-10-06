import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { PersonalInfo } from '../../types/index.ts'
import { bytesToBase64 } from '../savedResumeFile.ts'
import { icimsGateMayAdvance } from './icimsFields.ts'
import { resetIcimsResumeAttachMemory, resetIcimsSavedResumeCache } from './icimsResumeFile.ts'
import {
  chooseIcimsAutofillFrameIds,
  deliverIcimsAutofill,
  embeddedIcimsFillableFields,
  icimsFrameSnapshot,
} from './icimsFrameAutofill.js'

const CHILD_URL =
  'https://careers-kemin.icims.com/jobs/12279/global-erp-business-analyst/candidate?in_iframe=1'
const TOP_URL = 'https://careers-kemin.icims.com/jobs/12279/global-erp-business-analyst/candidate'
const DOCX = new TextEncoder().encode('PK admin-resume')
const SAVED_NAME = 'admin-resume.docx'
const SECTION = [
  'Or please select your resume from one of the following',
  'My Computer',
  'Google Drive',
  'Dropbox',
  'OneDrive',
  'Autofill with resume',
  'Uploading a resume will pre-fill the profile and replace existing data',
].join('. ')

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

function plainBytes(bytes: Uint8Array): Record<string, number> {
  const plain: Record<string, number> = {}
  bytes.forEach((value, index) => {
    plain[index] = value
  })
  return plain
}

test('autofill targets the iframe that has the resume file, not the outer shell', () => {
  assert.deepEqual(
    chooseIcimsAutofillFrameIds([
      { frameId: 0, href: TOP_URL, fillableCount: 0, hasPlainResumeFile: false },
      { frameId: 4, href: CHILD_URL, fillableCount: 4, hasPlainResumeFile: true },
    ]),
    [4],
  )
  const source = icimsFrameSnapshot.toString()
  assert.doesNotMatch(source, /portalResumeName|controlType|embeddedIcimsFillableFields/)
  const moduleSource = readFileSync(new URL('./icimsFrameAutofill.js', import.meta.url), 'utf8')
  assert.doesNotMatch(moduleSource, /\.click\s*\(/)
  assert.doesNotMatch(moduleSource, /showOpenFilePicker/)
  assert.doesNotMatch(moduleSource, /\.submit\s*\(/)
  const app = readFileSync(new URL('../../App.vue', import.meta.url), 'utf8')
  assert.match(app, /autofillIcimsTab/)
  const background = readFileSync(new URL('../../../background.js', import.meta.url), 'utf8')
  assert.match(background, /action === 'autofillIcimsTab'/)
  assert.match(background, /deliverIcimsAutofill/)
})

test('a plain iCIMS resume file input in a frame receives the saved filename', async () => {
  const clicks: string[] = []
  const submits: string[] = []
  const realm = pageRealm()

  function input(overrides: {
    id: string
    name: string
    type: string
    label: string
  }) {
    const control = {
      tagName: 'INPUT',
      type: overrides.type,
      id: overrides.id,
      name: overrides.name,
      value: '',
      files: null as File[] | null,
      ownerDocument: { defaultView: realm },
      form: {
        submit() {
          submits.push('submit')
        },
        requestSubmit() {
          submits.push('requestSubmit')
        },
      },
      closest() {
        return { textContent: overrides.label }
      },
      parentElement: { textContent: overrides.label },
      getAttribute(name: string) {
        if (name === 'type') return overrides.type
        if (name === 'id') return overrides.id
        if (name === 'name') return overrides.name
        return null
      },
      click() {
        clicks.push(overrides.id || overrides.name)
      },
      dispatchEvent(event: Event) {
        return event.type === 'input' || event.type === 'change'
      },
    }
    return control
  }

  const resume = input({
    id: 'PortalProfileFields.Resume_File',
    name: 'PortalProfileFields.Resume_File',
    type: 'file',
    label: SECTION,
  })
  const cover = input({
    id: 'PortalProfileFields.CoverLetter_File',
    name: 'PortalProfileFields.CoverLetter_File',
    type: 'file',
    label: `${SECTION} Cover letter`,
  })
  const parser = input({
    id: 'parserResume',
    name: 'parserResume',
    type: 'file',
    label: 'Autofill with resume. Upload your resume to automatically fill this application.',
  })
  const prefill = input({
    id: 'prefillResume',
    name: 'prefillResume',
    type: 'file',
    label: 'This will pre-fill the profile and replace existing data',
  })
  const cloudButtons = [
    'My Computer',
    'Google Drive',
    'Dropbox',
    'OneDrive',
    'Autofill with resume',
    'Pre-fill the profile',
    'Submit',
    'Submit Profile',
    'Finish',
  ].map((label) =>
    input({
      id: label,
      name: label,
      type: label === 'Submit' || label === 'Finish' ? 'submit' : 'button',
      label,
    }),
  )

  const childControls = [resume, cover, parser, prefill, ...cloudButtons]
  const childDoc = {
    querySelectorAll(selector: string) {
      if (selector === 'input, textarea, select') return childControls
      return []
    },
  }
  const hidden = Array.from({ length: 6 }, (_, index) =>
    input({
      id: `hidden-${index}`,
      name: `hidden-${index}`,
      type: 'hidden',
      label: '',
    }),
  )
  const captchaFile = input({
    id: 'captcha-file',
    name: 'captcha-file',
    type: 'file',
    label: 'hcaptcha',
  })
  const applicationFrame = {
    id: 'icims_content_iframe',
    src: CHILD_URL,
    contentDocument: childDoc,
    getAttribute(name: string) {
      if (name === 'src') return CHILD_URL
      if (name === 'id') return 'icims_content_iframe'
      return null
    },
  }
  const captchaFrame = {
    src: 'https://hcaptcha.com/1/widget',
    contentDocument: {
      querySelectorAll() {
        return [captchaFile]
      },
    },
    getAttribute(name: string) {
      return name === 'src' ? 'https://hcaptcha.com/1/widget' : null
    },
  }
  const topDoc = {
    querySelectorAll(selector: string) {
      if (selector === 'iframe') return [applicationFrame, captchaFrame]
      if (selector === 'input, textarea, select') return hidden
      return []
    },
  }

  const previous = {
    document: globalThis.document,
    location: globalThis.location,
    window: globalThis.window,
    chrome: (globalThis as { chrome?: unknown }).chrome,
  }

  function useDocument(doc: object, href: string) {
    Object.assign(globalThis, {
      document: doc,
      location: { href },
    })
  }

  const messages: unknown[] = []
  let saved: { ok: boolean; fileName?: string; mimeType?: string; bytes?: unknown; bytesBase64?: string } = {
    ok: true,
    fileName: SAVED_NAME,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    bytes: plainBytes(DOCX),
    bytesBase64: bytesToBase64(DOCX),
  }

  Object.assign(globalThis, {
    window: {
      location: {
        hostname: 'careers-kemin.icims.com',
        pathname: '/jobs/12279/global-erp-business-analyst/candidate',
        search: '?in_iframe=1',
        href: CHILD_URL,
      },
    },
    chrome: {
      runtime: {
        async sendMessage(message: unknown) {
          messages.push(message)
          return saved
        },
      },
    },
  })

  try {
    useDocument(topDoc, TOP_URL)
    const topSnap = icimsFrameSnapshot()
    assert.equal(hidden.length, 6)
    assert.equal(topSnap.fillableCount, 0)
    assert.equal(topSnap.hasPlainResumeFile, false)

    useDocument(childDoc, CHILD_URL)
    const childSnap = icimsFrameSnapshot()
    assert.equal(childSnap.hasPlainResumeFile, true)
    assert.ok(childSnap.fillableCount > 0)
    assert.deepEqual(
      chooseIcimsAutofillFrameIds([
        { frameId: 0, ...topSnap },
        { frameId: 4, ...childSnap },
      ]),
      [4],
    )

    const embedded = embeddedIcimsFillableFields(topDoc, (control: { type?: string; getAttribute?: (name: string) => string | null }) => {
      const type = (control.getAttribute?.('type') || control.type || '').toLowerCase()
      return type === 'hidden' || type === 'submit' || type === 'button'
    })
    assert.equal(embedded.includes(resume), true)
    assert.equal(embedded.includes(hidden[0]), false)
    assert.equal(embedded.includes(captchaFile), false)
    assert.equal(embedded.includes(cloudButtons[0]), false)

    const { default: icimsConfig } = await import('./icims.ts')
    const rule = icimsConfig()
    resetIcimsSavedResumeCache()
    resetIcimsResumeAttachMemory()

    const sent: number[] = []
    const result = await deliverIcimsAutofill(11, {
      scripting: {
        async executeScript() {
          return [
            { frameId: 0, result: topSnap },
            { frameId: 4, result: childSnap },
          ]
        },
      },
      tabs: {
        async sendMessage(_tabId: number, message: { action?: string }, options: { frameId?: number }) {
          assert.equal(message.action, 'autofill')
          const frameId = options.frameId ?? 0
          sent.push(frameId)
          if (frameId !== 4) return { success: false, message: 'No fillable fields found' }
          for (const control of embedded) {
            const fieldText = `${control.name || ''} ${control.id || ''} ${control.type || ''}`
            await rule.apply(control as unknown as HTMLInputElement, fieldText, {} as PersonalInfo)
          }
          return { success: true, fieldsCount: 1, message: 'Filled 1 fields' }
        },
      },
    })

    assert.deepEqual(sent, [4])
    assert.equal(result.success, true)
    assert.equal(resume.files?.length, 1)
    assert.equal(resume.files?.[0]?.name, SAVED_NAME)
    assert.equal(resume.files?.[0]?.size, DOCX.byteLength)
    assert.equal(
      new TextDecoder().decode(new Uint8Array(await resume.files![0].arrayBuffer())),
      'PK admin-resume',
    )
    assert.equal(cover.files, null)
    assert.equal(parser.files, null)
    assert.equal(prefill.files, null)
    assert.equal(captchaFile.files, null)
    assert.deepEqual(clicks, [])
    assert.deepEqual(submits, [])
    assert.equal(icimsGateMayAdvance(), false)
    assert.deepEqual(messages, [{ action: 'loadSavedResume' }])

    resume.files = null
    messages.length = 0
    saved = { ok: false }
    resetIcimsSavedResumeCache()
    assert.equal(
      await rule.apply(resume as unknown as HTMLInputElement, 'portalprofilefields.resume_file file', {} as PersonalInfo),
      'skip',
    )
    assert.equal(resume.files, null)
    assert.deepEqual(clicks, [])
    assert.deepEqual(submits, [])
  } finally {
    resetIcimsSavedResumeCache()
    resetIcimsResumeAttachMemory()
    Object.assign(globalThis, previous)
  }
})
