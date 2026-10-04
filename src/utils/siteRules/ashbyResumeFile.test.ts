import assert from 'node:assert/strict'
import test from 'node:test'
import type { PersonalInfo } from '../../types/index.ts'
import {
  applyAshbyResumeFile,
  attachAshbyResumeFile,
  isAshbyPlainResumeFile,
  resetAshbySavedResumeRequest,
} from './ashbyResumeFile.ts'

const PDF = new TextEncoder().encode('%PDF-1.4 saved-resume')

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

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
    Uint8Array,
    DataTransfer: FakeDataTransfer as unknown as typeof DataTransfer,
    Event,
  }
}

function ashbyFile(options: {
  path?: string
  title?: string
  id?: string
  name?: string
  heading?: string
  autofill?: boolean
  buttonText?: string
}) {
  const events: string[] = []
  const clicks: string[] = []
  const submits: string[] = []
  const entry = {
    getAttribute(name: string) {
      if (name === 'data-field-path') return options.path ?? null
      return null
    },
    querySelector(selector: string) {
      if (selector === '.ashby-application-form-question-title' && options.title) {
        return { textContent: options.title }
      }
      return null
    },
  }
  const parent = {
    textContent: options.heading || options.buttonText || '',
    querySelectorAll(selector: string) {
      if (selector === 'h1, h2, h3' && options.heading) return [{ textContent: options.heading }]
      return []
    },
  }
  const input = {
    tagName: 'INPUT',
    type: 'file',
    id: options.id || options.path || '',
    name: options.name || '',
    disabled: false,
    files: null as File[] | null,
    ownerDocument: { defaultView: pageRealm() },
    parentElement: parent,
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
    closest(selector: string) {
      if (options.autofill && selector.includes('ashby-application-form-autofill')) {
        return { className: 'ashby-application-form-autofill-input-root' }
      }
      if (
        selector.includes('data-field-path') ||
        selector.includes('ashby-application-form-field-entry') ||
        selector.includes('ashby-application-form-container')
      ) {
        return entry
      }
      return null
    },
    getAttribute(name: string) {
      if (name === 'type') return 'file'
      if (name === 'id') return input.id
      if (name === 'name') return input.name
      return null
    },
    dispatchEvent(event: Event) {
      events.push(event.type)
      return true
    },
  }
  return { input, events, clicks, submits }
}

test('a plain Ashby resume chooser is the system field or a Resume, Upload, or Choose file question', () => {
  assert.equal(
    isAshbyPlainResumeFile({ path: '_systemfield_resume', title: 'Resume', type: 'file', id: '_systemfield_resume' }),
    true,
  )
  assert.equal(isAshbyPlainResumeFile({ title: 'Upload', type: 'file' }), true)
  assert.equal(isAshbyPlainResumeFile({ title: 'Choose file', type: 'file' }), true)
  assert.equal(isAshbyPlainResumeFile({ title: 'CV', type: 'file' }), true)
  assert.equal(isAshbyPlainResumeFile({ title: 'Cover Letter', type: 'file' }), false)
  assert.equal(isAshbyPlainResumeFile({ title: 'Portfolio', type: 'file' }), false)
  assert.equal(isAshbyPlainResumeFile({ title: 'Transcript', type: 'file' }), false)
  assert.equal(isAshbyPlainResumeFile({ title: 'Upload File', type: 'text' }), false)
  assert.equal(
    isAshbyPlainResumeFile({
      path: '_systemfield_resume',
      title: 'Autofill from resume',
      type: 'file',
      autofillFromResume: true,
    }),
    false,
  )
})

test('attachAshbyResumeFile sets the saved file and does not click or submit', async () => {
  const saved = new File([PDF], 'Ada Lovelace.pdf', { type: 'application/pdf' })
  const { input, events, clicks, submits } = ashbyFile({ path: '_systemfield_resume', title: 'Resume' })
  assert.equal(await attachAshbyResumeFile(input, saved), true)
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

  const empty = ashbyFile({ title: 'Resume', path: '_systemfield_resume' })
  assert.equal(await attachAshbyResumeFile(empty.input, new File([], 'empty.pdf')), false)
  assert.equal(empty.input.files, null)
  assert.deepEqual(empty.events, [])
})

test('the Ashby site rule attaches the saved resume on the plain chooser and leaves Autofill from resume alone', async () => {
  const previousWindow = globalThis.window
  const previousChrome = (globalThis as { chrome?: unknown }).chrome
  const messages: unknown[] = []
  Object.assign(globalThis, {
    window: {
      location: { hostname: 'jobs.ashbyhq.com', href: 'https://jobs.ashbyhq.com/acme/123/application' },
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
  resetAshbySavedResumeRequest()
  try {
    const { default: ashbyConfig } = await import('./ashby.ts')
    const rule = ashbyConfig()
    rule.prepareFill?.()

    const autofill = ashbyFile({
      heading: 'Autofill from resume',
      autofill: true,
      buttonText: 'Upload file',
    })
    assert.equal(await rule.apply(autofill.input as unknown as HTMLInputElement, '', {} as PersonalInfo), 'skip')
    assert.equal(autofill.input.files, null)
    assert.deepEqual(autofill.events, [])
    assert.deepEqual(autofill.clicks, [])
    assert.deepEqual(autofill.submits, [])
    assert.deepEqual(messages, [])

    const plain = ashbyFile({ path: '_systemfield_resume', title: 'Resume', id: '_systemfield_resume' })
    const upload = ashbyFile({ title: 'Choose file', id: 'custom-upload' })
    assert.equal(await rule.apply(plain.input as unknown as HTMLInputElement, 'resume', {} as PersonalInfo), true)
    assert.equal(await rule.apply(upload.input as unknown as HTMLInputElement, 'choose file', {} as PersonalInfo), true)
    assert.deepEqual(messages, [{ action: 'loadSavedResume' }])
    assert.equal(plain.input.files?.[0]?.name, 'Ada Lovelace.pdf')
    assert.equal(
      new TextDecoder().decode(new Uint8Array(await plain.input.files![0].arrayBuffer())),
      '%PDF-1.4 saved-resume',
    )
    assert.deepEqual(plain.events, ['input', 'change'])
    assert.deepEqual(plain.clicks, [])
    assert.deepEqual(plain.submits, [])
    assert.equal(upload.input.files?.[0]?.name, 'Ada Lovelace.pdf')
    assert.deepEqual(upload.clicks, [])

    const cover = ashbyFile({
      path: 'cover_letter',
      title: 'Cover Letter',
      id: 'cover',
      buttonText: 'Upload File',
    })
    assert.equal(await rule.apply(cover.input as unknown as HTMLInputElement, 'upload file', {} as PersonalInfo), false)
    assert.equal(cover.input.files, null)
    assert.deepEqual(cover.clicks, [])
    assert.deepEqual(messages, [{ action: 'loadSavedResume' }])

    rule.prepareFill?.()
    ;(globalThis as { chrome: { runtime: { sendMessage: (message: unknown) => Promise<unknown> } } }).chrome.runtime.sendMessage =
      async (message: unknown) => {
        messages.push(message)
        return { ok: false }
      }
    const missing = ashbyFile({ path: '_systemfield_resume', title: 'Resume', id: '_systemfield_resume' })
    assert.equal(await rule.apply(missing.input as unknown as HTMLInputElement, 'resume', {} as PersonalInfo), 'skip')
    assert.equal(missing.input.files, null)
    assert.deepEqual(missing.events, [])
    assert.deepEqual(missing.clicks, [])
    assert.deepEqual(missing.submits, [])
  } finally {
    resetAshbySavedResumeRequest()
    globalThis.window = previousWindow
    Object.assign(globalThis, { chrome: previousChrome })
  }
})

test('the plain Ashby chooser receives admin-resume.docx from the worker reply sendMessage delivers', async () => {
  const savedName = 'admin-resume.docx'
  const savedBytes = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0xff, 0x61])
  const wire = {
    ok: true as const,
    fileName: savedName,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    bytes: savedBytes,
    bytesBase64: bytesToBase64(savedBytes),
  }
  // sendMessage JSON-serializes. The Uint8Array becomes a plain object; the file is bytesBase64.
  const response = JSON.parse(JSON.stringify(wire)) as { bytes?: unknown; bytesBase64?: unknown }
  assert.equal(typeof response.bytesBase64, 'string')
  assert.equal(response.bytes instanceof Uint8Array, false)
  assert.equal(Array.isArray(response.bytes), false)

  const previousWindow = globalThis.window
  const previousChrome = (globalThis as { chrome?: unknown }).chrome
  const messages: unknown[] = []
  let reply: unknown = response
  Object.assign(globalThis, {
    window: {
      location: {
        hostname: 'jobs.ashbyhq.com',
        href: 'https://jobs.ashbyhq.com/notion/e32799d2-8ef8-4803-8189-c72514afa816/application',
      },
    },
    chrome: {
      runtime: {
        async sendMessage(message: unknown) {
          messages.push(message)
          return reply
        },
      },
    },
  })
  resetAshbySavedResumeRequest()
  try {
    const { default: ashbyConfig } = await import('./ashby.ts')
    const rule = ashbyConfig()
    rule.prepareFill?.()

    const autofill = ashbyFile({
      heading: 'Autofill from resume',
      autofill: true,
      buttonText: 'Upload file',
    })
    assert.equal(await rule.apply(autofill.input as unknown as HTMLInputElement, '', {} as PersonalInfo), 'skip')
    assert.equal(autofill.input.files, null)
    assert.deepEqual(autofill.events, [])
    assert.deepEqual(autofill.clicks, [])
    assert.deepEqual(autofill.submits, [])
    assert.deepEqual(messages, [])

    const plain = ashbyFile({
      path: '_systemfield_resume',
      title: 'Resume',
      id: '_systemfield_resume',
      buttonText: 'Upload File',
    })
    assert.equal(await rule.apply(plain.input as unknown as HTMLInputElement, 'resume', {} as PersonalInfo), true)
    const attached = plain.input.files?.[0]
    assert.equal(attached?.name, savedName)
    assert.equal(attached?.type, wire.mimeType)
    assert.equal(attached?.size, savedBytes.byteLength)
    assert.deepEqual(Array.from(new Uint8Array(await attached!.arrayBuffer())), Array.from(savedBytes))
    assert.deepEqual(plain.events, ['input', 'change'])
    assert.deepEqual(plain.clicks, [])
    assert.deepEqual(plain.submits, [])
    assert.deepEqual(messages, [{ action: 'loadSavedResume' }])

    const cover = ashbyFile({
      path: 'cover_letter',
      title: 'Cover Letter',
      id: 'cover',
      buttonText: 'Upload File',
    })
    const portfolio = ashbyFile({ path: 'portfolio', title: 'Portfolio', id: 'portfolio', buttonText: 'Upload File' })
    const transcript = ashbyFile({ path: 'transcript', title: 'Transcript', id: 'transcript', buttonText: 'Upload File' })
    assert.equal(await rule.apply(cover.input as unknown as HTMLInputElement, 'upload file', {} as PersonalInfo), false)
    assert.equal(await rule.apply(portfolio.input as unknown as HTMLInputElement, 'portfolio', {} as PersonalInfo), false)
    assert.equal(await rule.apply(transcript.input as unknown as HTMLInputElement, 'transcript', {} as PersonalInfo), false)
    assert.equal(cover.input.files, null)
    assert.equal(portfolio.input.files, null)
    assert.equal(transcript.input.files, null)
    assert.deepEqual(cover.clicks, [])
    assert.deepEqual(portfolio.clicks, [])
    assert.deepEqual(transcript.clicks, [])
    assert.deepEqual(messages, [{ action: 'loadSavedResume' }])

    rule.prepareFill?.()
    reply = { ...response, bytesBase64: undefined }
    const plainObjectOnly = ashbyFile({
      path: '_systemfield_resume',
      title: 'Resume',
      id: '_systemfield_resume',
      buttonText: 'Upload File',
    })
    assert.equal(
      await rule.apply(plainObjectOnly.input as unknown as HTMLInputElement, 'resume', {} as PersonalInfo),
      'skip',
    )
    assert.equal(plainObjectOnly.input.files, null)
    assert.deepEqual(plainObjectOnly.events, [])
    assert.deepEqual(plainObjectOnly.clicks, [])
    assert.deepEqual(plainObjectOnly.submits, [])
  } finally {
    resetAshbySavedResumeRequest()
    globalThis.window = previousWindow
    Object.assign(globalThis, { chrome: previousChrome })
  }
})

test('cover letters and the autofill widget are not given a file', async () => {
  const cover = ashbyFile({ path: 'cover_letter', title: 'Cover Letter', id: 'cover', buttonText: 'Upload File' })
  assert.equal(
    await applyAshbyResumeFile(cover.input, { path: 'cover_letter', title: 'Cover Letter', type: 'file', id: 'cover' }),
    false,
  )
  assert.equal(cover.input.files, null)
  assert.deepEqual(cover.clicks, [])

  const widget = ashbyFile({ heading: 'Autofill from resume', buttonText: 'Upload file' })
  assert.equal(await applyAshbyResumeFile(widget.input, { title: '', type: 'file' }), 'skip')
  assert.equal(widget.input.files, null)
  assert.deepEqual(widget.events, [])
  assert.deepEqual(widget.clicks, [])
  assert.deepEqual(widget.submits, [])
})
