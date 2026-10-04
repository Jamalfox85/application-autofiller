import {
  loadSavedResumeFromAccount,
  type SavedResumeFile,
} from '../../lib/savedResume.ts'

// Plain Greenhouse resume choosers (Resume, Upload, Choose file) get the file
// already stored on the account. "Autofill with resume" and similar controls
// are left alone: GoFillr fills the fields itself, and clicking those opens
// Greenhouse's own import.

export type GreenhouseResumeDecision = 'attach' | 'skip' | 'ignore'

let resumeLoader: () => Promise<SavedResumeFile | null> = loadSavedResumeFromAccount
let resumePromise: Promise<SavedResumeFile | null> | null = null

export function setGreenhouseResumeLoader(loader: () => Promise<SavedResumeFile | null>) {
  resumeLoader = loader
  resumePromise = null
}

export function resetGreenhouseResumeCache() {
  resumePromise = null
}

export function prefetchGreenhouseResume() {
  void loadGreenhouseResume()
}

export function greenhouseResumeDecision(
  input: HTMLInputElement,
  fieldText: string,
): GreenhouseResumeDecision {
  if ((input.type || '').toLowerCase() !== 'file') return 'ignore'
  const labels = labelText(input, fieldText)
  if (mentionsAutofill(labels)) return 'skip'
  const idName = `${input.id || ''} ${input.getAttribute('name') || ''}`
  if (hasOtherDocument(labels) && !hasResumeWord(idName)) return 'ignore'
  if (hasResumeWord(labels)) return 'attach'
  if (hasChooserLabel(labels) || hasChooserLabel(nearbyChooserText(input))) return 'attach'
  return 'ignore'
}

export function attachSavedResume(input: HTMLInputElement, saved: SavedResumeFile): boolean {
  const view = input.ownerDocument?.defaultView
  if (!view) return false
  const FileCtor = view.File
  const DataTransferCtor = view.DataTransfer
  if (typeof FileCtor !== 'function' || typeof DataTransferCtor !== 'function') return false
  const name = saved.name.trim()
  if (!name || saved.bytes.byteLength === 0) return false

  const buffer = new ArrayBuffer(saved.bytes.byteLength)
  new Uint8Array(buffer).set(saved.bytes)
  const file = new FileCtor([buffer], name, {
    type: saved.mimeType || 'application/octet-stream',
  })
  const transfer = new DataTransferCtor()
  transfer.items.add(file)
  const files = transfer.files
  if (!files || files.length === 0) return false

  const setter = Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype, 'files')?.set
  if (setter) setter.call(input, files)
  else input.files = files
  if (!input.files || input.files.length === 0) return false

  const EventCtor = view.Event
  input.dispatchEvent(new EventCtor('input', { bubbles: true }))
  input.dispatchEvent(new EventCtor('change', { bubbles: true }))
  return true
}

export async function fillGreenhouseResumeInput(
  input: HTMLInputElement,
  fieldText: string,
): Promise<boolean | 'skip'> {
  const decision = greenhouseResumeDecision(input, fieldText)
  if (decision === 'ignore') return false
  if (decision === 'skip') return 'skip'
  const saved = await loadGreenhouseResume()
  if (!saved) return 'skip'
  return attachSavedResume(input, saved) ? true : 'skip'
}

function loadGreenhouseResume(): Promise<SavedResumeFile | null> {
  if (!resumePromise) {
    resumePromise = Promise.resolve()
      .then(() => resumeLoader())
      .catch(() => null)
  }
  return resumePromise
}

function labelText(input: HTMLInputElement, fieldText: string): string {
  const doc = input.ownerDocument
  const parts: string[] = []
  const push = (value: string | null | undefined) => {
    const text = (value || '').replace(/\s+/g, ' ').trim()
    if (text && text.length <= 160) parts.push(text)
  }

  push(fieldText)
  push(input.id)
  push(input.getAttribute('name'))
  push(typeof input.className === 'string' ? input.className : '')
  push(input.getAttribute('aria-label'))
  push(input.getAttribute('title'))
  push(input.getAttribute('placeholder'))

  const labelledBy = input.getAttribute('aria-labelledby') || ''
  for (const id of labelledBy.split(/\s+/)) {
    if (!id) continue
    push(doc?.getElementById(id)?.textContent)
  }
  if (input.id && doc) {
    const view = doc.defaultView
    const escaped =
      view && typeof view.CSS?.escape === 'function' ? view.CSS.escape(input.id) : input.id.replace(/"/g, '')
    push(doc.querySelector(`label[for="${escaped}"]`)?.textContent)
  }
  push(input.closest('label')?.textContent)

  const sibling = input.previousElementSibling
  if (sibling && sibling.tagName !== 'BUTTON' && sibling.tagName !== 'INPUT') {
    push(sibling.textContent)
  }
  return parts.join(' ')
}

// Button captions such as "Choose file" sit beside the hidden input. They are
// not used to detect autofill controls, so a neighboring "Autofill with
// Greenhouse" button does not suppress the resume field and is never clicked.
// Only the widget that contains this one file input is read, so a cover-letter
// "Choose file" button cannot mark a different input as the resume.
function nearbyChooserText(input: HTMLInputElement): string {
  const widget = input.closest('.file-upload')
  const parent = input.parentElement
  const root =
    widget && widget.querySelectorAll('input[type="file"]').length === 1
      ? widget
      : parent && parent.querySelectorAll('input[type="file"]').length === 1
        ? parent
        : null
  const buttons = root
    ? Array.from(root.querySelectorAll('button, .btn'))
    : [input.previousElementSibling, input.nextElementSibling].filter(
        (el): el is Element => !!el && el.tagName === 'BUTTON',
      )
  const parts: string[] = []
  for (const el of buttons) {
    if (el === input) continue
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim()
    if (!text || text.length > 80 || mentionsAutofill(text)) continue
    parts.push(text)
  }
  return parts.join(' ')
}

function fold(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[_./-]+/g, ' ')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function mentionsAutofill(text: string): boolean {
  const compact = fold(text).replace(/ /g, '')
  return compact.includes('autofill') || compact.includes('quickapply')
}

function hasResumeWord(text: string): boolean {
  return /\b(resume|cv|curriculum vitae)\b/.test(fold(text))
}

function hasOtherDocument(text: string): boolean {
  return /\b(cover letter|portfolio|transcript|writing sample|photo|headshot)\b/.test(fold(text))
}

function hasChooserLabel(text: string): boolean {
  const folded = fold(text)
  return /\bupload\b/.test(folded) || /\bchoose file\b/.test(folded) || /\bchoose a file\b/.test(folded)
}
