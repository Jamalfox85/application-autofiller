// The resume the user already uploaded lives in the private `resumes` bucket.
// `profiles.resume_file_path` is `{user id}/{object name}`. The extension does not
// write that column; the resume API does. These helpers only recognize a path we
// are willing to download and the name Ashby should show.

const RESUME_OBJECT_PATH =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[^/\\]+$/i

export const MAX_SAVED_RESUME_BYTES = 10 * 1024 * 1024

export function supabaseAuthStorageKey(supabaseUrl: string): string | null {
  try {
    const host = new URL(supabaseUrl).hostname
    const ref = host.split('.')[0]
    if (!ref) return null
    return `sb-${ref}-auth-token`
  } catch {
    return null
  }
}

export function savedResumeObjectPath(path: string | null | undefined): string | null {
  const value = (path || '').trim().replace(/^\/+/, '')
  if (!RESUME_OBJECT_PATH.test(value)) return null
  if (value.includes('..')) return null
  return value
}

export function savedResumeOwnedBy(path: string, userId: string): boolean {
  const folder = path.slice(0, path.indexOf('/'))
  return folder.toLowerCase() === userId.trim().toLowerCase()
}

function extensionOf(name: string): string {
  const base = name.split(/[/\\]/).pop() || ''
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return ''
  return base.slice(dot + 1).toLowerCase()
}

export function savedResumeDisplayName(
  fileName: string | null | undefined,
  storagePath: string,
): string {
  const candidate = (fileName || '').replace(/[\u0000-\u001f]/g, '').trim()
  const base = candidate.split(/[/\\]/).filter(Boolean).pop() || ''
  const tail = storagePath.split('/').pop() || 'resume.pdf'
  let name = base && base !== '.' && base !== '..' ? base : tail
  if (!extensionOf(name)) {
    const storageExt = extensionOf(tail)
    if (storageExt) name = `${name}.${storageExt}`
  }
  return name
}

export function savedResumeMimeType(fileName: string): string {
  switch (extensionOf(fileName)) {
    case 'pdf':
      return 'application/pdf'
    case 'doc':
      return 'application/msword'
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case 'rtf':
      return 'application/rtf'
    case 'txt':
      return 'text/plain'
    case 'odt':
      return 'application/vnd.oasis.opendocument.text'
    default:
      return 'application/octet-stream'
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function base64ToBytes(value: string): Uint8Array | null {
  try {
    const binary = atob(value)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}
