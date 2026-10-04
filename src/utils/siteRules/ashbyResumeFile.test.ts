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
