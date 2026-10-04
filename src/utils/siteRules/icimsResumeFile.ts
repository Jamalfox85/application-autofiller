// Puts the resume already saved in GoFillr on a plain iCIMS choose-file input.
// The bytes come from the shared loadSavedResume worker (the same download
// BambooHR uses). Setting input.files is the same result as picking the file.
// This does not click the control, does not click "Autofill with resume",
// and does not submit the form.

import { fileFromSavedResumeMessage } from './bamboohrResume.ts'

type PageRealm = {
  File?: typeof File
  DataTransfer?: typeof DataTransfer
  Event?: typeof Event
}

type FileInputLike = {
  tagName?: string
  type?: string
  disabled?: boolean
  files?: ArrayLike<File> | null
  ownerDocument?: { defaultView?: PageRealm | null } | null
  getAttribute?: (name: string) => string | null
  dispatchEvent?: (event: Event) => boolean
}

export async function applyIcimsResumeFile(
  input: FileInputLike,
  file: File | null,
): Promise<boolean | 'skip'> {
  if (!file || file.size <= 0 || !file.name) return 'skip'
  const type = (input.getAttribute?.('type') || input.type || '').toLowerCase()
  const tag = (input.tagName || 'INPUT').toUpperCase()
  if (tag !== 'INPUT' || type !== 'file' || input.disabled) return 'skip'
  try {
    const view = input.ownerDocument?.defaultView
    const FileCtor = view?.File
    const DataTransferCtor = view?.DataTransfer
    if (typeof FileCtor !== 'function' || typeof DataTransferCtor !== 'function') return 'skip'
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (bytes.byteLength === 0) return 'skip'
    const localFile = new FileCtor([bytes], file.name, {
      type: file.type || 'application/octet-stream',
    })
    const transfer = new DataTransferCtor()
    transfer.items.add(localFile)
    input.files = transfer.files
    const assigned = input.files?.[0]
    if (!assigned || assigned.name !== file.name || assigned.size !== file.size) return 'skip'
    const EventCtor = view.Event ?? Event
    input.dispatchEvent?.(new EventCtor('input', { bubbles: true }))
    input.dispatchEvent?.(new EventCtor('change', { bubbles: true }))
    return true
  } catch {
    return 'skip'
  }
}

let inflight: Promise<File | null> | null = null

export function resetIcimsSavedResumeCache() {
  inflight = null
}

// loadSavedResume JSON-serializes its Uint8Array into a plain object. The file
// that survives the message is bytesBase64. A typed array still in this realm
// is accepted too. This decoder is only used for the iCIMS resume input.
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

export function fileFromIcimsSavedResumeMessage(message: unknown): File | null {
  const direct = fileFromSavedResumeMessage(message)
  if (direct) return direct
  if (!message || typeof message !== 'object') return null
  const record = message as { bytesBase64?: unknown }
  if (typeof record.bytesBase64 !== 'string' || !record.bytesBase64.trim()) return null
  const bytes = bytesFromBase64(record.bytesBase64)
  if (!bytes) return null
  return fileFromSavedResumeMessage({ ...record, bytes })
}

async function requestIcimsSavedResume(): Promise<File | null> {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return null
    const message = await chrome.runtime.sendMessage({ action: 'loadSavedResume' })
    return fileFromIcimsSavedResumeMessage(message)
  } catch {
    return null
  }
}

export function loadIcimsSavedResume(): Promise<File | null> {
  if (!inflight) {
    inflight = requestIcimsSavedResume()
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
