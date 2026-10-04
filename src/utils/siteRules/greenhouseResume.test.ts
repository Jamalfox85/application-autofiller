import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import type { PersonalInfo } from '../../types/index.ts'
import greenhouseConfig from './greenhouse.ts'
import {
  greenhouseResumeDecision,
  resetGreenhouseSavedResumeRequest,
} from './greenhouseResume.ts'

const DOCX = new TextEncoder().encode('PK saved-resume')
const SAVED_NAME = 'quarterly-review.docx'

const FORM = `
  <form id="application-form">
    <div class="application--header--autofill-with-greenhouse">
      <button type="button" id="autofill-greenhouse">Autofill with Greenhouse</button>
    </div>
    <button type="button" id="autofill-application">Autofill my application</button>
    <button type="button" id="quick-apply">Quick Apply</button>
    <button type="button" id="autofill-resume">Autofill with resume
      <input id="parser" type="file">
    </button>
    <div role="group" aria-labelledby="upload-label-resume" class="file-upload">
      <div id="upload-label-resume" class="label upload-label">Resume/CV<span class="required">*</span></div>
      <div class="file-upload__wrapper">
        <button type="button" id="resume-attach" class="btn btn--pill">Attach</button>
        <label class="visually-hidden" for="resume">Attach</label>
        <input id="resume" class="visually-hidden" type="file">
        <p id="resume-filename"></p>
      </div>
    </div>
    <div role="group" aria-labelledby="upload-label-cover_letter" class="file-upload">
      <div id="upload-label-cover_letter" class="label upload-label">Cover Letter</div>
      <button type="button" id="cover-attach">Attach</button>
      <label class="visually-hidden" for="cover_letter">Attach</label>
      <input id="cover_letter" type="file">
    </div>
    <div role="group" aria-labelledby="upload-label-sample" class="file-upload">
      <div id="upload-label-sample" class="upload-label">Work sample</div>
      <button type="button">Attach</button>
      <label for="work_sample">Attach</label>
      <input id="work_sample" type="file">
    </div>
    <button type="submit" id="submit">Submit application</button>
  </form>
  <div class="field" id="choose-field">
    <label for="cv">Résumé</label>
    <button type="button" id="choose-file">Choose file</button>
    <input id="cv" type="file">
  </div>
`

function installDataTransfer(view: Window & typeof globalThis) {
  class DataTransfer {
    private entries: File[] = []
    items = {
      add: (file: File) => {
        this.entries.push(file)
      },
    }
    get files() {
      const entries = this.entries
      return {
        length: entries.length,
        item: (index: number) => entries[index] ?? null,
        0: entries[0],
      } as unknown as FileList
    }
  }
  view.DataTransfer = DataTransfer as unknown as typeof DataTransfer
}

function trackFiles(input: HTMLInputElement) {
  let stored: FileList | null = null
  Object.defineProperty(input, 'files', {
    configurable: true,
    get: () => stored,
    set: (value: FileList) => {
      stored = value
    },
  })
}

function greenhouseDom() {
  const dom = new JSDOM(`<!doctype html><body>${FORM}</body>`)
  const view = dom.window as unknown as Window & typeof globalThis
  installDataTransfer(view)
  const doc = view.document
  const clicks: string[] = []
  const focused: string[] = []
  const submits: string[] = []
  const origFocus = view.HTMLElement.prototype.focus
  view.HTMLElement.prototype.focus = function (this: HTMLElement, ...args: unknown[]) {
    focused.push(this.id || (this.textContent || '').replace(/\s+/g, ' ').trim() || this.tagName)
    return origFocus.apply(this, args as [])
  }
  doc.addEventListener(
    'click',
    (event) => {
      const target = event.target as HTMLElement | null
      clicks.push(target?.id || (target?.textContent || '').replace(/\s+/g, ' ').trim() || 'click')
    },
    true,
  )
  doc.getElementById('application-form')?.addEventListener('submit', (event) => {
    event.preventDefault()
    submits.push('submit')
  })
  for (const id of ['resume', 'cover_letter', 'work_sample', 'parser', 'cv']) {
    const input = doc.getElementById(id) as HTMLInputElement
    trackFiles(input)
    input.addEventListener('focus', () => focused.push(`event:${id}`))
  }
  const resume = doc.getElementById('resume') as HTMLInputElement
  resume.addEventListener('change', () => {
    const slot = doc.getElementById('resume-filename')
    if (slot) slot.textContent = resume.files?.[0]?.name || ''
  })
  return { doc, clicks, focused, submits }
}

function savedMessage(fileName = SAVED_NAME) {
  return {
    ok: true,
    fileName,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    bytes: DOCX,
  }
}

async function withResume(message: unknown, run: () => Promise<void>) {
  const previousChrome = (globalThis as { chrome?: unknown }).chrome
  const messages: unknown[] = []
  Object.assign(globalThis, {
    chrome: {
      runtime: {
        async sendMessage(payload: unknown) {
          messages.push(payload)
          return message
        },
      },
    },
  })
  resetGreenhouseSavedResumeRequest()
  try {
    await run()
  } finally {
    resetGreenhouseSavedResumeRequest()
    Object.assign(globalThis, { chrome: previousChrome })
  }
  return messages
}

test('a plain Resume/CV attach or choose-file input is the resume, and other uploads are not', () => {
  const { doc } = greenhouseDom()
  const resume = doc.getElementById('resume') as HTMLInputElement
  const cover = doc.getElementById('cover_letter') as HTMLInputElement
  const sample = doc.getElementById('work_sample') as HTMLInputElement
  const choose = doc.getElementById('cv') as HTMLInputElement
  const parser = doc.getElementById('parser') as HTMLInputElement
  assert.equal(greenhouseResumeDecision(resume, 'resumeattachfile'), 'attach')
  assert.equal(greenhouseResumeDecision(choose, 'cvchoosefilefile'), 'attach')
  assert.equal(greenhouseResumeDecision(cover, 'coverletterattachfile'), 'skip')
  assert.equal(greenhouseResumeDecision(sample, 'worksampleattachfile'), 'skip')
  assert.equal(greenhouseResumeDecision(parser, 'autofillwithresumefile'), 'skip')
  const quick = doc.getElementById('quick-apply') as HTMLButtonElement
  assert.equal(greenhouseResumeDecision(quick as unknown as HTMLInputElement, 'quickapply'), 'skip')
})

test('the Greenhouse rule attaches the saved file on Resume/CV and leaves the other controls alone', async () => {
  const messages = await withResume(savedMessage(), async () => {
    const { doc, clicks, focused, submits } = greenhouseDom()
    const rule = greenhouseConfig()
    rule.prepareFill?.()
    const profile = {} as PersonalInfo

    assert.equal(
      await rule.apply(doc.getElementById('parser') as HTMLInputElement, 'autofillwithresumefile', profile),
      'skip',
    )
    assert.equal(
      await rule.apply(doc.getElementById('cover_letter') as HTMLInputElement, 'coverletterattachfile', profile),
      'skip',
    )
    assert.equal(
      await rule.apply(doc.getElementById('work_sample') as HTMLInputElement, 'worksampleattachfile', profile),
      'skip',
    )
    assert.equal(
      await rule.apply(doc.getElementById('resume') as HTMLInputElement, 'resumeattachfile', profile),
      true,
    )

    const resume = doc.getElementById('resume') as HTMLInputElement
    const selected = resume.files?.[0]
    assert.equal(selected?.name, SAVED_NAME)
    assert.equal(selected?.size, DOCX.byteLength)
    assert.equal(
      new TextDecoder().decode(new Uint8Array(await selected!.arrayBuffer())),
      'PK saved-resume',
    )
    assert.equal(doc.getElementById('resume-filename')?.textContent, SAVED_NAME)
    assert.equal((doc.getElementById('cover_letter') as HTMLInputElement).files, null)
    assert.equal((doc.getElementById('work_sample') as HTMLInputElement).files, null)
    assert.equal((doc.getElementById('parser') as HTMLInputElement).files, null)

    const choose = doc.getElementById('cv') as HTMLInputElement
    assert.equal(await rule.apply(choose, 'cvchoosefilefile', profile), true)
    assert.equal(choose.files?.[0]?.name, SAVED_NAME)

    assert.deepEqual(clicks, [])
    assert.deepEqual(focused, [])
    assert.deepEqual(submits, [])
  })
  assert.deepEqual(messages, [{ action: 'loadSavedResume' }])
})

test('an account with no stored file leaves the Resume/CV input blank', async () => {
  const messages = await withResume({ ok: false }, async () => {
    const { doc, clicks, focused, submits } = greenhouseDom()
    const rule = greenhouseConfig()
    rule.prepareFill?.()
    const resume = doc.getElementById('resume') as HTMLInputElement
    assert.equal(await rule.apply(resume, 'resumeattachfile', {} as PersonalInfo), 'skip')
    assert.equal(resume.files, null)
    assert.equal(doc.getElementById('resume-filename')?.textContent, '')
    assert.deepEqual(clicks, [])
    assert.deepEqual(focused, [])
    assert.deepEqual(submits, [])
  })
  assert.deepEqual(messages, [{ action: 'loadSavedResume' }])
})

test('the resume module does not click, focus, or hardcode a filename', () => {
  const source = readFileSync(new URL('./greenhouseResume.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /\.click\s*\(/)
  assert.doesNotMatch(source, /\.focus\s*\(/)
  assert.doesNotMatch(source, /admin-resume/)
  assert.doesNotMatch(source, /requestSubmit|form\.submit/)
})
