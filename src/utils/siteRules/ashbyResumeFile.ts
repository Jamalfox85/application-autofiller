// Ashby hosted applications keep two different resume controls.
// "Autofill from resume" parses a file and fills the form. GoFillr already fills
// the other fields, so that control is never clicked or given a file.
// The plain resume chooser is a file input on `_systemfield_resume` (title
// "Resume", button "Upload File") or a file input whose own question is
// "Upload" / "Choose file". Attaching means setting that input's files and
// firing change, which is what the chooser itself does.

import { normalizeAshbyLabel } from './ashbyFields.ts'
import { base64ToBytes, savedResumeMimeType } from '../../services/savedResumeFile.ts'

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

export function isAshbyAutofillResumeText(value: string | null | undefined): boolean {
  const label = normalizeAshbyLabel(value)
  if (!label.includes('autofill')) return false
  return label.includes('resume') || label.includes('cv') || label.includes('application')
}

export function isAshbyAutofillResumeInput(input: HTMLElement): boolean {
  if (typeof input.closest === 'function' && input.closest(AUTOFILL_ROOT)) return true
  const scope = input.parentElement
  if (!scope) return false
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

export type SavedResumePayload = {
  fileName: string
  mimeType: string
  bytesBase64: string
}

type ResumeMessage = {
  ok?: boolean
  fileName?: unknown
  mimeType?: unknown
  bytesBase64?: unknown
}

let payloadRequest: Promise<SavedResumePayload | null> | null = null

export function resetAshbySavedResumeRequest() {
  payloadRequest = null
}

export function fileFromSavedResume(input: HTMLInputElement, payload: SavedResumePayload): File | null {
  const view = input.ownerDocument?.defaultView
  if (!view) return null
  const bytes = base64ToBytes(payload.bytesBase64)
  if (!bytes || bytes.byteLength === 0) return null
  try {
    // Copy into the document's realm. The content script and the page do not
    // share typed-array constructors, and Ashby reads the File from the page.
    const copy = new view.Uint8Array(bytes.byteLength)
    copy.set(bytes)
    const blob = new view.Blob([copy], { type: payload.mimeType })
    return new view.File([blob], payload.fileName, { type: payload.mimeType })
  } catch {
    return null
  }
}

export function attachResumeToFileInput(input: HTMLInputElement, file: File): boolean {
  if (input.disabled || (input.type || '').toLowerCase() !== 'file') return false
  const view = input.ownerDocument?.defaultView
  if (!view?.DataTransfer) return false
  try {
    const transfer = new view.DataTransfer()
    transfer.items.add(file)
    input.files = transfer.files
  } catch {
    return false
  }
  if (!input.files || input.files.length !== 1 || input.files[0]?.name !== file.name) return false
  const EventCtor = view.Event
  input.dispatchEvent(new EventCtor('input', { bubbles: true }))
  input.dispatchEvent(new EventCtor('change', { bubbles: true }))
  return true
}

async function fetchSavedResumePayload(): Promise<SavedResumePayload | null> {
  const runtime = (globalThis as { chrome?: typeof chrome }).chrome?.runtime
  if (!runtime?.sendMessage) return null
  let response: ResumeMessage | null = null
  try {
    response = (await runtime.sendMessage({ action: 'readSavedResume' })) as ResumeMessage
  } catch (error) {
    console.error('Ashby saved resume could not be read', error)
    return null
  }
  if (!response?.ok || typeof response.fileName !== 'string' || typeof response.bytesBase64 !== 'string') {
    return null
  }
  const fileName = response.fileName.trim()
  if (!fileName) return null
  const mimeType =
    typeof response.mimeType === 'string' && response.mimeType
      ? response.mimeType
      : savedResumeMimeType(fileName)
  return { fileName, mimeType, bytesBase64: response.bytesBase64 }
}

export async function loadSavedResumeFile(input: HTMLInputElement): Promise<File | null> {
  if (!payloadRequest) payloadRequest = fetchSavedResumePayload()
  const payload = await payloadRequest
  if (!payload) return null
  return fileFromSavedResume(input, payload)
}
