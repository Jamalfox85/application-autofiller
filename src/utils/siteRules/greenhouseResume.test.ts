import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'
import type { PersonalInfo } from '../../types/index.ts'
import type { SavedResumeFile } from '../../lib/savedResume.ts'

const saved: SavedResumeFile = {
  name: 'Ada Lovelace.pdf',
  mimeType: 'application/pdf',
  bytes: new Uint8Array([37, 80, 68, 70]),
}

function installDom(dom: JSDOM) {
  const win = dom.window as unknown as typeof globalThis & Window
  const assign = (key: string, value: unknown) => {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  }
  assign('window', win)
  assign('document', win.document)
  assign('HTMLElement', win.HTMLElement)
  assign('HTMLInputElement', win.HTMLInputElement)
  assign('HTMLTextAreaElement', win.HTMLTextAreaElement)
  assign('HTMLSelectElement', win.HTMLSelectElement)
  assign('Element', win.Element)
  assign('Event', win.Event)
  assign('File', win.File)
  assign('InputEvent', win.InputEvent)
  assign('MouseEvent', win.MouseEvent)
  assign('KeyboardEvent', win.KeyboardEvent)
  assign('getComputedStyle', win.getComputedStyle.bind(win))

  class PolyTransfer {
    private filesStored: File[] = []
    items = {
      add: (file: File) => {
        this.filesStored.push(file)
      },
    }
    get files() {
      const list: FileList = { length: this.filesStored.length, item: (index) => this.filesStored[index] ?? null }
      this.filesStored.forEach((file, index) => {
        ;(list as unknown as Record<number, File>)[index] = file
      })
      return list
    }
  }
  assign('DataTransfer', PolyTransfer)
  win.DataTransfer = PolyTransfer as unknown as typeof DataTransfer

  Object.defineProperty(win.HTMLInputElement.prototype, 'files', {
    configurable: true,
    enumerable: true,
    get() {
      return this._assignedFiles ?? { length: 0, item: () => null }
    },
    set(value: FileList) {
      this._assignedFiles = value
    },
  })
}

function fileName(input: HTMLInputElement): string {
  return input.files?.[0]?.name || ''
}

test('greenhouse apply attaches the saved resume to plain file inputs and skips autofill', async () => {
  const dom = new JSDOM(
    `<!doctype html><body>
      <button type="button" id="quick">Autofill with Greenhouse</button>
      <label for="resume">Resume/CV</label>
      <div class="file-upload">
        <button type="button" id="attach">Attach</button>
        <input id="resume" name="resume" type="file" />
      </div>
      <label for="upload">Upload</label>
      <input id="upload" type="file" />
      <div class="file-upload">
        <button type="button">Choose file</button>
        <input id="chooser" type="file" />
      </div>
      <label for="cover_letter">Cover Letter</label>
      <div class="file-upload">
        <button type="button">Choose file</button>
        <input id="cover_letter" name="cover_letter" type="file" />
      </div>
      <label for="parse">Autofill with resume</label>
      <input id="parse" type="file" />
      <label for="ghfill">Autofill with Greenhouse</label>
      <input id="ghfill" type="file" />
      <label for="accent">Résumé</label>
      <input id="accent" type="file" />
      <label for="notes">Notes</label>
      <textarea id="notes"></textarea>
    </body>`,
    { url: 'https://job-boards.greenhouse.io/example/jobs/1' },
  )
  installDom(dom)
  const win = dom.window
  let clicks = 0
  let focuses = 0
  win.HTMLElement.prototype.click = () => {
    clicks += 1
  }
  win.HTMLElement.prototype.focus = () => {
    focuses += 1
  }

  const { setGreenhouseResumeLoader } = await import('./greenhouseResume.ts')
  const { default: greenhouseConfig } = await import('./greenhouse.ts')
  setGreenhouseResumeLoader(async () => saved)

  const rule = greenhouseConfig()
  rule.prepareFill?.()
  const read = (id: string) => win.document.getElementById(id) as HTMLInputElement
  const info = {} as PersonalInfo

  assert.equal(await rule.apply(read('resume'), 'resume resume resume/cv file', info), true)
  assert.equal(fileName(read('resume')), 'Ada Lovelace.pdf')
  assert.equal(read('resume').files?.[0]?.type, 'application/pdf')

  const changes: string[] = []
  read('upload').addEventListener('change', () => changes.push('upload'))
  assert.equal(await rule.apply(read('upload'), 'upload upload file', info), true)
  assert.equal(fileName(read('upload')), 'Ada Lovelace.pdf')
  assert.deepEqual(changes, ['upload'])

  assert.equal(await rule.apply(read('chooser'), 'chooser file', info), true)
  assert.equal(fileName(read('chooser')), 'Ada Lovelace.pdf')

  assert.equal(await rule.apply(read('cover_letter'), 'cover letter cover letter file', info), false)
  assert.equal(fileName(read('cover_letter')), '')

  const parseChanges: string[] = []
  read('parse').addEventListener('change', () => parseChanges.push('parse'))
  assert.equal(await rule.apply(read('parse'), 'parse autofill with resume file', info), 'skip')
  assert.equal(fileName(read('parse')), '')
  assert.deepEqual(parseChanges, [])

  assert.equal(await rule.apply(read('ghfill'), 'ghfill autofill with greenhouse file', info), 'skip')
  assert.equal(fileName(read('ghfill')), '')

  assert.equal(await rule.apply(read('accent'), 'accent file', info), true)
  assert.equal(fileName(read('accent')), 'Ada Lovelace.pdf')

  assert.equal(await rule.apply(read('notes'), 'notes notes', info), false)
  assert.equal(clicks, 0)
  assert.equal(focuses, 0)
})

test('a missing saved resume leaves the file input blank', async () => {
  const dom = new JSDOM(`<label for="resume">Resume</label><input id="resume" type="file" />`, {
    url: 'https://boards.greenhouse.io/example/jobs/1',
  })
  installDom(dom)
  const { setGreenhouseResumeLoader } = await import('./greenhouseResume.ts')
  const { default: greenhouseConfig } = await import('./greenhouse.ts')
  setGreenhouseResumeLoader(async () => null)
  const input = dom.window.document.getElementById('resume') as HTMLInputElement
  const result = await greenhouseConfig().apply(input, 'resume resume file', {} as PersonalInfo)
  assert.equal(result, 'skip')
  assert.equal(fileName(input), '')
})
