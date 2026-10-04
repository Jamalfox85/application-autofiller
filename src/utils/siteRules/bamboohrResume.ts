// The uploaded resume is not kept in the profile mirror. chrome.storage
// personalInfo only has resumeFileName. The bytes live in the private Supabase
// storage bucket "resumes", and profiles.resume_file_path is "{userId}/resume.pdf"
// (or .docx). profiles.resume_file_name is the original filename.
import { supabasePublicConfigError } from '../../lib/supabaseConfig.ts'

const RESUME_BUCKET = 'resumes'

export type SavedResumeDeps = {
  supabaseUrl: string
  anonKey: string
  readStorage: (key: string) => Promise<string | null>
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response>
  nowMs?: number
}

type StoredSession = {
  accessToken: string
  userId: string
}

export function supabaseAuthStorageKey(supabaseUrl: string): string | null {
  try {
    const ref = new URL(supabaseUrl).hostname.split('.')[0]
    if (!ref) return null
    return `sb-${ref}-auth-token`
  } catch {
    return null
  }
}

export function sessionFromStoredAuth(raw: string | null, nowMs: number): StoredSession | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      return null
    }
  }
  if (!parsed || typeof parsed !== 'object') return null
  const record = parsed as {
    access_token?: unknown
    expires_at?: unknown
    user?: { id?: unknown }
  }
  const accessToken = typeof record.access_token === 'string' ? record.access_token : ''
  const userId = typeof record.user?.id === 'string' ? record.user.id : ''
  if (!accessToken || !userId) return null
  if (typeof record.expires_at === 'number' && record.expires_at * 1000 <= nowMs) return null
  return { accessToken, userId }
}

// Only the signed-in user's object. A path for someone else, a URL, or a
// traversal is not a saved resume.
export function resumeObjectPath(path: string | null | undefined, userId: string): string | null {
  const raw = (path ?? '').trim().replace(/^\/+/, '')
  if (!raw || raw.includes('..') || raw.includes('\\') || raw.includes('://')) return null
  let parts = raw.split('/').filter(Boolean)
  if (parts[0] === RESUME_BUCKET) parts = parts.slice(1)
  if (parts.length < 2 || parts[0] !== userId) return null
  return parts.join('/')
}

export function resumeDisplayName(profileName: string | null | undefined, path: string): string {
  const name = (profileName ?? '').trim()
  if (name && !name.includes('/') && !name.includes('\\') && name !== '.' && name !== '..') return name
  return path.split('/').pop() || 'resume.pdf'
}

export function resumeMimeType(fileName: string, headerType?: string | null): string {
  const header = (headerType ?? '').split(';')[0].trim().toLowerCase()
  if (header && header !== 'application/octet-stream' && header !== 'binary/octet-stream') return header
  const ext = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase()
  if (ext === 'pdf') return 'application/pdf'
  if (ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  if (ext === 'doc') return 'application/msword'
  if (ext === 'rtf') return 'application/rtf'
  if (ext === 'txt') return 'text/plain'
  return header || 'application/octet-stream'
}

function authHeaders(anonKey: string, accessToken: string): Headers {
  return new Headers({
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
  })
}

export async function loadSavedResumeFile(deps: SavedResumeDeps): Promise<File | null> {
  const supabaseUrl = deps.supabaseUrl.replace(/\/$/, '')
  if (supabasePublicConfigError(supabaseUrl, deps.anonKey)) return null
  const storageKey = supabaseAuthStorageKey(supabaseUrl)
  if (!storageKey) return null

  const session = sessionFromStoredAuth(await deps.readStorage(storageKey), deps.nowMs ?? Date.now())
  if (!session) return null

  const profileUrl =
    `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(session.userId)}` +
    '&select=resume_file_path,resume_file_name'
  const profileRes = await deps.fetchImpl(profileUrl, { headers: authHeaders(deps.anonKey, session.accessToken) })
  if (!profileRes.ok) return null

  const body = (await profileRes.json()) as
    | { resume_file_path?: string | null; resume_file_name?: string | null }
    | Array<{ resume_file_path?: string | null; resume_file_name?: string | null }>
  const profile = Array.isArray(body) ? body[0] : body
  if (!profile) return null

  const objectPath = resumeObjectPath(profile.resume_file_path, session.userId)
  if (!objectPath) return null

  const encoded = objectPath.split('/').map(encodeURIComponent).join('/')
  const downloadUrl = `${supabaseUrl}/storage/v1/object/authenticated/${RESUME_BUCKET}/${encoded}`
  const fileRes = await deps.fetchImpl(downloadUrl, {
    headers: authHeaders(deps.anonKey, session.accessToken),
  })
  if (!fileRes.ok) return null

  const bytes = new Uint8Array(await fileRes.arrayBuffer())
  if (bytes.byteLength === 0) return null

  const fileName = resumeDisplayName(profile.resume_file_name, objectPath)
  const mime = resumeMimeType(fileName, fileRes.headers.get('content-type'))
  return new File([bytes], fileName, { type: mime })
}

function inlined(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

// Direct import.meta.env.VITE_* access so the content-script build inlines it.
// A dynamic env[name] lookup stays empty in that bundle.
function viteEnv(name: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY'): string | undefined {
  try {
    if (name === 'VITE_SUPABASE_URL') return inlined(import.meta.env.VITE_SUPABASE_URL)
    return inlined(import.meta.env.VITE_SUPABASE_ANON_KEY)
  } catch {
    return undefined
  }
}

function readChromeLocal(
  storage: { get: (key: string, callback: (items: Record<string, unknown>) => void) => void },
  key: string,
): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      storage.get(key, (items) => {
        const value = items?.[key]
        resolve(typeof value === 'string' ? value : null)
      })
    } catch {
      resolve(null)
    }
  })
}

function toBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value.byteLength > 0 ? value : null
  if (value instanceof ArrayBuffer) {
    const bytes = new Uint8Array(value)
    return bytes.byteLength > 0 ? bytes : null
  }
  if (Array.isArray(value) && value.length > 0 && value.every((part) => typeof part === 'number')) {
    return new Uint8Array(value)
  }
  return null
}

// The service worker replies with this shape. A content-script fetch would be
// blocked by the apply page's connect-src, so the bytes come back over
// chrome.runtime.sendMessage instead.
export function fileFromSavedResumeMessage(message: unknown): File | null {
  if (!message || typeof message !== 'object') return null
  const record = message as { ok?: unknown; fileName?: unknown; mimeType?: unknown; bytes?: unknown }
  if (record.ok !== true || typeof record.fileName !== 'string' || !record.fileName.trim()) return null
  const bytes = toBytes(record.bytes)
  if (!bytes) return null
  const mime =
    typeof record.mimeType === 'string' && record.mimeType.trim()
      ? record.mimeType
      : 'application/octet-stream'
  return new File([bytes], record.fileName, { type: mime })
}

export async function requestSavedResume(): Promise<File | null> {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return null
    const message = await chrome.runtime.sendMessage({ action: 'loadSavedResume' })
    return fileFromSavedResumeMessage(message)
  } catch {
    return null
  }
}

// Used by the service worker. No session, no path, or an empty object means
// there is no saved resume — callers leave the file input empty.
export async function loadSavedResumeFromAccount(): Promise<File | null> {
  try {
    const supabaseUrl = viteEnv('VITE_SUPABASE_URL')
    const anonKey = viteEnv('VITE_SUPABASE_ANON_KEY')
    if (!supabaseUrl || !anonKey) return null
    const storage = globalThis.chrome?.storage?.local
    if (!storage?.get || typeof globalThis.fetch !== 'function') return null
    return await loadSavedResumeFile({
      supabaseUrl,
      anonKey,
      readStorage: (key) => readChromeLocal(storage, key),
      fetchImpl: globalThis.fetch.bind(globalThis),
    })
  } catch {
    return null
  }
}
