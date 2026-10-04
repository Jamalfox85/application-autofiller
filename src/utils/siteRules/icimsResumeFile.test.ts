import assert from 'node:assert/strict'
import test from 'node:test'
import type { PersonalInfo } from '../../types/index.ts'
import { icimsGateMayAdvance, planIcimsFill, type IcimsControl } from './icimsFields.ts'
import { applyIcimsResumeFile, loadIcimsSavedResume, resetIcimsSavedResumeCache } from './icimsResumeFile.ts'
import { bytesToBase64 } from '../../services/savedResume.ts'

const PDF = new TextEncoder().encode('%PDF-1.4 saved-resume')

function useFakeDataTransfer() {
  const previous = globalThis.DataTransfer
  class FakeDataTransfer {
    files: File[] = []
    items = {
      add: (file: File) => {
        this.files.push(file)
      },
    }
  }
  globalThis.DataTransfer = FakeDataTransfer as unknown as typeof DataTransfer
  return () => {
    globalThis.DataTransfer = previous
  }
}

const control = (overrides: Partial<IcimsControl> = {}): IcimsControl => ({
  tagName: 'INPUT',
  type: 'file',
  ...overrides,
})

function fileInput(label: string) {
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

test('applyIcimsResumeFile selects the saved resume and does not submit', () => {
  const restore = useFakeDataTransfer()
  const saved = new File([PDF], 'Ada Lovelace.pdf', { type: 'application/pdf' })
  const { input, events, clicks, submits } = fileInput('Resume')
  try {
    assert.equal(applyIcimsResumeFile(input, saved), true)
    assert.equal(input.files?.length, 1)
    assert.equal(input.files?.[0]?.name, 'Ada Lovelace.pdf')
    assert.equal(input.files?.[0]?.size, saved.size)
    assert.equal(input.files?.[0]?.type, 'application/pdf')
    assert.deepEqual(events, ['input', 'change'])
    assert.deepEqual(clicks, [])
    assert.deepEqual(submits, [])
    assert.equal(icimsGateMayAdvance(), false)

    const empty = fileInput('Resume')
    assert.equal(applyIcimsResumeFile(empty.input, null), 'skip')
    assert.equal(empty.input.files, null)
    assert.deepEqual(empty.events, [])
    assert.deepEqual(empty.submits, [])
  } finally {
    restore()
  }
})

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
            bytesBase64: bytesToBase64(PDF),
          }
        },
      },
    },
  })
  resetIcimsSavedResumeCache()
  const restoreTransfer = useFakeDataTransfer()
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
    assert.deepEqual(messages, [{ action: 'getSavedResume' }])
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
    restoreTransfer()
    resetIcimsSavedResumeCache()
    globalThis.window = previousWindow
    Object.assign(globalThis, { chrome: previousChrome })
  }
})
