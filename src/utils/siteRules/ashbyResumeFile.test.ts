import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { describe, it } from 'node:test'
import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)
const FileList = require('jsdom/lib/generated/idl/FileList.js')
const idlUtils = require('jsdom/lib/generated/idl/utils.js')

// jsdom has no DataTransfer. Chrome does. This stand-in builds a real jsdom
// FileList so assigning input.files behaves the way the browser does.
function installDataTransfer(window: Window & typeof globalThis) {
  if (typeof window.DataTransfer === 'function') return
  window.DataTransfer = class DataTransfer {
    list: FileList
    items: { add: (file: File) => void }
    constructor() {
      this.list = FileList.create(window, [], {})
      this.items = {
        add: (file: File) => {
          idlUtils.implForWrapper(this.list).push(idlUtils.implForWrapper(file))
        },
      }
    }
    get files() {
      return this.list
    }
  } as unknown as typeof DataTransfer
}
import { cloneDefaultPersonalInfo } from '../../lib/personalInfoDefaults.ts'
import ashbyConfig from './ashby.ts'
import {
  attachResumeToFileInput,
  fileFromSavedResume,
  isAshbyAutofillResumeText,
  isAshbyPlainResumeFile,
  resetAshbySavedResumeRequest,
} from './ashbyResumeFile.ts'

describe('Ashby plain resume file', () => {
  it('recognizes the resume chooser and not a cover letter or autofill control', () => {
    assert.equal(
      isAshbyPlainResumeFile({ path: '_systemfield_resume', title: 'Resume', type: 'file' }),
      true,
    )
    assert.equal(isAshbyPlainResumeFile({ path: 'question', title: 'Upload', type: 'file' }), true)
    assert.equal(isAshbyPlainResumeFile({ path: 'question', title: 'Upload file', type: 'file' }), true)
    assert.equal(isAshbyPlainResumeFile({ path: 'question', title: 'Choose file', type: 'file' }), true)
    assert.equal(isAshbyPlainResumeFile({ path: 'question', title: 'Please upload your resume', type: 'file' }), true)
    assert.equal(isAshbyPlainResumeFile({ path: 'cover_letter', title: 'Cover Letter', type: 'file' }), false)
    assert.equal(isAshbyPlainResumeFile({ path: 'portfolio', title: 'Portfolio', type: 'file' }), false)
    assert.equal(
      isAshbyPlainResumeFile({
        path: '',
        title: 'Autofill from resume',
        type: 'file',
        autofillFromResume: true,
      }),
      false,
    )
    assert.equal(isAshbyAutofillResumeText('Autofill from resume'), true)
    assert.equal(isAshbyAutofillResumeText('Autofill with resume'), true)
    assert.equal(isAshbyAutofillResumeText('Resume'), false)
  })
})

function applicationDom() {
  const dom = new JSDOM(
    `<div class="ashby-application-form-container">
      <div class="ashby-application-form-autofill-input-root">
        <div>
          <input type="file" id="autofill-file" />
          <h3>Autofill from resume</h3>
          <button type="button" id="autofill-btn">Upload file</button>
        </div>
      </div>
      <div class="ashby-application-form-field-entry" data-field-path="_systemfield_resume">
        <label class="ashby-application-form-question-title">Resume</label>
        <div class="ashby-application-form-input-file">
          <input type="file" id="_systemfield_resume" />
          <button type="button" id="upload-btn">Upload File</button>
        </div>
      </div>
      <div class="ashby-application-form-field-entry" data-field-path="cover_letter">
        <label class="ashby-application-form-question-title">Cover Letter</label>
        <input type="file" id="cover" />
        <button type="button">Upload File</button>
      </div>
      <div class="ashby-application-form-field-entry" data-field-path="plain_choose">
        <label class="ashby-application-form-question-title">Choose file</label>
        <input type="file" id="plain-choose" />
      </div>
      <div class="ashby-application-form-field-entry" data-field-path="portfolio">
        <label class="ashby-application-form-question-title">Portfolio</label>
        <input type="file" id="portfolio" />
        <button type="button">Upload File</button>
      </div>
      <input id="name" type="text" />
    </div>`,
    { url: 'https://jobs.ashbyhq.com/notion/job/application', pretendToBeVisual: true },
  )
  installDataTransfer(dom.window)
  return dom
}

describe('Ashby apply attaches the saved resume', () => {
  it('sets the resume file and the choose-file field, and does not drive autofill or other uploads', async () => {
    const dom = applicationDom()
    const previousDocument = globalThis.document
    const previousChrome = (globalThis as { chrome?: unknown }).chrome
    const calls: unknown[] = []
    globalThis.document = dom.window.document
    ;(globalThis as { chrome?: unknown }).chrome = {
      runtime: {
        sendMessage: async (message: unknown) => {
          calls.push(message)
          return {
            ok: true,
            fileName: 'Ada Lovelace.pdf',
            mimeType: 'application/pdf',
            bytesBase64: btoa('resume-bytes'),
          }
        },
      },
    }

    const clicks: string[] = []
    for (const button of dom.window.document.querySelectorAll('button')) {
      button.addEventListener('click', () => clicks.push(button.id || button.textContent || ''))
    }
    const resume = dom.window.document.querySelector<HTMLInputElement>('#_systemfield_resume')!
    const changed: string[] = []
    resume.addEventListener('change', () => changed.push(resume.files?.[0]?.name || ''))

    try {
      const rule = ashbyConfig()
      rule.prepareFill?.()
      const info = cloneDefaultPersonalInfo()
      info.firstName = 'Ada'
      info.resumeFileName = 'Ada Lovelace.pdf'
      const read = (id: string) => dom.window.document.querySelector<HTMLInputElement>(`#${id}`)!

      assert.equal(await rule.apply(read('autofill-file'), '', info), 'skip')
      assert.equal(await rule.apply(read('_systemfield_resume'), '', info), true)
      assert.equal(await rule.apply(read('cover'), '', info), false)
      assert.equal(await rule.apply(read('plain-choose'), '', info), true)
      assert.equal(await rule.apply(read('portfolio'), '', info), false)

      assert.equal(read('_systemfield_resume').files?.[0]?.name, 'Ada Lovelace.pdf')
      assert.equal(read('_systemfield_resume').files?.[0]?.type, 'application/pdf')
      assert.equal(read('plain-choose').files?.[0]?.name, 'Ada Lovelace.pdf')
      assert.equal(read('autofill-file').files?.length ?? 0, 0)
      assert.equal(read('cover').files?.length ?? 0, 0)
      assert.equal(read('portfolio').files?.length ?? 0, 0)
      assert.deepEqual(changed, ['Ada Lovelace.pdf'])
      assert.deepEqual(clicks, [])
      assert.deepEqual(calls, [{ action: 'readSavedResume' }])
    } finally {
      resetAshbySavedResumeRequest()
      globalThis.document = previousDocument
      ;(globalThis as { chrome?: unknown }).chrome = previousChrome
      dom.window.close()
    }
  })

  it('leaves the chooser empty when the profile has no reachable file', async () => {
    const dom = applicationDom()
    const previousDocument = globalThis.document
    const previousChrome = (globalThis as { chrome?: unknown }).chrome
    globalThis.document = dom.window.document
    ;(globalThis as { chrome?: unknown }).chrome = {
      runtime: {
        sendMessage: async () => ({ ok: false }),
      },
    }
    try {
      const rule = ashbyConfig()
      rule.prepareFill?.()
      const resume = dom.window.document.querySelector<HTMLInputElement>('#_systemfield_resume')!
      assert.equal(await rule.apply(resume, '', cloneDefaultPersonalInfo()), 'skip')
      assert.equal(resume.files?.length ?? 0, 0)
    } finally {
      resetAshbySavedResumeRequest()
      globalThis.document = previousDocument
      ;(globalThis as { chrome?: unknown }).chrome = previousChrome
      dom.window.close()
    }
  })

  it('attach writes the file onto the input that received change', () => {
    const dom = applicationDom()
    const input = dom.window.document.querySelector<HTMLInputElement>('#_systemfield_resume')!
    const file = fileFromSavedResume(input, {
      fileName: 'Ada Lovelace.pdf',
      mimeType: 'application/pdf',
      bytesBase64: btoa('resume-bytes'),
    })
    assert.ok(file)
    let seen = ''
    input.addEventListener('change', () => {
      seen = input.files?.[0]?.name || ''
    })
    assert.equal(attachResumeToFileInput(input, file), true)
    assert.equal(seen, 'Ada Lovelace.pdf')
    dom.window.close()
  })
})
