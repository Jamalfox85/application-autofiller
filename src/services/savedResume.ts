// The profile mirror stores resumeFileName only. The bytes live in the private
// Supabase storage bucket "resumes", at profiles.resume_file_path
// ("{userId}/resume.pdf"). Autofill reads that object. It does not write the column.

export type SavedResumeBytes = {
  fileName: string
  mimeType: string
  bytes: Uint8Array
}

export type SavedResumeMessage =
  | { ok: false }
  | { ok: true; fileName: string; mimeType: string; bytesBase64: string }

export type ResumeStorageClient = {
  userId: () => Promise<string | null>
  profileResume: (userId: string) => Promise<{ fileName: string; path: string } | null>
  download: (path: string) => Promise<{ bytes: Uint8Array; mimeType: string } | null>
}

export function isOwnerResumePath(userId: string, path: string): boolean {
  const owner = userId.trim()
  const normalized = path.trim().replace(/^\/+/, '')
  if (!owner || !normalized) return false
  if (normalized.includes('..') || normalized.includes('\\') || normalized.includes('//')) return false
  const folder = `${owner}/`
  if (!normalized.startsWith(folder)) return false
  const rest = normalized.slice(folder.length)
  return rest.length > 0 && !rest.includes('/')
}

export function safeResumeFileName(fileName: string, path: string): string {
  const picked = (fileName.trim() || path.trim()).split(/[/\\]/).pop() || ''
  const cleaned = picked.replace(/[^\w.\- ()]/g, '_').replace(/^\.+/, '')
  return cleaned || 'resume.pdf'
}

export function mimeForResume(fileName: string, reported: string): string {
  const reportedType = reported.trim().toLowerCase()
  if (reportedType && reportedType !== 'application/octet-stream') return reported.trim()
  const name = fileName.toLowerCase()
  if (name.endsWith('.pdf')) return 'application/pdf'
  if (name.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }
  if (name.endsWith('.doc')) return 'application/msword'
  return reportedType || 'application/octet-stream'
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export async function readSavedResume(client: ResumeStorageClient): Promise<SavedResumeBytes | null> {
  const userId = (await client.userId())?.trim() || ''
  if (!userId) return null
  const row = await client.profileResume(userId)
  if (!row || !isOwnerResumePath(userId, row.path)) return null
  const downloaded = await client.download(row.path.trim().replace(/^\/+/, ''))
  if (!downloaded || downloaded.bytes.byteLength === 0) return null
  const fileName = safeResumeFileName(row.fileName, row.path)
  return {
    fileName,
    mimeType: mimeForResume(fileName, downloaded.mimeType),
    bytes: downloaded.bytes,
  }
}

export function savedResumeMessage(saved: SavedResumeBytes | null): SavedResumeMessage {
  if (!saved || saved.bytes.byteLength === 0 || !saved.fileName) return { ok: false }
  return {
    ok: true,
    fileName: saved.fileName,
    mimeType: saved.mimeType || 'application/octet-stream',
    bytesBase64: bytesToBase64(saved.bytes),
  }
}

export function fileFromSavedResumePayload(payload: {
  fileName?: unknown
  mimeType?: unknown
  bytesBase64?: unknown
}): File | null {
  if (typeof payload.fileName !== 'string' || !payload.fileName.trim()) return null
  if (typeof payload.bytesBase64 !== 'string' || !payload.bytesBase64) return null
  let bytes: Uint8Array
  try {
    bytes = base64ToBytes(payload.bytesBase64)
  } catch {
    return null
  }
  if (bytes.byteLength === 0) return null
  const mimeType =
    typeof payload.mimeType === 'string' && payload.mimeType.trim()
      ? payload.mimeType
      : 'application/octet-stream'
  return new File([bytes], payload.fileName, { type: mimeType })
}
