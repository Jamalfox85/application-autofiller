// Puts the resume already saved on the GoFillr account onto a plain Greenhouse
// Resume/CV file input. Job-board fields keep the file input visually hidden
// and show an Attach or Choose file button next to it. Setting input.files and
// firing change is what that chooser does after the user picks a file. The
// filename is the one stored on the profile.
//
// loadSavedResume returns a Uint8Array plus bytesBase64. chrome.runtime.sendMessage
// JSON-serializes that array into a plain object, so the file is the base64 text.
//
// Cover letters and other uploads stay empty. "Autofill with resume",
// "Autofill with Greenhouse", "Autofill my application", and Quick Apply parse
// or import an application. They are not clicked or focused.

import { assignResumeFile } from './bamboohrFields.ts'
import { fileFromSavedResumeMessage } from './bamboohrResume.ts'

export type GreenhouseResumeDecision = 'attach' | 'skip' | 'ignore'

type FieldControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

let inflight: Promise<File | null> | null = null

export function resetGreenhouseSavedResumeRequest() {
  inflight = null
}

export function greenhouseResumeDecision(
  input: FieldControl,
  fieldText: string,
): GreenhouseResumeDecision {
  const spaced = controlText(input)
  const host = autofillHostText(input)
  if (mentionsAutofill(spaced) || mentionsAutofill(fieldText) || mentionsAutofill(host)) return 'skip'
  if (!isFileInput(input)) return 'ignore'
  if (mentionsOtherUpload(spaced) || mentionsOtherUpload(fieldText)) return 'skip'
  if (mentionsResume(spaced) || mentionsResume(fieldText)) return 'attach'

  // "Attach" and "Choose file" are the chrome on every Greenhouse upload,
  // including the cover letter. A different question label means this is not
  // the resume chooser. A control whose only caption is the chooser is.
  const question = questionLabel(spaced)
  if (question && !mentionsResume(question)) return 'skip'
  if (mentionsChooser(spaced) || mentionsChooser(fieldText)) return 'attach'
  return 'skip'
}

export async function applyGreenhouseResumeFile(
  input: FieldControl,
  fieldText: string,
): Promise<boolean | 'skip' | false> {
  const decision = greenhouseResumeDecision(input, fieldText)
  if (decision === 'ignore') return false
  if (decision === 'skip') return 'skip'
  const fileInput = input as HTMLInputElement
  if (fileInput.disabled || (fileInput.files?.length ?? 0) > 0) return 'skip'
  const saved = await loadGreenhouseSavedResume()
  if (!saved) return 'skip'
  return (await assignResumeFile(fileInput, saved)) ? true : 'skip'
}

function loadGreenhouseSavedResume(): Promise<File | null> {
  if (!inflight) {
    inflight = requestGreenhouseSavedResume()
      .then((file) => {
        if (!file) inflight = null
        return file
      })
      .catch(() => {
        inflight = null
        return null
      })
  }
  return inflight
}

// A typed array still in this realm is a file. After messaging, `bytes` is a
// plain object and the saved file is bytesBase64. Other boards keep their own
// decoders; this one is only used for a Greenhouse Resume/CV input.
async function requestGreenhouseSavedResume(): Promise<File | null> {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return null
    const message = await chrome.runtime.sendMessage({ action: 'loadSavedResume' })
    return fileFromGreenhouseSavedResume(message)
  } catch {
    return null
  }
}

function fileFromGreenhouseSavedResume(message: unknown): File | null {
  const direct = fileFromSavedResumeMessage(message)
  if (direct) return direct
  if (!message || typeof message !== 'object') return null
  const record = message as { bytesBase64?: unknown }
  if (typeof record.bytesBase64 !== 'string' || !record.bytesBase64.trim()) return null
  const bytes = bytesFromBase64(record.bytesBase64)
  if (!bytes) return null
  return fileFromSavedResumeMessage({ ...record, bytes })
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

function isFileInput(input: FieldControl): boolean {
  if ((input.tagName || '').toUpperCase() !== 'INPUT') return false
  const attr = input.getAttribute?.('type')
  const prop = (input as HTMLInputElement).type
  return (attr || prop || '').toLowerCase() === 'file'
}

function controlText(input: FieldControl): string {
  const parts: string[] = []
  const push = (value: string | null | undefined) => {
    const text = (value || '').replace(/\s+/g, ' ').trim()
    if (text) parts.push(text)
  }

  push(input.id)
  push(input.getAttribute('name'))
  push(input.getAttribute('aria-label'))
  push(input.getAttribute('title'))
  push(input.getAttribute('placeholder'))

  const doc = input.ownerDocument
  const labelledBy = input.getAttribute('aria-labelledby') || ''
  for (const id of labelledBy.split(/\s+/)) {
    if (!id || !doc) continue
    push(doc.getElementById(id)?.textContent)
  }
  if (input.id && doc) {
    const view = doc.defaultView
    const escaped =
      view && typeof view.CSS?.escape === 'function'
        ? view.CSS.escape(input.id)
        : input.id.replace(/"/g, '\\"')
    push(doc.querySelector(`label[for="${escaped}"]`)?.textContent)
  }
  if (typeof input.closest === 'function') push(input.closest('label')?.textContent)

  const root = singleFileRoot(input)
  if (root) {
    push(root.getAttribute('aria-label'))
    const groupLabel = root.getAttribute('aria-labelledby') || ''
    for (const id of groupLabel.split(/\s+/)) {
      if (!id || !doc) continue
      push(doc.getElementById(id)?.textContent)
    }
    push(root.querySelector('.upload-label, legend')?.textContent)
    const blob = (root.textContent || '').replace(/\s+/g, ' ').trim()
    if (blob.length <= 500) push(blob)
  }

  return parts.join(' ')
}

// The nearest button or link, and only when that control itself is an
// application-import action. The Attach button is a sibling of the file input
// on job boards, so it is not an ancestor and is never activated.
function autofillHostText(input: FieldControl): string {
  if (typeof input.closest !== 'function') return ''
  const host = input.closest('button, a, .application--header--autofill-with-greenhouse')
  if (!host || host === input) return ''
  const className = typeof (host as HTMLElement).className === 'string' ? (host as HTMLElement).className : ''
  const text = `${host.textContent || ''} ${host.getAttribute('aria-label') || ''} ${className}`
    .replace(/\s+/g, ' ')
    .trim()
  if (!text || text.length > 160) return ''
  return mentionsAutofill(text) ? text : ''
}

function singleFileRoot(input: FieldControl): HTMLElement | null {
  if (typeof input.closest !== 'function') return null
  const selectors = ['.file-upload', '.attach-or-paste', '.field', 'fieldset', '[role="group"]']
  for (const selector of selectors) {
    const root = input.closest(selector)
    if (!root) continue
    const files = root.querySelectorAll('input[type="file"]')
    if (files.length === 1 && files[0] === input) return root as HTMLElement
  }
  return null
}

function fold(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[_./-]+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function compact(value: string): string {
  return fold(value).replace(/ /g, '')
}

function mentionsAutofill(value: string): boolean {
  const packed = compact(value)
  if (!packed) return false
  if (packed.includes('quickapply')) return true
  if (!packed.includes('autofill')) return false
  return (
    packed.includes('resume') ||
    packed.includes('greenhouse') ||
    packed.includes('application') ||
    packed.includes('cv')
  )
}

function mentionsOtherUpload(value: string): boolean {
  const packed = compact(value)
  return (
    packed.includes('coverletter') ||
    packed.includes('portfolio') ||
    packed.includes('transcript') ||
    packed.includes('writingsample') ||
    packed.includes('headshot') ||
    packed.includes('photo')
  )
}

function mentionsResume(value: string): boolean {
  const folded = fold(value)
  const packed = folded.replace(/ /g, '')
  if (!packed) return false
  if (packed.includes('resume') || packed.includes('curriculumvitae')) return true
  if (/\bcv\b/.test(folded)) return true
  return packed === 'cv' || packed.startsWith('cv')
}

function mentionsChooser(value: string): boolean {
  const packed = compact(value)
  return (
    packed.includes('attach') ||
    packed.includes('choosefile') ||
    packed.includes('chooseafile') ||
    packed.includes('uploadfile') ||
    packed.includes('upload')
  )
}

// Caption left after the chooser chrome is removed. Empty means the control
// is only Attach / Choose file / Upload.
function questionLabel(spaced: string): string {
  return fold(spaced)
    .replace(
      /\b(attach|choose file|choose a file|upload file|upload|required|accepted|filetypes|file types|pdf|docx|doc|txt|rtf|dropbox|google drive|enter manually|manually)\b/g,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim()
}
