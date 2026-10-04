// Puts the already-uploaded resume on a plain iCIMS choose-file input.
// Setting input.files is the same result as a person picking the file.
// This does not click the control, does not click "Autofill with resume",
// and does not submit the form.

import { fileFromSavedResumePayload } from '../../services/savedResume.ts'

type FileCarrier = {
  type?: string
  files?: ArrayLike<File> | null
  dispatchEvent?: (event: Event) => boolean
}

type FileTransfer = {
  items: { add: (file: File) => void }
  files: ArrayLike<File>
}

function transferWith(file: File): FileTransfer {
  const DataTransferCtor = (globalThis as { DataTransfer?: new () => DataTransfer }).DataTransfer
  if (typeof DataTransferCtor === 'function') {
    const transfer = new DataTransferCtor()
    transfer.items.add(file)
    return transfer
  }
  return {
    items: { add() {} },
    files: [file],
  }
}

export function applyIcimsResumeFile(input: FileCarrier, file: File | null): boolean | 'skip' {
  if ((input.type || '').toLowerCase() !== 'file' || !file) return 'skip'
  try {
    const transfer = transferWith(file)
    input.files = transfer.files
    input.dispatchEvent?.(new Event('input', { bubbles: true }))
    input.dispatchEvent?.(new Event('change', { bubbles: true }))
  } catch {
    return 'skip'
  }
  const selected = input.files?.[0]
  if (!selected || selected.name !== file.name || selected.size !== file.size) return 'skip'
  return true
}

let inflight: Promise<File | null> | null = null

export function resetIcimsSavedResumeCache() {
  inflight = null
}

async function requestSavedResume(): Promise<File | null> {
  const runtime = (globalThis as { chrome?: { runtime?: { sendMessage?: (message: unknown) => Promise<unknown> } } })
    .chrome?.runtime
  if (!runtime?.sendMessage) return null
  const response = (await runtime.sendMessage({ action: 'getSavedResume' })) as {
    ok?: boolean
    fileName?: unknown
    mimeType?: unknown
    bytesBase64?: unknown
  } | null
  if (!response?.ok) return null
  return fileFromSavedResumePayload(response)
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
