// Hosted Ashby applications keep two different resume controls.
// "Autofill from resume" parses a file and fills the form. GoFillr already fills
// the other fields, so that control is never clicked or given a file.
// The plain resume chooser is a file input on `_systemfield_resume` (title
// "Resume", button "Upload File") or a file input whose own question is
// "Upload" / "Choose file". Attaching means setting that input's files and
// firing change, which is what the chooser itself does. The bytes come from
// the shared loadSavedResume worker. chrome.runtime.sendMessage JSON-serializes
// the reply, so `bytes` arrives as a plain object and the file is `bytesBase64`.
// This does not submit the application.

import { normalizeAshbyLabel } from './ashbyFields.ts'
import { fileFromSavedResumeMessage } from './bamboohrResume.ts'

const AUTOFILL_ROOT = [
  '.ashby-application-form-autofill-input-root',
  '.ashby-application-form-autofill-pane',
  '.ashby-application-form-autofill-uploader',
].join(', ')

const EXACT_RESUME_LABELS = new Set([
  'resume',
  'cv',
  'curriculumvitae',
  'upload',
  'uploadfile',
  'choosefile',
  'chooseafile',
])

export type AshbyResumeFileTarget = {
  path?: string | null
  title?: string | null
  id?: string | null
  name?: string | null
  type?: string | null
  autofillFromResume?: boolean
}

type PageRealm = {
  File?: typeof File
  Uint8Array?: typeof Uint8Array
  DataTransfer?: typeof DataTransfer
  Event?: typeof Event
}

export type AshbyFileControl = {
  tagName?: string
  type?: string
  id?: string
  name?: string
  disabled?: boolean
  files?: FileList | null
  ownerDocument?: { defaultView?: PageRealm | null } | null
  parentElement?: ParentNode | null
  closest?: (selector: string) => Element | null
  dispatchEvent?: (event: Event) => boolean
}

export function isAshbyAutofillResumeText(value: string | null | undefined): boolean {
  const label = normalizeAshbyLabel(value)
  if (!label.includes('autofill')) return false
  return label.includes('resume') || label.includes('cv') || label.includes('application')
}

export function isAshbyAutofillResumeInput(input: AshbyFileControl): boolean {
  if (typeof input.closest === 'function' && input.closest(AUTOFILL_ROOT)) return true
  const scope = input.parentElement
  if (!scope || typeof scope.querySelectorAll !== 'function') return false
  const headings = scope.querySelectorAll('h1, h2, h3')
  for (const heading of headings) {
    if (isAshbyAutofillResumeText(heading.textContent)) return true
  }
  return false
}

export function isAshbyPlainResumeFile(target: AshbyResumeFileTarget): boolean {
  if (target.autofillFromResume) return false
  if (isAshbyAutofillResumeText(target.title)) return false
  const type = (target.type || '').toLowerCase()
  if (type !== 'file') return false

  const path = target.path || ''
  const id = target.id || ''
  const name = target.name || ''
  if (path === '_systemfield_resume' || id === '_systemfield_resume' || name === '_systemfield_resume') {
    return true
  }

  const title = normalizeAshbyLabel(target.title)
  if (!title) return false
  if (
    title.includes('cover') ||
    title.includes('letter') ||
    title.includes('portfolio') ||
    title.includes('transcript')
  ) {
    return false
  }
  if (EXACT_RESUME_LABELS.has(title)) return true
  return title.includes('resume') || title.includes('curriculumvitae')
}

let inflight: Promise<File | null> | null = null

export function resetAshbySavedResumeRequest() {
  inflight = null
}

// A Uint8Array still in this realm is a file. The object sendMessage delivers
// ({"0":80,"1":75}) is not. The worker puts the same bytes in bytesBase64.
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

function messageWithResumeBytes(message: unknown): unknown {
  if (!message || typeof message !== 'object') return message
  const record = message as { bytes?: unknown; bytesBase64?: unknown }
  if (typeof record.bytesBase64 !== 'string' || !record.bytesBase64.trim()) return message
  const bytes = bytesFromBase64(record.bytesBase64)
  // A non-empty base64 string that does not decode is not a file. Do not fall
  // back to the plain object left in `bytes`.
  if (!bytes) return { ...record, bytes: null }
  return { ...record, bytes }
}

async function requestAshbySavedResume(): Promise<File | null> {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return null
    const message: unknown = await chrome.runtime.sendMessage({ action: 'loadSavedResume' })
    return fileFromSavedResumeMessage(messageWithResumeBytes(message))
  } catch {
    return null
  }
}

export function loadAshbySavedResume(): Promise<File | null> {
  if (!inflight) {
    inflight = requestAshbySavedResume()
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

export async function attachAshbyResumeFile(input: AshbyFileControl, file: File): Promise<boolean> {
  if (!file || file.size <= 0 || !file.name) return false
  const type = (input.type || '').toLowerCase()
  const tag = (input.tagName || 'INPUT').toUpperCase()
  if (tag !== 'INPUT' || type !== 'file' || input.disabled) return false
  try {
    const view = input.ownerDocument?.defaultView
    const FileCtor = view?.File
    const DataTransferCtor = view?.DataTransfer
    if (typeof FileCtor !== 'function' || typeof DataTransferCtor !== 'function') return false
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (bytes.byteLength === 0) return false
    // Copy into the document's realm. The content script and the page do not
    // share typed-array constructors, and Ashby reads the File from the page.
    const ByteCtor = view.Uint8Array ?? Uint8Array
    const copy = new ByteCtor(bytes.byteLength)
    copy.set(bytes)
    const localFile = new FileCtor([copy], file.name, {
      type: file.type || 'application/octet-stream',
    })
    const transfer = new DataTransferCtor()
    transfer.items.add(localFile)
    input.files = transfer.files
    const assigned = input.files?.[0]
    if (!assigned || assigned.name !== file.name || assigned.size !== file.size) return false
    const EventCtor = view.Event ?? Event
    input.dispatchEvent?.(new EventCtor('input', { bubbles: true }))
    input.dispatchEvent?.(new EventCtor('change', { bubbles: true }))
    return true
  } catch {
    return false
  }
}

// 'skip' owns the control and leaves it blank. false lets another matcher look.
export async function applyAshbyResumeFile(
  input: AshbyFileControl,
  target: AshbyResumeFileTarget,
): Promise<boolean | 'skip' | false> {
  const autofill = isAshbyAutofillResumeInput(input) || !!target.autofillFromResume
  if (
    !isAshbyPlainResumeFile({
      ...target,
      type: target.type || input.type,
      autofillFromResume: autofill,
    })
  ) {
    return autofill || isAshbyAutofillResumeText(target.title) ? 'skip' : false
  }
  if (input.disabled) return 'skip'
  const saved = await loadAshbySavedResume()
  if (!saved) return 'skip'
  return (await attachAshbyResumeFile(input, saved)) ? true : 'skip'
}
