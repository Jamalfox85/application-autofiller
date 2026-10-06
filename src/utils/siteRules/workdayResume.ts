// Workday resume file attachment. The bytes come from the shared
// loadSavedResume worker. chrome.runtime.sendMessage JSON-serializes the
// reply, so `bytes` arrives as a plain object and the file is `bytesBase64`.
// A filename with no object is not a file.
//
// The My Experience dropzone's own caption is "Upload a file (5MB max)",
// "Drop files here", and "Select files". The Resume/CV (or Cover Letter)
// heading sits above that box. Cover letters stay empty. Nothing here clicks
// Autofill with Resume, Use My Last Application, or Submit.

import { assignResumeFile } from './bamboohrFields.ts'
import { fileFromSavedResumeMessage } from './bamboohrResume.ts'

const PLAIN_FILE_LABEL = /^(upload|choose file|choose a file|select file|select files)$/
const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6, legend, label, [role="heading"], [data-automation-id="formLabel"]'

function normalized(value: string | null | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function compact(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, '')
}

function withoutAutofillPhrases(value: string): string {
  return value
    .replace(/autofill with resume/gi, ' ')
    .replace(/autofill from resume/gi, ' ')
    .replace(/use my last application/gi, ' ')
    .replace(/use last application/gi, ' ')
}

function mentionsCoverLetter(value: string): boolean {
  return compact(value).includes('coverletter')
}

function mentionsResume(value: string): boolean {
  const stripped = withoutAutofillPhrases(value)
  const packed = compact(stripped)
  if (packed.includes('coverletter')) return false
  if (packed.includes('resume') || packed.includes('curriculumvitae')) return true
  return /(^|[^a-z])cv([^a-z]|$)/.test(stripped.toLowerCase())
}

function labelFor(input: HTMLInputElement): string {
  const doc = input.ownerDocument
  if (!input.id || !doc) return ''
  const safe = input.id.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return normalized(doc.querySelector(`label[for="${safe}"]`)?.textContent)
}

function accessibleName(input: HTMLInputElement): string {
  const aria = normalized(input.getAttribute('aria-label'))
  if (aria) return aria
  const labelledby = input.getAttribute('aria-labelledby')
  const doc = input.ownerDocument
  if (labelledby && doc) {
    const parts: string[] = []
    for (const id of labelledby.split(/\s+/)) {
      if (!id) continue
      const text = normalized(doc.getElementById(id)?.textContent)
      if (text) parts.push(text)
    }
    if (parts.length > 0) return parts.join(' ')
  }
  const title = normalized(input.getAttribute('title'))
  if (title) return title
  const explicit = labelFor(input)
  if (explicit) return explicit
  const wrapping = input.closest('label')
  if (wrapping) return normalized(wrapping.textContent)
  return ''
}

function nearbyCaption(input: HTMLInputElement): string {
  let node: Element | null = input.parentElement
  for (let depth = 0; depth < 5 && node; depth++) {
    const text = normalized(node.textContent)
    if (text && text.length <= 160) return text
    node = node.parentElement
  }
  return ''
}

function isFileInput(input: HTMLInputElement): boolean {
  return !!input && input.tagName === 'INPUT' && (input.getAttribute('type') || '').toLowerCase() === 'file'
}

function carriesFileInput(el: Element): boolean {
  if (el.tagName === 'INPUT' && (el.getAttribute('type') || '').toLowerCase() === 'file') return true
  return !!el.querySelector('input[type="file"]')
}

function resumeOrCoverText(value: string): string {
  const text = normalized(value)
  if (!text || text.length > 80) return ''
  if (mentionsResume(text) || mentionsCoverLetter(text)) return text
  return ''
}

// A short Resume/CV or Cover Letter caption. Dropzone buttons ("Select files")
// and Autofill with Resume are not field headings.
function fieldLabelText(el: Element): string {
  if (carriesFileInput(el)) return ''
  if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.getAttribute('role') === 'button') return ''
  const own = normalized(el.textContent)
  const heading = el.matches(HEADING_SELECTOR)
  if (!heading && own.length > 80) {
    const inner = el.querySelector(HEADING_SELECTOR)
    if (!inner || carriesFileInput(inner)) return ''
    return resumeOrCoverText(inner.textContent || '')
  }
  if (own.length > 80) return ''
  return resumeOrCoverText(own)
}

function labelFromPreviousSiblings(node: Element): string {
  let sib = node.previousElementSibling
  while (sib) {
    if (carriesFileInput(sib)) return ''
    const text = fieldLabelText(sib)
    if (text) return text
    sib = sib.previousElementSibling
  }
  return ''
}

function singleFileParent(parent: Element, input: HTMLInputElement): boolean {
  const files = parent.querySelectorAll('input[type="file"]')
  return files.length === 1 && files[0] === input
}

// The nearest Resume/CV or Cover Letter text above this input. The dropzone
// caption is shorter than 160 characters, so reading only that box never sees
// the heading. Stop at another file input so a cover letter is not read onto
// the resume, and the resume heading is not read onto the cover letter.
function sectionLabel(input: HTMLInputElement): string {
  let node: Element | null = input
  for (let depth = 0; depth < 8 && node; depth++) {
    const beside = labelFromPreviousSiblings(node)
    if (beside) return beside
    const parent = node.parentElement
    if (!parent || parent.tagName === 'BODY' || parent.tagName === 'HTML' || parent.tagName === 'FORM') break
    if (!singleFileParent(parent, input)) break
    const inside = labelInside(parent, input)
    if (inside) return inside
    node = parent
  }
  return ''
}

function labelInside(scope: Element, input: HTMLInputElement): string {
  const view = input.ownerDocument?.defaultView as { Node?: { DOCUMENT_POSITION_FOLLOWING: number } } | null
  const following = view?.Node?.DOCUMENT_POSITION_FOLLOWING ?? 4
  let best = ''
  for (const el of Array.from(scope.querySelectorAll('*'))) {
    if (el === input || el.contains(input)) continue
    if (input.compareDocumentPosition(el) & following) continue
    const text = fieldLabelText(el)
    if (text) best = text
  }
  return best
}

export function isWorkdayResumeFileInput(input: HTMLInputElement): boolean {
  if (!isFileInput(input)) return false
  const name = accessibleName(input)
  const explicit = labelFor(input)
  const nearby = nearbyCaption(input)
  const section = sectionLabel(input)
  const own = `${name} ${explicit} ${input.id || ''} ${input.getAttribute('name') || ''} ${input.getAttribute('data-automation-id') || ''}`
  if (mentionsCoverLetter(section) || mentionsCoverLetter(own)) return false
  if (mentionsCoverLetter(nearby) && !mentionsResume(own) && !mentionsResume(section)) return false
  if (mentionsResume(own) || mentionsResume(section) || mentionsResume(nearby)) return true
  if (PLAIN_FILE_LABEL.test(name) || PLAIN_FILE_LABEL.test(explicit)) {
    return !mentionsCoverLetter(nearby) && !mentionsCoverLetter(section)
  }
  return false
}

export function workdayResumeFileInput(root: ParentNode): HTMLInputElement | null {
  for (const input of Array.from(root.querySelectorAll('input'))) {
    if (isWorkdayResumeFileInput(input)) return input
  }
  return null
}

export function isWorkdayCoverLetterFileInput(input: HTMLInputElement): boolean {
  if (!isFileInput(input)) return false
  if (isWorkdayResumeFileInput(input)) return false
  const name = accessibleName(input)
  const explicit = labelFor(input)
  const nearby = nearbyCaption(input)
  const section = sectionLabel(input)
  const own = `${name} ${explicit} ${input.id || ''} ${input.getAttribute('name') || ''}`
  return mentionsCoverLetter(own) || mentionsCoverLetter(section) || mentionsCoverLetter(nearby)
}

// Inputs that already received the saved file. Workday accepts the upload,
// shows a row, and clears the input, so an empty files list is not "not yet
// attached". A different resume input on the same page is not in this set.
const resumeInputsGivenFile = new WeakSet<HTMLInputElement>()

const UPLOADED_RESUME = /successfully uploaded/i

function resumeUploadShell(input: HTMLInputElement): Element | null {
  const upload = input.closest('[data-automation-id="file-upload"]')
  if (upload) return upload
  const zone = input.closest('[data-automation-id="file-upload-drop-zone"]')
  const zoneParent = zone?.parentElement
  const doc = input.ownerDocument
  if (zoneParent && zoneParent !== doc?.body && zoneParent !== doc?.documentElement) return zoneParent
  const parent = input.parentElement
  if (!parent || parent === doc?.body || parent === doc?.documentElement) return null
  return parent
}

function shellShowsUploadedResume(shell: Element): boolean {
  if (
    shell.querySelector(
      '[data-automation-id="file-upload-item"], [data-automation-id="file-upload-item-name"]',
    )
  ) {
    return true
  }
  return UPLOADED_RESUME.test(shell.textContent || '')
}

// Workday paints "Successfully Uploaded" or a file row and then clears the
// input. A replacement input is not in the WeakSet. The empty dropzone caption
// ("Upload a file", "Drop files here", "Select files") is not an uploaded
// resume. A cover-letter success in a different upload shell is not either.
export function workdayResumeAlreadyPresent(input: HTMLInputElement): boolean {
  if (!isWorkdayResumeFileInput(input)) return false
  const shell = resumeUploadShell(input)
  if (!shell) return false
  if (shellShowsUploadedResume(shell)) return true
  const parent = shell.parentElement
  const doc = input.ownerDocument
  if (!parent || parent === doc?.body || parent === doc?.documentElement) return false
  const files = Array.from(parent.querySelectorAll('input')).filter(
    (node): node is HTMLInputElement => node.tagName === 'INPUT',
  )
  const resumeFiles = files.filter((node) => isWorkdayResumeFileInput(node))
  const coverFiles = files.filter((node) => isWorkdayCoverLetterFileInput(node))
  if (resumeFiles.length !== 1 || coverFiles.length > 0) return false
  return UPLOADED_RESUME.test(parent.textContent || '')
}

// Puts the saved file on a plain Workday resume input. Does not click the
// control, Autofill with Resume, or Submit. No file, or an empty file, leaves
// the input empty and is not remembered as attached. A dropzone that already
// shows the resume is left alone.
export async function attachWorkdaySavedResume(
  input: HTMLInputElement,
  file: File | null,
): Promise<boolean> {
  if (!isWorkdayResumeFileInput(input)) return false
  if (resumeInputsGivenFile.has(input)) return false
  if ((input.files?.length ?? 0) > 0) return false
  if (workdayResumeAlreadyPresent(input)) return false
  const assigned = await assignResumeFile(input, file)
  if (assigned) resumeInputsGivenFile.add(input)
  return assigned
}

function bytesFromBase64(value: string): Uint8Array | null {
  try {
    const binary = atob(value.trim())
    if (!binary.length) return null
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

// A Uint8Array still in this realm is a file. The object sendMessage delivers
// ({"0":80,"1":75}) is not. The worker puts the same bytes in bytesBase64.
function messageWithResumeBytes(message: unknown): unknown {
  if (!message || typeof message !== 'object') return message
  const record = message as { bytes?: unknown; bytesBase64?: unknown }
  if (typeof record.bytesBase64 !== 'string' || !record.bytesBase64.trim()) return message
  const bytes = bytesFromBase64(record.bytesBase64)
  if (!bytes) return { ...record, bytes: null }
  return { ...record, bytes }
}

export function fileFromWorkdaySavedResume(message: unknown): File | null {
  return fileFromSavedResumeMessage(messageWithResumeBytes(message))
}

export async function requestWorkdaySavedResume(): Promise<File | null> {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return null
    const message: unknown = await chrome.runtime.sendMessage({ action: 'loadSavedResume' })
    return fileFromWorkdaySavedResume(message)
  } catch {
    return null
  }
}

// A missing file is not a finished attach. The next resume input — the one
// that shows up after the first look — gets its own download. The same empty
// input is not downloaded again on every DOM change.
export function createWorkdayResumeAttempt(load: () => Promise<File | null>) {
  let done = false
  let tried: HTMLInputElement | null = null
  let pending: Promise<File | null> | null = null
  return async (root: ParentNode): Promise<boolean> => {
    if (done) return true
    const input = workdayResumeFileInput(root)
    if (input && ((input.files?.length ?? 0) > 0 || workdayResumeAlreadyPresent(input))) {
      done = true
      return true
    }
    if (!input) return false
    if (tried !== input) {
      tried = input
      pending = null
    }
    if (!pending) {
      pending = Promise.resolve()
        .then(() => load())
        .catch(() => null)
    }
    const saved = await pending
    if (!saved) return false
    done = await attachWorkdaySavedResume(input, saved)
    return done
  }
}
