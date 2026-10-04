// Puts the resume already saved in GoFillr on a plain iCIMS choose-file input.
// The bytes come from the shared loadSavedResume worker (the same download
// BambooHR uses). Setting input.files is the same result as picking the file.
// This does not click the control, does not click "Autofill with resume",
// and does not submit the form.

import { requestSavedResume } from './bamboohrResume.ts'

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

export function loadIcimsSavedResume(): Promise<File | null> {
  if (!inflight) {
    inflight = requestSavedResume()
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
