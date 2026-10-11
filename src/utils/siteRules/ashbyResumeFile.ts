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

import { mountInToastStack } from '../../content/toastStack.ts'
import { normalizeAshbyLabel } from './ashbyFields.ts'
import { resumeBytesForAshby } from './ashbyResumePageFile.js'
import { fileFromSavedResumeMessage, resumeMimeType } from './bamboohrResume.ts'

// Long enough for the presigned POST of a normal resume. Past this, the page
// aborts the hung request instead of spinning until Ashby's own failure toast.
export const ASHBY_RESUME_UPLOAD_TIMEOUT_MS = 20000

export function ashbyResumeUploadFailure(fileName: string, error: unknown): string {
  const name = fileName.trim() || 'The resume'
  if (error === 'timeout') {
    return `${name} did not finish uploading. The upload timed out, so the resume was not saved.`
  }
  return `${name} failed to upload, so the resume was not saved.`
}

function showAshbyResumeUploadFailure(fileName: string, error: unknown): void {
  const doc = typeof document === 'undefined' ? null : document
  if (!doc || typeof doc.createElement !== 'function') return
  const toast = doc.createElement('div')
  toast.className = 'gofillr-autofill-notification'
  toast.setAttribute('role', 'alert')
  toast.dataset.gofillrResumeUpload = 'error'
  toast.textContent = ashbyResumeUploadFailure(fileName, error)
  toast.style.cssText = [
    'display:flex',
    'align-items:center',
    'max-width:360px',
    'background:#1b1b21',
    'color:#fff',
    'border:1px solid #2e2e36',
    'border-left:4px solid #b05454',
    'border-radius:10px',
    'padding:12px 14px',
    'font:13px/1.4 system-ui,sans-serif',
    'box-shadow:0 8px 24px rgba(0,0,0,.35)',
  ].join(';')
  try {
    mountInToastStack(toast, 'bottom', doc)
  } catch {
    return
  }
  doc.defaultView?.setTimeout(() => {
    toast.remove()
  }, 12000)
}

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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function assignmentToken(): string {
  return `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`.replace(/[^a-z0-9]/g, '').slice(0, 40)
}

// null: this realm should assign the file. true/false: the page world already did.
async function assignAshbyResumeOnPage(
  input: AshbyFileControl,
  file: File,
  bytes: Uint8Array,
): Promise<boolean | null> {
  const marker = input as AshbyFileControl & {
    dataset?: { gofillrResume?: string }
    setAttribute?: (name: string, value: string) => void
    removeAttribute?: (name: string) => void
  }
  const runtime = typeof chrome !== 'undefined' ? chrome.runtime : undefined
  if (!marker.dataset || typeof marker.setAttribute !== 'function' || !runtime?.id || !runtime.sendMessage) {
    return null
  }
  const token = assignmentToken()
  if (!/^[a-z0-9]{8,64}$/.test(token)) return null
  marker.dataset.gofillrResume = token
  try {
    const reply: unknown = await runtime.sendMessage({
      action: 'assignAshbyResume',
      token,
      name: file.name,
      type: resumeMimeType(file.name, file.type),
      bytesBase64: bytesToBase64(bytes),
      timeoutMs: ASHBY_RESUME_UPLOAD_TIMEOUT_MS,
    })
    const body =
      reply && typeof reply === 'object'
        ? (reply as { assigned?: unknown; uploaded?: unknown; error?: unknown })
        : undefined
    const assigned = body?.assigned
    // A content-script File is not the File Ashby reads. Never fall back to one
    // once the extension can assign the file in the page.
    if (assigned !== true) {
      showAshbyResumeUploadFailure(file.name, body?.error)
      return false
    }
    if (body?.uploaded === false) {
      showAshbyResumeUploadFailure(file.name, body.error)
      return false
    }
    if (body?.uploaded === true) return true
    const got = input.files?.[0]
    if (!got || got.name !== file.name || got.size !== bytes.byteLength) {
      showAshbyResumeUploadFailure(file.name, 'upload-failed')
      return false
    }
    return true
  } catch {
    showAshbyResumeUploadFailure(file.name, 'upload-failed')
    return false
  } finally {
    marker.removeAttribute?.('data-gofillr-resume')
  }
}

function attachAshbyResumeInRealm(input: AshbyFileControl, file: File, bytes: Uint8Array): boolean {
  const view = input.ownerDocument?.defaultView
  const FileCtor = view?.File
  const DataTransferCtor = view?.DataTransfer
  if (typeof FileCtor !== 'function' || typeof DataTransferCtor !== 'function') return false
  // Standalone copy. A File that aliases the buffer Ashby reads later can be empty.
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const localFile = new FileCtor([copy], file.name, {
    type: resumeMimeType(file.name, file.type),
    lastModified: Date.now(),
  })
  const transfer = new DataTransferCtor()
  transfer.items.add(localFile)
  input.files = transfer.files
  const assigned = input.files?.[0]
  if (!assigned || assigned.name !== file.name || assigned.size !== bytes.byteLength) return false
  const EventCtor = view.Event ?? Event
  input.dispatchEvent?.(new EventCtor('input', { bubbles: true }))
  input.dispatchEvent?.(new EventCtor('change', { bubbles: true }))
  return true
}

export async function attachAshbyResumeFile(input: AshbyFileControl, file: File): Promise<boolean> {
  if (!file || file.size <= 0 || !file.name) return false
  const type = (input.type || '').toLowerCase()
  const tag = (input.tagName || 'INPUT').toUpperCase()
  if (tag !== 'INPUT' || type !== 'file' || input.disabled) return false
  try {
    const raw = new Uint8Array(await file.arrayBuffer())
    if (raw.byteLength === 0) return false
    // Ashby rejects a resume whose text is base64 (%PDF → JVBERi, docx → UEsDB)
    // before the upload, with a red error toast.
    const bytes = resumeBytesForAshby(raw)
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) return false
    const onPage = await assignAshbyResumeOnPage(input, file, bytes)
    if (onPage != null) return onPage
    return attachAshbyResumeInRealm(input, file, bytes)
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
