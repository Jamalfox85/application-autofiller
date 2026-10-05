// The uploaded resume is not kept in the profile mirror. chrome.storage
// personalInfo only has resumeFileName. The bytes live in the private Supabase
// storage bucket "resumes", and the active profile's candidate_profiles.resume_file_path
// is "{userId}/{profileId}/resume.pdf" (or .docx; backfilled Primary profiles may still
// have the legacy "{userId}/resume.pdf"). resume_file_name is the original filename.
import { supabasePublicConfigError } from '../../lib/supabaseConfig.ts'
import { ACTIVE_PROFILE_KEY, parseActiveProfile } from '../../lib/sync/activeProfile.ts'
import { fetchActiveProfileResumeRow } from '../activeProfileResume.ts'

const RESUME_BUCKET = 'resumes'

export type SavedResumeDeps = {
  supabaseUrl: string
  anonKey: string
  readStorage: (key: string) => Promise<string | null>
  // Profile whose mirror the fill uses. Missing → the account's active_profile_id.
  readActiveProfileId?: () => Promise<string | null>
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

function fileExtension(value: string): string {
  const base = value.split('/').pop() || ''
  const dot = base.lastIndexOf('.')
  if (dot <= 0 || dot === base.length - 1) return ''
  return base.slice(dot + 1).toLowerCase()
}

// resume_file_name is the original filename (admin-resume.docx).
// resume_file_path is the object ({userId}/{profileId}/resume.docx, or an older
// {userId}/resume.pdf). When those extensions disagree, the path is a leftover
// object — do not download it. The saved file is the canonical object for the
// filename's extension, in the same folder. This runs in the shared loadSavedResume worker, so a
// docx profile no longer returns the leftover pdf on any board that uses it.
export function resumeObjectForProfile(
  path: string | null | undefined,
  fileName: string | null | undefined,
  userId: string,
): string | null {
  const stored = resumeObjectPath(path, userId)
  if (!stored) return null
  const nameExt = fileExtension(fileName || '')
  const storedExt = fileExtension(stored)
  if (!nameExt || nameExt === storedExt) return stored
  if (nameExt !== 'pdf' && nameExt !== 'docx' && nameExt !== 'doc') return stored
  const folder = stored.split('/').slice(0, -1).join('/')
  return resumeObjectPath(`${folder}/resume.${nameExt}`, userId)
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

  const activeId = deps.readActiveProfileId ? await deps.readActiveProfileId().catch(() => null) : null
  const profile = await fetchActiveProfileResumeRow(
    async (url) => {
      const res = await deps.fetchImpl(url, { headers: authHeaders(deps.anonKey, session.accessToken) })
      if (!res.ok) return null
      return res.json().catch(() => null)
    },
    supabaseUrl,
    session.userId,
    activeId,
  )
  if (!profile) return null

  const objectPath = resumeObjectForProfile(
    profile.resume_file_path,
    profile.resume_file_name,
    session.userId,
  )
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

// chrome.runtime.sendMessage JSON-serializes the worker reply. The Uint8Array
// arrives as {"0":80,"1":75}, which is not a file. The worker also sends
// bytesBase64. Greenhouse and Ashby decode that in their own callers.
// requestSavedResume stays on the typed-array path for the other boards.
export function fileFromBambooSavedResumeMessage(message: unknown): File | null {
  const direct = fileFromSavedResumeMessage(message)
  if (direct) return direct
  if (!message || typeof message !== 'object') return null
  const record = message as { bytesBase64?: unknown }
  if (typeof record.bytesBase64 !== 'string' || !record.bytesBase64.trim()) return null
  const bytes = bytesFromBase64(record.bytesBase64)
  if (!bytes) return null
  return fileFromSavedResumeMessage({ ...(message as Record<string, unknown>), bytes })
}

export async function requestBambooSavedResume(): Promise<File | null> {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return null
    const message = await chrome.runtime.sendMessage({ action: 'loadSavedResume' })
    return fileFromBambooSavedResumeMessage(message)
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
      readActiveProfileId: () =>
        new Promise((resolve) => {
          try {
            storage.get(ACTIVE_PROFILE_KEY, (items: Record<string, unknown>) => {
              resolve(parseActiveProfile(items?.[ACTIVE_PROFILE_KEY])?.id ?? null)
            })
          } catch {
            resolve(null)
          }
        }),
      fetchImpl: globalThis.fetch.bind(globalThis),
    })
  } catch {
    return null
  }
}
