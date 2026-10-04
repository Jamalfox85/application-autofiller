import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { afterEach, describe, it } from 'node:test'
import { JSDOM } from 'jsdom'
import leverConfig, { beginLeverFill, setLeverResumeSourceForTests } from './lever.ts'
import {
  LEVER_PARSE_GUARD_INSTALL,
  LEVER_PARSE_GUARD_RESTORE,
  assignLeverResumeFile,
} from './leverResumeFile.ts'

const RESUME = {
  name: 'Ada Lovelace.pdf',
  mimeType: 'application/pdf',
  bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]),
}

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

const FORM = `
  <div class="application-form">
    <ul>
      <li class="application-question resume">
        <div class="application-label">Resume/CV <span class="required">✱</span></div>
        <div class="application-field">
          <a href="#" id="attach" class="postings-btn template-btn-utility visible-resume-upload">
            <span class="filename"></span>
            <span class="default-label">ATTACH RESUME/CV</span>
            <input class="application-file-input invisible-resume-upload" data-qa="input-resume" id="resume-upload-input" name="resume" type="file">
          </a>
          <span class="resume-upload-working"><span class="resume-upload-label">Analyzing resume...</span></span>
        </div>
      </li>
      <li class="application-question">
        <div class="application-label">Cover letter</div>
        <input id="cover" name="cards[0][field1]" type="file">
      </li>
    </ul>
    <button type="button" id="autofill">Autofill with resume</button>
    <button type="button" id="btn-submit">Submit application</button>
  </div>
`

function leverDom() {
  const dom = new JSDOM(`<!doctype html><body>${FORM}</body>`)
  const view = dom.window as unknown as Window & typeof globalThis
  installDataTransfer(view)
  const doc = view.document
  const resume = doc.getElementById('resume-upload-input') as HTMLInputElement
  trackFiles(resume)
  const clicks: string[] = []
  for (const el of doc.querySelectorAll('a, button')) {
    el.addEventListener('click', () => clicks.push(el.id || (el.textContent || '').trim()))
  }
  let parseSends = 0
  const origSend = view.XMLHttpRequest.prototype.send
  view.XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, ...args: unknown[]) {
    parseSends += 1
    return origSend.apply(this, args as never)
  }
  resume.addEventListener('change', () => {
    resume.dataset.changed = '1'
    const filename = doc.querySelector('.filename')
    if (filename) filename.textContent = ''
    const working = doc.querySelector('.resume-upload-working') as HTMLElement | null
    if (working) working.style.display = 'block'
    const xhr = new view.XMLHttpRequest()
    xhr.open('POST', 'https://jobs.lever.co/parseResume')
    xhr.send()
  })
  return { view, doc, resume, clicks, parseSends: () => parseSends }
}

describe('Lever resume attach', () => {
  afterEach(() => {
    setLeverResumeSourceForTests(null)
  })

  it('sets the saved file on the plain resume input and does not drive autofill or submit', async () => {
    const { doc, resume, clicks, parseSends } = leverDom()
    setLeverResumeSourceForTests(async () => RESUME)
    beginLeverFill()

    const wrote = await leverConfig().apply(resume, '', {})
    assert.equal(wrote, true)
    assert.equal(resume.dataset.changed, '1')
    assert.equal(resume.files?.[0]?.name, 'Ada Lovelace.pdf')
    assert.equal(resume.files?.[0]?.size, RESUME.bytes.byteLength)
    assert.equal(doc.querySelector('.filename')?.textContent, 'Ada Lovelace.pdf')
    assert.equal((doc.querySelector('.default-label') as HTMLElement).style.display, 'none')
    assert.equal((doc.querySelector('.resume-upload-working') as HTMLElement).style.display, 'none')
    assert.equal(parseSends(), 0)
    assert.deepEqual(clicks, [])

    const cover = doc.getElementById('cover') as HTMLInputElement
    trackFiles(cover)
    assert.equal(await leverConfig().apply(cover, '', {}), false)
    assert.equal(cover.files, null)
  })

  it('leaves an autofill-with-resume file control alone', async () => {
    const dom = new JSDOM(`<!doctype html><body>
      <div class="application-form">
        <div class="application-label">Resume</div>
        <button type="button" id="autofill">Autofill with resume
          <input id="resume" name="resume" type="file">
        </button>
        <button type="button" id="btn-submit">Submit application</button>
      </div>
    </body>`)
    const view = dom.window as unknown as Window & typeof globalThis
    installDataTransfer(view)
    const input = view.document.getElementById('resume') as HTMLInputElement
    trackFiles(input)
    const clicks: string[] = []
    view.document.getElementById('autofill')!.addEventListener('click', () => clicks.push('autofill'))
    view.document.getElementById('btn-submit')!.addEventListener('click', () => clicks.push('submit'))
    setLeverResumeSourceForTests(async () => RESUME)
    beginLeverFill()

    const wrote = await leverConfig().apply(input, '', {})
    assert.equal(wrote, false)
    assert.equal(input.files, null)
    assert.deepEqual(clicks, [])
  })

  it('does not invent a file when the account has no saved resume', async () => {
    const { resume } = leverDom()
    setLeverResumeSourceForTests(async () => null)
    beginLeverFill()
    assert.equal(await leverConfig().apply(resume, '', {}), false)
    assert.equal(resume.files, null)
  })

  it('drops a page-world parseResume request and then restores XMLHttpRequest', () => {
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
      runScripts: 'dangerously',
      url: 'https://jobs.lever.co/acme/role/apply',
    })
    const view = dom.window
    const inject = (source: string) => {
      const script = view.document.createElement('script')
      script.textContent = source
      view.document.documentElement.appendChild(script)
      script.remove()
    }
    let sends = 0
    const orig = view.XMLHttpRequest.prototype.send
    view.XMLHttpRequest.prototype.send = function () {
      sends += 1
      return orig.apply(this, arguments as unknown as [])
    }
    inject(LEVER_PARSE_GUARD_INSTALL)
    const parsed = new view.XMLHttpRequest()
    parsed.open('POST', 'https://jobs.lever.co/parseResume')
    parsed.send()
    const other = new view.XMLHttpRequest()
    other.open('POST', 'https://jobs.lever.co/other')
    other.send()
    assert.equal(sends, 1)
    inject(LEVER_PARSE_GUARD_RESTORE)
    const again = new view.XMLHttpRequest()
    again.open('POST', 'https://jobs.lever.co/parseResume')
    again.send()
    assert.equal(sends, 2)
    assert.doesNotMatch(LEVER_PARSE_GUARD_INSTALL, /\.click\(/)
    assert.doesNotMatch(readFileSync(new URL('./leverResumeFile.ts', import.meta.url), 'utf8'), /\.click\(/)
  })

  it('assignLeverResumeFile reports success only when the file lands on the input', () => {
    const { view, resume } = leverDom()
    assert.equal(assignLeverResumeFile(resume, RESUME), true)
    assert.equal(resume.files?.[0]?.name, RESUME.name)
    const blocked = view.document.createElement('input')
    blocked.type = 'file'
    delete (view as { DataTransfer?: unknown }).DataTransfer
    assert.equal(assignLeverResumeFile(blocked, RESUME), false)
  })
})
