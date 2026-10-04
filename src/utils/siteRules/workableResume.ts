// The profile mirror stores resumeFileName only. Uploaded bytes live in the
// private Supabase `resumes` bucket at profiles.resume_file_path (the object
// name, `{userId}/{object}.pdf`). A filename with no bytes is not a file.

export type SavedResume = {
  name: string
  type: string
  bytes: Uint8Array
}

type ResumeBytes = Uint8Array | number[] | ArrayBuffer | string | null | undefined

export type InlineResumeFile = {
  name?: string | null
  type?: string | null
  bytes?: ResumeBytes
}

function clean(value: string | null | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim()
}

export function mimeFromResumeName(name: string): string {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
  if (ext === '.pdf') return 'application/pdf'
  if (ext === '.doc') return 'application/msword'
  if (ext === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  if (ext === '.rtf') return 'application/rtf'
  if (ext === '.odt') return 'application/vnd.oasis.opendocument.text'
  if (ext === '.txt') return 'text/plain'
  return 'application/octet-stream'
}

function fileNameFromStoragePath(filePath: string): string {
  const base = filePath.split('/').filter(Boolean).pop() || ''
  let decoded = base
  try {
    decoded = decodeURIComponent(base)
  } catch {
    decoded = base
  }
  if (!decoded || decoded === '.' || decoded === '..') return ''
  if (!/\.[A-Za-z0-9]{2,8}$/.test(decoded)) return ''
  return decoded
}

function coerceBytes(value: ResumeBytes): Uint8Array | null {
  if (value == null) return null
  if (value instanceof Uint8Array) {
    if (value.byteLength === 0) return null
    return new Uint8Array(value)
  }
  if (value instanceof ArrayBuffer) {
    if (value.byteLength === 0) return null
    return new Uint8Array(value)
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return null
    return Uint8Array.from(value)
  }
  if (typeof value !== 'string' || !value.trim()) return null
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

// Bytes already in memory (tests, or a resolved download). The filename field
// on the profile is ignored here.
export function profileSavedResume(info: {
  resumeFile?: InlineResumeFile | null
  /** Present on the profile mirror. Never turned into file bytes. */
  resumeFileName?: string | null
}): SavedResume | null {
  const file = info.resumeFile
  if (!file) return null
  const name = clean(file.name)
  const bytes = coerceBytes(file.bytes)
  if (!name || !bytes) return null
  return { name, type: clean(file.type) || mimeFromResumeName(name), bytes }
}

// A storage object. No path, or a path with no bytes, is a missing resume.
export function savedResumeFromStored(input: {
  filePath?: string | null
  fileName?: string | null
  bytes?: Uint8Array | ArrayBuffer | null
  mimeType?: string | null
}): SavedResume | null {
  const filePath = clean(input.filePath)
  if (!filePath) return null
  const bytes =
    input.bytes instanceof ArrayBuffer
      ? input.bytes.byteLength
        ? new Uint8Array(input.bytes)
        : null
      : input.bytes instanceof Uint8Array
        ? input.bytes.byteLength
          ? new Uint8Array(input.bytes)
          : null
        : null
  if (!bytes) return null
  const name = clean(input.fileName) || fileNameFromStoragePath(filePath)
  if (!name) return null
  return { name, type: clean(input.mimeType) || mimeFromResumeName(name), bytes }
}

export function savedResumeFromMessage(response: unknown): SavedResume | null {
  if (!response || typeof response !== 'object') return null
  const body = response as { ok?: unknown; name?: unknown; type?: unknown; bytes?: ResumeBytes; bytesBase64?: unknown }
  if (body.ok !== true) return null
  const inline = body.bytes ?? (typeof body.bytesBase64 === 'string' ? body.bytesBase64 : null)
  return profileSavedResume({
    resumeFile: {
      name: typeof body.name === 'string' ? body.name : '',
      type: typeof body.type === 'string' ? body.type : '',
      bytes: inline,
    },
  })
}
